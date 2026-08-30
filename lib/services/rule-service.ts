// 规则服务（M2）：确定性规则包推荐、适用性筛选与 Prompt 注入渲染。
// 全部纯函数、可单测（tests/rule-service.test.ts）。原则：模型自由度收窄——
// 能用确定性代码完成的选择不交给模型（决策 D3/D5）。
import type { RulePackCode } from "@/lib/types";
import { PACK_META } from "@/lib/types";
import { getRulesByPack, type RuleV1 } from "@/lib/rules";

/** 画像输入形态（结构化鸭子类型，向导/评测/网关共用；避免与 zod 推断的标称类型耦合） */
export interface ProfileInputLike {
  productType?: string;
  targetAudience?: readonly string[];
  coreTasks?: readonly string[];
  healthClaims?: readonly string[];
  sensitiveData?: readonly string[];
  userRoles?: readonly string[];
}

export interface PackRecommendation {
  packCode: RulePackCode;
  score: number;
  reason: string;
}

/** 把画像文本字段拼成一篇小写文本供关键词匹配 */
function profileText(p: ProfileInputLike): string {
  return [
    p.productType ?? "",
    ...(p.targetAudience ?? []),
    ...(p.coreTasks ?? []),
    ...(p.healthClaims ?? []),
    ...(p.sensitiveData ?? []),
    ...(p.userRoles ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

/**
 * 确定性规则包推荐（tace.md §4 步骤2）。
 * 规则：BASE 恒选；productType 主决定专项包；AI/推断特征命中加选 HDAI。
 */
export function recommendPacks(profile: ProfileInputLike): PackRecommendation[] {
  const text = profileText(profile);
  const pt = profile.productType ?? "other";
  const out: PackRecommendation[] = [];

  out.push({
    packCode: "BASE",
    score: 100,
    reason: "所有数字健康产品都必须满足通用底线（内容安全/数据保护/技术质量/无障碍），默认启用。",
  });

  if (pt === "period_tracking" || pt === "fertility_ttc") {
    out.push({
      packCode: "MENS",
      score: 95,
      reason: `产品类型为${pt === "period_tracking" ? "经期记录" : "备孕/排卵"}类，覆盖周期数据采集、预测边界、锁屏暴露与删除撤回等经期专项规则。`,
    });
  }

  if (["pregnancy", "postpartum", "maternal_mental"].includes(pt)) {
    out.push({
      packCode: "PREG",
      score: 95,
      reason: "产品类型涉及孕期/产后场景，覆盖孕周匹配建议、危险症状升级、妊娠失败后内容处理等专项规则。",
    });
  }

  const aiHits =
    /\bai\b|ai建议|智能|预测|模型|算法|recommend|inference/i.test(text) ||
    (profile.sensitiveData ?? []).includes("ai_inference");
  if (aiHits) {
    out.push({
      packCode: "HDAI",
      score: 90,
      reason:
        "检测到 AI 建议/预测类能力或健康推断标签，须叠加健康数据与 AI 建议底座规则（可追溯性/人群覆盖/训练限制）。",
    });
  }

  return out;
}

/**
 * 适用性筛选：保留「所选包内 ∧ 产品类型匹配 ∧ 特征可佐证」的规则，
 * 默认剔除 draft 未复核草稿（tace.md §7 复核门槛）。
 */
export function filterApplicableRules(
  rules: RuleV1[],
  profile: ProfileInputLike,
  opts?: { packs?: Set<RulePackCode>; includeDrafts?: boolean },
): RuleV1[] {
  const text = profileText(profile);
  const pt = profile.productType ?? "other";
  return rules.filter((r) => {
    if (opts?.packs && !opts.packs.has(r.pack)) return false;
    if (!opts?.includeDrafts && r.meta.draft) return false;
    const ap = r.applicability;
    if (ap.product_types.length && !ap.product_types.includes(pt)) return false;
    if (ap.features.length) {
      const hit = ap.features.some((f) => text.includes(f.toLowerCase()));
      // 无产品类型限定而特征全不命中 → 视为不适用
      if (!hit) return ap.product_types.length === 0 ? false : true;
    }
    return true;
  });
}

/** 取所选规则包的注入集（draft 全量保留以保证演示可用性，线上复核后收紧） */
export function getRulesForPacks(packs: RulePackCode[], includeDrafts = true): RuleV1[] {
  const set = new Set(packs);
  return getRulesByPack("BASE")
    .concat(...packs.map(getRulesByPack))
    .filter((r) => set.has(r.pack) && (includeDrafts || !r.meta.draft));
}

/** Prompt 注入渲染：紧凑多行 + 上限护栏（成本护栏 cap=16，决策 D5） */
export function renderRulesForPrompt(rules: RuleV1[], cap = 16): string {
  return rules
    .slice(0, cap)
    .map((r) => {
      const topSource = [...r.sources].sort((a, b) => a.level.localeCompare(b.level))[0];
      return [
        `- [${r.rule_id}] ${r.title}（${r.dimension}｜来源等级:${topSource?.level ?? "?"}）`,
        `  要求：${r.normative_requirement}`,
        r.not_applicable_if.length ? `  不适用条件：${r.not_applicable_if.join("；")}` : "",
        `  fail 判定：${r.verdict.fail}`,
        `  必需证据：${r.required_evidence.join("；")}`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
}

/** continueTodo 用：单条规则全量 JSON（含追问模板/严重度指导/GWT 模板） */
export function renderFullRule(rule: RuleV1): string {
  return JSON.stringify(rule, null, 2);
}

/** 规则包元信息汇总（供 /api/rule-packs 与向导展示） */
export function describePacks(): Array<{
  packCode: RulePackCode;
  label: string;
  desc: string;
  total: number;
}> {
  return (Object.keys(PACK_META) as RulePackCode[]).map((code) => ({
    packCode: code,
    ...PACK_META[code],
    total: getRulesByPack(code).length,
  }));
}
