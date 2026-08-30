// 规则库加载与版本管理 —— v1 女性健康定位（tace.md §5/§7）
// 编写源头为 data/v1 目录的 TS 数据文件（决策 D2）；本文件只做聚合与检索。
import { BASE_RULES } from "@/lib/rules/data/v1/base";
import { MENS_RULES } from "@/lib/rules/data/v1/mens";
import { PREG_RULES } from "@/lib/rules/data/v1/preg";
import { HDAI_RULES } from "@/lib/rules/data/v1/hdai";
import { RULESET_VERSION, type RuleV1, type RulePackCode } from "@/lib/rules/data/v1/types";
import type { HealthDimension } from "@/lib/types";

export { RULESET_VERSION, type RuleV1 };
export const RULES_VERSION = RULESET_VERSION; // 兼容别名（缓存/调用记录沿用旧符号名）
export type SafetyRule = RuleV1; // 兼容别名

const ALL_RULES: RuleV1[] = [...BASE_RULES, ...MENS_RULES, ...PREG_RULES, ...HDAI_RULES].sort((a, b) =>
  a.rule_id.localeCompare(b.rule_id),
);

/** 全量规则（按 rule_id 排序保证稳定顺序） */
export function getAllRules(): RuleV1[] {
  return [...ALL_RULES];
}

/** 按规则包过滤 */
export function getRulesByPack(pack: RulePackCode): RuleV1[] {
  return ALL_RULES.filter((r) => r.pack === pack);
}

/** 按六维过滤 */
export function getRulesByDimension(dim: HealthDimension): RuleV1[] {
  return ALL_RULES.filter((r) => r.dimension === dim);
}

/** 按 rule_id 精确查找 */
export function getRuleById(ruleId: string): RuleV1 | undefined {
  return ALL_RULES.find((r) => r.rule_id === ruleId);
}

/** 兼容旧签名的维度裁剪入口（新链路请使用 rule-service.getRulesForPacks） */
export function getRulesForContext(dims: HealthDimension[]): RuleV1[] {
  const set = new Set(dims);
  return ALL_RULES.filter((r) => set.has(r.dimension));
}

/** 规则摘要紧凑形态（发送给模型的列表项） */
export function rulesToPromptText(rules: RuleV1[]): string {
  return rules
    .map(
      (r) =>
        `- [${r.rule_id}]（${r.dimension}）${r.title}\n  要求：${r.normative_requirement}\n  必需证据：${r.required_evidence.join("；")}`,
    )
    .join("\n");
}
