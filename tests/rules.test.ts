// 规则库 v1 与评测集 v1 质量门禁（tace.md §7：每条规则有来源/版本/适用条件/判定标准）
import { describe, expect, it } from "vitest";
import { getAllRules, getRuleById, getRulesByPack, getRulesByDimension, RULESET_VERSION } from "@/lib/rules";
import { EVALSET_V1 } from "@/lib/rules/data/evalset.v1";
import type { HealthDimension, RulePackCode } from "@/lib/types";

const DIMS: HealthDimension[] = [
  "health_safety",
  "autonomy",
  "privacy_control",
  "dignity",
  "equity",
  "help_redress",
];
const PACKS: RulePackCode[] = ["BASE", "MENS", "PREG", "HDAI"];

describe("规则库 v1 结构门禁", () => {
  const rules = getAllRules();

  it("规模 ≥40 条且按四包规划分布（BASE14/MENS12/PREG10/HDAI8）", () => {
    expect(rules.length).toBeGreaterThanOrEqual(40);
    expect(getRulesByPack("BASE").length).toBe(14);
    expect(getRulesByPack("MENS").length).toBe(12);
    expect(getRulesByPack("PREG").length).toBe(10);
    expect(getRulesByPack("HDAI").length).toBe(8);
  });

  it("rule_id 全局唯一且符合编号规范 <PACK>-<DIM>-<NNN>", () => {
    const ids = rules.map((r) => r.rule_id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^(BASE|MENS|PREG|HDAI)-(SAFT|AUTN|PRIV|DIGN|EQTY|HLP)-\d{3}$/);
    }
  });

  it("rule_id 的包前缀与 pack 字段一致；维度编码映射到六维", () => {
    const DIM_MAP: Record<string, HealthDimension> = {
      SAFT: "health_safety",
      AUTN: "autonomy",
      PRIV: "privacy_control",
      DIGN: "dignity",
      EQTY: "equity",
      HLP: "help_redress",
    };
    for (const r of rules) {
      const [packCode, dimCode] = r.rule_id.split("-");
      expect(r.pack).toBe(packCode as RulePackCode);
      expect(r.dimension).toBe(DIM_MAP[dimCode]);
      expect(DIMS).toContain(r.dimension);
    }
    void PACKS;
  });

  it("每条规则全字段完整（tace.md §7.1）", () => {
    for (const r of rules) {
      expect(r.title.length).toBeGreaterThan(5);
      expect(r.normative_requirement.length).toBeGreaterThan(10);
      expect(r.harm_path.length).toBeGreaterThan(10);
      // 适用条件结构完整
      expect(Array.isArray(r.applicability.product_types)).toBe(true);
      expect(Array.isArray(r.applicability.features)).toBe(true);
      expect(Array.isArray(r.not_applicable_if)).toBe(true);
      // 必需证据与检查点非空
      expect(r.required_evidence.length).toBeGreaterThan(0);
      expect(r.observable_checkpoints.length).toBeGreaterThan(0);
      expect(r.follow_up_questions.length).toBeGreaterThan(0);
      // 三分支判定标准
      expect(r.verdict.pass.length).toBeGreaterThan(4);
      expect(r.verdict.fail.length).toBeGreaterThan(4);
      expect(r.verdict.insufficient.length).toBeGreaterThan(4);
      // 严重度指导三档
      expect(r.severity_guidance.high.length).toBeGreaterThan(2);
      expect(r.severity_guidance.medium.length).toBeGreaterThan(2);
      expect(r.severity_guidance.low.length).toBeGreaterThan(2);
      // 整改建议 + GWT 模板
      expect(r.remediation.suggestion.length).toBeGreaterThan(8);
      expect(r.gwt_template.given.length).toBeGreaterThan(4);
      expect(r.gwt_template.when.length).toBeGreaterThan(4);
      expect(r.gwt_template.then.length).toBeGreaterThan(6);
      // 来源 ≥1 且等级 ∈ A-D
      expect(r.sources.length).toBeGreaterThanOrEqual(1);
      for (const s of r.sources) {
        expect(["A", "B", "C", "D"]).toContain(s.level);
        expect(s.ref.length).toBeGreaterThan(3);
      }
      // 元信息：版本一致、复审晚于发布
      expect(r.version).toBe(RULESET_VERSION);
      expect(r.meta.published_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.meta.review_due_at > r.meta.published_at).toBe(true);
      expect(typeof r.meta.draft).toBe("boolean");
    }
  });

  it("检索函数可用：byId / byPack / byDimension", () => {
    expect(getRuleById("MENS-PRIV-001")?.dimension).toBe("privacy_control");
    expect(getRuleById("NOT-EXIST-999")).toBeUndefined();
    expect(getRulesByPack("PREG").every((r) => r.pack === "PREG")).toBe(true);
    for (const d of DIMS) {
      expect(getRulesByDimension(d).length).toBeGreaterThan(0);
    }
  });
});

describe("评测集 v1 引用完整性", () => {
  it("版本号与规模合理", () => {
    expect(EVALSET_V1.length).toBeGreaterThanOrEqual(12);
  });

  it("五类类别均有覆盖", () => {
    for (const cat of ["risk_detect", "refusal", "todo_generation", "protected", "not_applicable"] as const) {
      expect(EVALSET_V1.filter((c) => c.category === cat).length).toBeGreaterThan(0);
    }
  });

  it("案例字段完整且规则引用真实存在", () => {
    for (const c of EVALSET_V1) {
      expect(c.case_id).toMatch(/^(RD|RF|TG|PT|NA|BS)-\d{2}$/);
      expect(c.materials.length).toBeGreaterThan(15);
      for (const rid of c.rules) {
        expect(getRuleById(rid), `未知规则 ${rid}`).toBeDefined();
      }
      for (const f of c.expected_findings) {
        expect(getRuleById(f.rule_id), `期望结论引用未知规则 ${f.rule_id}`).toBeDefined();
      }
      if (c.category === "refusal") {
        expect(c.expected_refusals.length).toBeGreaterThan(0);
      }
    }
  });
});
