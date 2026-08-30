// 网关业务后校验单测：伪规则剥离、引用键回查、baseline_issue 服务端派生
import { describe, expect, it } from "vitest";
import {
  validateAnalyzeResult,
  validateContinueOutput,
  resolveServerFindingType,
} from "@/lib/services/gateway-validation";
import type { InitialAnalysis, ContinueTodoOutput } from "@/lib/types";
import { InitialAnalysisSchema } from "@/lib/types";
import { getRuleById } from "@/lib/rules";

const baseAnalysis: InitialAnalysis = {
  product_summary: { name: "X", domain: "D", summary: "S" },
  pages: [],
  flows: [],
  interactions: [],
  evidence_gaps: [
    { gap_id: "G1", description: "缺通知页", related_rule_ids: ["MENS-PRIV-001", "FAKE-RULE-001"] },
  ],
  material_conflicts: [],
  todos: [
    { title: "T1", priority: "high", reason: "R", evidence_refs: [], rule_id: "FAKE-RULE-002" },
    { title: "T2", priority: "low", reason: "R", evidence_refs: [], rule_id: "MENS-PRIV-001" },
  ],
  initial_findings: [
    {
      title: "F1",
      type: "unverified_risk",
      severity: "medium",
      dimension: "privacy_control",
      risk_basis: "",
      rule_id: "FAKE-FINDING-003",
      sources: ["S9"],
      observed: [],
      inference: "",
      suggestion: "",
      status: "hypothesis",
    },
    {
      title: "F2",
      type: "requirement_gap",
      severity: "low",
      dimension: "autonomy",
      risk_basis: "",
      rule_id: "MENS-AUTN-001",
      sources: ["S1", "GHOST"],
      observed: [],
      inference: "",
      suggestion: "",
      status: "hypothesis",
    },
  ],
};

const ctx = {
  allowedRuleIds: new Set(["MENS-PRIV-001", "MENS-AUTN-001"]),
  sourceKeys: new Set(["S1"]),
};

describe("validateAnalyzeResult", () => {
  const { result, warnings } = validateAnalyzeResult(baseAnalysis, ctx);

  it("伪规则的 Finding 被整体剥离并给出 warning", () => {
    expect(result.initial_findings.map((f) => f.title)).toEqual(["F2"]);
    expect(warnings.some((w) => w.includes("FAKE-FINDING-003"))).toBe(true);
  });

  it("待办保留价值但切断伪造规则关联", () => {
    expect(result.todos.map((t) => t.rule_id)).toEqual([null, "MENS-PRIV-001"]);
  });

  it("缺口与 sources 的未知键被回查剔除", () => {
    expect(result.evidence_gaps[0].related_rule_ids).toEqual(["MENS-PRIV-001"]);
    expect(result.initial_findings[0].sources).toEqual(["S1"]);
    expect(warnings.some((w) => w.includes("GHOST"))).toBe(true);
  });
});

describe("validateContinueOutput", () => {
  it("fact_sources 键回查", () => {
    const output: ContinueTodoOutput = {
      kind: "sufficient",
      summary: "s",
      facts_to_record: ["f"],
      fact_sources: ["S1", "NOPE"],
      scope: "",
      affected_finding_id: null,
      risk_update_preview: null,
      cross_risk_impact: [],
    };
    const { result, warnings } = validateContinueOutput(output, ctx);
    expect(result.kind === "sufficient" && result.fact_sources).toEqual(["S1"]);
    expect(warnings.some((w) => w.includes("NOPE"))).toBe(true);
  });

  it("只允许更新当前待办的结论，并剔除项目外的跨风险引用", () => {
    const output: ContinueTodoOutput = {
      kind: "sufficient",
      summary: "s",
      facts_to_record: ["f"],
      fact_sources: ["S1"],
      scope: "当前待办",
      affected_finding_id: "wrong",
      risk_update_preview: {
        finding_id: "wrong",
        new_type: "protected",
        new_severity: "low",
        reason: "已确认保护机制",
        confidence: "high",
        confidence_reason: "有直接证据",
      },
      cross_risk_impact: [
        { finding_id: "F2", why: "影响另一项结论" },
        { finding_id: "OUTSIDE", why: "不属于当前项目" },
      ],
    };
    const { result, warnings } = validateContinueOutput(output, {
      ...ctx,
      currentFindingId: "F1",
      allowedFindingIds: new Set(["F1", "F2"]),
    });
    expect(result.kind).toBe("sufficient");
    if (result.kind !== "sufficient") return;
    expect(result.affected_finding_id).toBe("F1");
    expect(result.risk_update_preview?.finding_id).toBe("F1");
    expect(result.cross_risk_impact).toEqual([{ finding_id: "F2", why: "影响另一项结论" }]);
    expect(warnings.length).toBeGreaterThanOrEqual(3);
  });
});

describe("InitialAnalysisSchema 待办与结论关联", () => {
  it("允许同一规则的多个待办共享一条结论", () => {
    const value = {
      ...baseAnalysis,
      todos: [
        { title: "T1", priority: "high", reason: "R", evidence_refs: [], rule_id: "MENS-PRIV-001" },
        { title: "T2", priority: "medium", reason: "R", evidence_refs: [], rule_id: "MENS-PRIV-001" },
      ],
      initial_findings: [{
        title: "F1", type: "unverified_risk", severity: "medium", dimension: "privacy_control",
        risk_basis: "规则检查点", rule_id: "MENS-PRIV-001", sources: [], observed: [], inference: "待核查",
        suggestion: "补充事实", status: "pending_verify",
      }],
    };
    expect(InitialAnalysisSchema.safeParse(value).success).toBe(true);
  });

  it("缺少对应结论时触发模型修复校验", () => {
    const value = {
      ...baseAnalysis,
      todos: [{ title: "T1", priority: "high", reason: "R", evidence_refs: [], rule_id: "MENS-PRIV-001" }],
      initial_findings: [],
    };
    const parsed = InitialAnalysisSchema.safeParse(value);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0]?.message).toContain("缺少对应的待核查结论");
  });
});

describe("resolveServerFindingType 服务端派生", () => {
  it("BASE/HDAI 包的失败结论映射为 baseline_issue", () => {
    expect(resolveServerFindingType("confirmed_risk", getRuleById("BASE-SAFT-001"))).toBe("baseline_issue");
    expect(resolveServerFindingType("unverified_risk", getRuleById("HDAI-SAFT-001"))).toBe("baseline_issue");
  });
  it("MENS/PREG 女性专项保持原类型", () => {
    expect(resolveServerFindingType("confirmed_risk", getRuleById("MENS-PRIV-001"))).toBe("confirmed_risk");
    expect(resolveServerFindingType("unverified_risk", getRuleById("PREG-HLP-001"))).toBe("unverified_risk");
  });
});
