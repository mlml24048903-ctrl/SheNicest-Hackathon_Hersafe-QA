// 规则库 v1 类型定义 —— 对齐 tace.md §7.1「每条规则至少包含」的全部字段。
// 编写源头为本目录的 TS 数据文件（决策 D2），seed 时镜像入库 prisma.Rule 表。
import type { HealthDimension, RulePackCode } from "@/lib/types";

export type { RulePackCode };

/** 来源等级（tace.md §7）：A 法律法规 / B 标准指南 / C 系统综述共识 / D 用户研究 */
export type SourceLevel = "A" | "B" | "C" | "D";

export interface SourceCitation {
  level: SourceLevel;
  /** 引用名称，与 tace.md §14 参考依据清单保持一致 */
  ref: string;
  /** 条款/章节号或核验备注 */
  clause?: string;
}

export interface RuleV1 {
  /** 全局唯一编号：<PACK>-<DIM>-<NNN>，DIM ∈ SAFT/AUTN/PRIV/DIGN/EQTY/HLP */
  rule_id: string;
  version: string;
  pack: RulePackCode;
  dimension: HealthDimension;
  /** 短标题（报告/徽标引用） */
  title: string;
  /** 规范性要求 */
  normative_requirement: string;
  /** 女性健康关联伤害路径 */
  harm_path: string;
  /** 适用条件（确定性筛选锚点；空数组表示不限） */
  applicability: {
    /** ProductType 枚举值列表 */
    product_types: string[];
    /** 目标人群关键词 */
    populations: string[];
    /** 功能特征关键词（小写英文），匹配项目 coreTasks/healthClaims 文本 */
    features: string[];
  };
  /** 不适用/排除条件（判定时给模型与人工核对） */
  not_applicable_if: string[];
  /** 必需证据（驱动补证待办） */
  required_evidence: string[];
  observable_checkpoints: string[];
  /** 待办追问模板 */
  follow_up_questions: string[];
  /** 三分支判定标准 */
  verdict: { pass: string; fail: string; insufficient: string };
  severity_guidance: { high: string; medium: string; low: string };
  remediation: { suggestion: string; side_effects?: string };
  gwt_template: { given: string; when: string; then: string };
  sources: SourceCitation[];
  meta: {
    author: string;
    reviewer?: string;
    coi?: string;
    published_at: string; // YYYY-MM-DD
    review_due_at: string; // YYYY-MM-DD
    /** 未复核草稿：不进入默认注入集 */
    draft: boolean;
  };
}

export const RULESET_VERSION = "v1.0.0";

export const DIM_CODE_TO_DIMENSION: Record<string, HealthDimension> = {
  SAFT: "health_safety",
  AUTN: "autonomy",
  PRIV: "privacy_control",
  DIGN: "dignity",
  EQTY: "equity",
  HLP: "help_redress",
};

/** 统一元信息工厂：省略逐条重复的版本与 meta 字段 */
export function defineRule(r: Omit<RuleV1, "version" | "meta"> & { meta?: Partial<RuleV1["meta"]> }): RuleV1 {
  return {
    ...r,
    version: RULESET_VERSION,
    meta: {
      author: "她测规则组（初稿）",
      published_at: "2026-08-27",
      review_due_at: "2027-08-27",
      draft: true,
      ...r.meta,
    },
  };
}
