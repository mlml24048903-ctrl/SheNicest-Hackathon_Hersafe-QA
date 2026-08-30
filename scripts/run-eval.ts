// 评测跑批（M5）：逐案喂 materials → 网关 → 比对期望 → 八项质量指标（tace.md §10.1）→ 写 EvalRun。
// 用法：pnpm tsx scripts/run-eval.ts   （STEPFUN_API_KEY 为空时自动走 Mock）
process.env.DATABASE_URL ||= "file:./dev.db";

import { prisma } from "@/lib/db";
import { stepfunConfig } from "@/lib/config";
import { analyzeProject } from "@/lib/ai-gateway";
import { recommendPacks, getRulesForPacks } from "@/lib/services/rule-service";
import { validateAnalyzeResult } from "@/lib/services/gateway-validation";
import { getAllRules } from "@/lib/rules";
import { RULESET_VERSION } from "@/lib/rules/data/v1/types";
import { EVALSET_V1, EVALSET_VERSION, type EvalCase } from "@/lib/rules/data/evalset.v1";
import { PROMPT_VERSION } from "@/lib/ai-gateway/prompts";
import type { ProjectProfile } from "@/lib/types";
import { Prisma } from "@prisma/client";

interface CaseVerdict {
  case_id: string;
  passed: boolean;
  notes: string[];
}

/**
 * 初筛阶段的结论等价类：终态类型在初始分析中按产品不变量只允许以
 * 假设形态出现——confirmed_risk 禁产（只能由证据确认后写入），
 * protected/not_applicable 须经用户确认路径产生，baseline_issue 由服务端派生。
 */
const PROVISIONAL_EQUIV: Record<string, string> = {
  confirmed_risk: "unverified_risk",
  protected: "unverified_risk",
  not_applicable: "unverified_risk",
  baseline_issue: "requirement_gap",
};

/** 单案判定：结论类型命中率 / 待办生成 / 拒绝纪律 */
async function runCase(c: EvalCase): Promise<CaseVerdict> {
  const notes: string[] = [];
  const profile: Partial<ProjectProfile> = {
    productType: (c.profile?.productType ?? "other") as ProjectProfile["productType"],
    targetAudience: c.profile?.targetAudience ?? [],
    coreTasks: c.profile?.coreTasks ?? [],
    healthClaims: c.profile?.healthClaims ?? [],
    sensitiveData: (c.profile?.sensitiveData ?? []) as ProjectProfile["sensitiveData"],
    userRoles: [],
  };
  const packs = recommendPacks(profile).map((r) => r.packCode);

  const gw = await analyzeProject({
    evidenceSummary: `【评测材料】${c.materials}\n【材料构成】截图与文档混合样本。`,
    packs,
  });
  // Mock 冒烟口径标记：初始阶段禁产终态结论，Mock 只能验证「管线把期望规则送进了注入集」
  const isMock = gw.mode === "mock";
  const injectedIds = new Set(getRulesForPacks(packs).map((r) => r.rule_id));

  const allowedRuleIds = new Set(getAllRules().map((r) => r.rule_id));
  const { result } = validateAnalyzeResult(gw.result, { allowedRuleIds });

  const producedFindings = result.initial_findings ?? [];
  const producedTodos = result.todos ?? [];

  // 1) 结论对齐：live 走严格等价类；Mock 冒烟只验「期望规则已进入注入集」
  let hits = 0;
  for (const exp of c.expected_findings) {
    const wantType = PROVISIONAL_EQUIV[exp.type] ?? exp.type;
    const byRule = producedFindings.find((f) => f.rule_id === exp.rule_id);
    if (byRule) {
      hits += 1;
      if (byRule.type !== wantType && byRule.type !== exp.type)
        notes.push(`[类型漂移] ${exp.rule_id} 期望暂定态 ${wantType}，实际 ${byRule.type}`);
      continue;
    }
    if (isMock && injectedIds.has(exp.rule_id)) {
      hits += 1;
      continue;
    }
    notes.push(`未命中期望规则 ${exp.rule_id}(${exp.type})`);
  }
  if (c.expected_findings.length && hits < c.expected_findings.length)
    notes.push(`结论命中 ${hits}/${c.expected_findings.length}`);
  if (!c.expected_findings.length && !isMock && producedFindings.length > 0)
    notes.push("期望零结论但产出了假设");

  // 2) 待办期望：关键词命中，或（Mock 冒烟口径下）产生了待办流即可
  for (const kw of c.expected_todos) {
    const ok =
      producedTodos.some((t) => t.title.includes(kw.slice(0, 6))) ||
      (gw.mode === "mock" && producedTodos.length > 0);
    if (!ok) notes.push(`缺少期望待办关键词「${kw}」`);
  }

  // 3) 拒绝纪律：refusal 类案例不得产生 confirmed_risk（初筛 Schema 已限两类，此处为纵深防御）
  if (c.category === "refusal") {
    const bad = producedFindings.filter((f) => (f.type as string) === "confirmed_risk");
    if (bad.length) notes.push(`拒绝类案例产生了 ${bad.length} 条 confirmed_risk`);
  }

  return { case_id: c.case_id, passed: notes.length === 0, notes };
}

async function main() {
  console.log(`开始评测：evalset=${EVALSET_VERSION} 规则库=${RULESET_VERSION}`);
  const verdicts: CaseVerdict[] = [];
  for (const c of EVALSET_V1) {
    const v = await runCase(c);
    verdicts.push(v);
    console.log(`${v.passed ? "✅" : "❌"} ${v.case_id}${v.notes.length ? " · " + v.notes.join("；") : ""}`);
  }

  // ===== 八项指标口径：可自动化项先落地，人工项置 null 说明 =====
  const riskCases = EVALSET_V1.filter((c) => c.category === "risk_detect");
  const refusalCases = EVALSET_V1.filter((c) => c.category === "refusal");
  const caseById = new Map(verdicts.map((v) => [v.case_id, v]));

  const metrics = {
    valid_issue_rate: null as number | null, // 人工抽样标注项
    high_risk_recall:
      riskCases.filter((c) => caseById.get(c.case_id)?.passed).length / Math.max(riskCases.length, 1),
    false_positive_rate:
      1 -
      refusalCases.filter((c) => caseById.get(c.case_id)?.passed).length / Math.max(refusalCases.length, 1),
    citation_correctness: null as number | null, // 由 gateway-validation 警告计数近似；Mock 恒合规
    executability: null as number | null, // 人工抽样项
    consistency: null as number | null, // 需同案连跑两次对比，后续扩展
    schema_pass_rate: null as number | null, // live 模式从 ModelInvocation.result.error 统计
    cost_per_project: 0, // Mock 恒 0；live 汇总 ModelInvocation.cost
    total_cases: verdicts.length,
    passed_cases: verdicts.filter((v) => v.passed).length,
  };

  await prisma.evalRun.create({
    data: {
      evalSetVersion: EVALSET_VERSION,
      model: stepfunConfig().apiKey ? "step-live" : "mock",
      promptVersion: PROMPT_VERSION,
      ruleSetVersion: RULESET_VERSION,
      metrics,
      cases: verdicts as unknown as Prisma.InputJsonValue,
    },
  });
  console.log("\n指标摘要：", JSON.stringify(metrics, null, 2));
  console.log("✅ 评测完成，已写入 EvalRun");
}

main()
  .catch((e) => {
    console.error("❌ 评测失败：", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
