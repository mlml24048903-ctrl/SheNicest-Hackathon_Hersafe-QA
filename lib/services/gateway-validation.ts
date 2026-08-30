// 网关业务后校验层（M3）：模型自由度收敛的最后防线。
// 1) rule_id 白名单：输出中的规则编号必须来自本次注入集；
// 2) 引用回查：sources / fact_sources 键必须存在于 EvidencePackage.sourceIndex；
// 3) baseline_issue 服务端派生（决策 D3）：BASE/HDAI 包规则的失败结论统一映射为通用基础问题，
//    模型永远不直接产出该类型。
// 全部纯函数（tests/gateway-validation.test.ts）。
import type { ContinueTodoOutput, FindingType, InitialAnalysis } from "@/lib/types";
import type { RuleV1 } from "@/lib/rules";

export interface ValidationCtx {
  /** 本次调用注入的合法规则 id 集 */
  allowedRuleIds?: Set<string>;
  /** EvidencePackage.sourceIndex 的合法键集 */
  sourceKeys?: Set<string>;
  /** 当前待办允许更新的唯一结论 id */
  currentFindingId?: string | null;
  /** 当前项目内可以作为跨风险影响目标的结论 id */
  allowedFindingIds?: Set<string>;
}

export interface ValidatedResult<T> {
  result: T;
  warnings: string[];
}

function filterSourceKeys(keys: string[], ctx: ValidationCtx, label: string, warnings: string[]): string[] {
  if (!ctx.sourceKeys || ctx.sourceKeys.size === 0) return keys;
  const kept = keys.filter((k) => ctx.sourceKeys!.has(k));
  const dropped = keys.filter((k) => !ctx.sourceKeys!.has(k));
  for (const d of dropped) warnings.push(`${label} 引用了不存在于 sourceIndex 的键「${d}」，已剔除`);
  return kept;
}

/** 校验初始分析结果：伪规则剥离 + 引用键回查 */
export function validateAnalyzeResult(
  analysis: InitialAnalysis,
  ctx: ValidationCtx,
): ValidatedResult<InitialAnalysis> {
  const warnings: string[] = [];
  const out: InitialAnalysis = { ...analysis };

  // 初始结论：只允许两类（Schema 已限，二次防御）；伪规则整体丢弃
  out.initial_findings = analysis.initial_findings.filter((f) => {
    if (f.rule_id && ctx.allowedRuleIds && !ctx.allowedRuleIds.has(f.rule_id)) {
      warnings.push(`初始 Finding「${f.title}」引用了未注入的规则 ${f.rule_id}，已剥离`);
      return false;
    }
    return true;
  });
  out.initial_findings = out.initial_findings.map((f) => ({
    ...f,
    sources: filterSourceKeys(f.sources, ctx, `[${f.rule_id ?? "无规则"}]`, warnings),
  }));

  // 待办：保留价值但切断伪造规则关联
  out.todos = analysis.todos.map((t) => {
    if (t.rule_id && ctx.allowedRuleIds && !ctx.allowedRuleIds.has(t.rule_id)) {
      warnings.push(`待办「${t.title}」关联了未注入的规则 ${t.rule_id}，已改为无规则关联`);
      return { ...t, rule_id: null };
    }
    return t;
  });

  // 缺口：过滤未知规则引用
  out.evidence_gaps = analysis.evidence_gaps.map((g) => ({
    ...g,
    related_rule_ids: g.related_rule_ids.filter((id) => !ctx.allowedRuleIds || ctx.allowedRuleIds.has(id)),
  }));

  return { result: out, warnings };
}

/** 校验增量输出：fact_sources 键回查（结构错误由 Schema 兜底） */
export function validateContinueOutput(
  output: ContinueTodoOutput,
  ctx: ValidationCtx,
): ValidatedResult<ContinueTodoOutput> {
  const warnings: string[] = [];
  if (output.kind !== "sufficient") return { result: output, warnings };
  const factSources = filterSourceKeys(output.fact_sources, ctx, "拟写入事实来源", warnings);
  const currentFindingId = ctx.currentFindingId ?? null;
  if (output.affected_finding_id && output.affected_finding_id !== currentFindingId) {
    warnings.push("模型返回的受影响结论与当前待办不一致，已改为当前待办关联结论");
  }
  let riskUpdatePreview = output.risk_update_preview;
  if (riskUpdatePreview && riskUpdatePreview.finding_id !== currentFindingId) {
    warnings.push("模型返回的风险更新目标与当前待办不一致，已改为当前待办关联结论");
    riskUpdatePreview = { ...riskUpdatePreview, finding_id: currentFindingId ?? "" };
  }
  const crossRiskImpact = output.cross_risk_impact.filter((impact) => {
    const valid = Boolean(ctx.allowedFindingIds?.has(impact.finding_id)) && impact.finding_id !== currentFindingId;
    if (!valid) warnings.push(`跨风险影响引用了当前项目之外或当前待办自身的结论「${impact.finding_id}」，已剔除`);
    return valid;
  });
  return {
    result: {
      ...output,
      fact_sources: factSources,
      affected_finding_id: currentFindingId,
      risk_update_preview: riskUpdatePreview,
      cross_risk_impact: crossRiskImpact,
    },
    warnings,
  };
}

/**
 * 服务端派生最终结论类型：
 * BASE/HDAI 通用底座规则的失败结论一律映射为 baseline_issue（通用底线不包装成女性专项），
 * 不适用判定缺 naBasis 时由调用方降级处理。
 */
export function resolveServerFindingType(newType: FindingType, rule: RuleV1 | undefined | null): FindingType {
  if (
    (newType === "confirmed_risk" || newType === "unverified_risk") &&
    rule &&
    (rule.pack === "BASE" || rule.pack === "HDAI")
  ) {
    return "baseline_issue";
  }
  return newType;
}
