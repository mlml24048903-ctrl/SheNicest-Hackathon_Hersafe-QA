// 自动化测试专用的确定性生成器。生产环境不会进入这条路径。
// 输出与真实调用同构且符合 Schema，用于验证状态机、规则注入与异常分支。

import type { ContinueTodoOutput, InitialAnalysis, VerifyHighRiskOutput } from "@/lib/types";
import type { RuleV1 } from "@/lib/rules";

/** 确定性伪随机（避免测试抖动）：基于种子的简单散列取值 */
function seededPick<T>(seed: string, arr: T[]): T {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return arr[h % arr.length];
}

interface StaticRiskSignal {
  type: "notification" | "share" | "network" | "export" | "deletion" | "local_storage";
  title: string;
  description: string;
  source_key: string | null;
  file_path: string;
  start_line: number;
}

function parseStaticRiskSignals(evidenceSummary: string): StaticRiskSignal[] {
  const marker = "【代码风险线索】";
  const start = evidenceSummary.indexOf(marker);
  if (start < 0) return [];
  const line = evidenceSummary.slice(start + marker.length).split(/\n\n【/)[0].trim();
  try {
    const parsed = JSON.parse(line);
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.type === "string") : [];
  } catch {
    return [];
  }
}

/** Mock 初始分析：只为源码中实际出现的能力匹配规则，不用“材料没提供”制造无关待办。 */
export function mockAnalyzeProject(evidenceSummary: string, rules: RuleV1[]): InitialAnalysis {
  const hasScreenshot = evidenceSummary.includes("截图");
  const hasUrl = evidenceSummary.includes("网站") || evidenceSummary.includes("URL");
  const hasDoc = evidenceSummary.includes("文档") || evidenceSummary.includes("PDF");
  const hasCode = evidenceSummary.includes("【代码静态分析】");
  const signals = parseStaticRiskSignals(evidenceSummary);
  const ruleById = new Map(rules.map((rule) => [rule.rule_id, rule]));
  const ruleForSignal: Record<StaticRiskSignal["type"], string> = {
    notification: "MENS-PRIV-001",
    share: "BASE-PRIV-002",
    network: "BASE-PRIV-003",
    export: "BASE-PRIV-004",
    deletion: "BASE-PRIV-005",
    local_storage: "BASE-PRIV-003",
  };
  const matched = signals.map((signal) => ({ signal, rule: ruleById.get(ruleForSignal[signal.type]) })).filter((item): item is { signal: StaticRiskSignal; rule: RuleV1 } => Boolean(item.rule));
  const uniqueMatches = matched.filter((item, index) => matched.findIndex((candidate) => candidate.rule.rule_id === item.rule.rule_id) === index).slice(0, 5);

  return {
    product_summary: {
      name: "待确认产品",
      domain: hasCode ? "代码包所描述的数字产品" : "待确认的女性健康数字产品",
      summary: `材料构成：${
        [hasUrl && "网站抓取", hasScreenshot && "截图", hasDoc && "文档", hasCode && "代码静态分析"].filter(Boolean).join("、") ||
        "仅少量材料"
      }。${signals.length ? `静态代码中识别到 ${signals.length} 类需要结合规则核对的能力。` : hasCode ? "静态代码中未发现明确的数据外传或敏感展示路径；此结论不覆盖运行环境和未读取依赖。" : "产品理解待用户确认。"}`,
    },
    pages: [],
    flows: [],
    interactions: [],
    evidence_gaps: uniqueMatches.map(({ rule, signal }, i) => ({
      gap_id: `G${i + 1}`,
      description: `源码确认存在“${signal.title}”相关路径，但静态代码不能证明实际运行呈现。还需核对：${rule.required_evidence.join("；")}`,
      related_rule_ids: [rule.rule_id],
    })),
    material_conflicts: [],
    todos: uniqueMatches.map(({ rule, signal }) => ({
      title: `确认${signal.title}的实际表现`,
      priority: (["notification", "share", "network"].includes(signal.type) ? "high" : "medium") as "high" | "medium",
      reason: `代码中已经确认：${signal.description.replace(/^代码包含/, "存在")} 还需要确认：这项功能实际运行时会向用户显示什么，以及相关数据最终会保存、发送、保留或删除到哪里。`,
      evidence_refs: signal.source_key ? [signal.source_key] : [],
      rule_id: rule.rule_id,
    })),
    // 不变量：Mock 初始分析只输出 hypothesis / pending_verify，绝不输出 confirmed_risk
    initial_findings: uniqueMatches.map(({ rule, signal }) => ({
      title: `${signal.title}仍需运行证据确认`,
      type: "unverified_risk" as const,
      severity: "medium" as const,
      dimension: rule.dimension,
      risk_basis: rule.observable_checkpoints[0] ?? "",
      rule_id: rule.rule_id,
      sources: signal.source_key ? [signal.source_key] : [],
      observed: [`源码存在：${signal.title}`, `位置：${signal.file_path}:${signal.start_line}`],
      inference: `源码能够定位相关能力，但尚未运行，不能据此判断实际呈现是否符合规则 ${rule.rule_id}。`,
      suggestion: `补充运行证据：${rule.required_evidence.join("；")}`,
      status: "hypothesis" as const,
    })),
  };
}

/**
 * Mock 待办对话：轮次 <2 且未见确认词时追问；
 * 确认词命中后按关键词确定性派生 not_applicable / protected 预览（其余返回无预览摘要）。
 */
export function mockContinueTodo(_ruleTitle: string, userInput: string, round: number): ContinueTodoOutput {
  const sufficientHint = /已经有|已支持|不存在|没有这个|已保护|确认|截图已上传|不涉及/.test(userInput);
  if (!sufficientHint && round < 2) {
    return {
      kind: "need_info",
      question: "还需核对实际运行时的默认状态和用户可见结果。请说明触发这项操作后页面显示什么、数据是否会被保存或发送；也可以上传对应截图。",
    };
  }

  // 用户已给出可用事实 → 依关键词确定性派生预览
  if (/不涉及|没有这个功能|产品没有/.test(userInput)) {
    return {
      kind: "sufficient",
      summary: `拟记录用户确认：「${userInput.slice(0, 120)}」。产品不涉及该功能场景，规则判为不适用。`,
      facts_to_record: [`用户确认：${userInput.slice(0, 120)}`],
      fact_sources: ["用户对话输入"],
      scope: "仅影响本待办关联的 Finding",
      affected_finding_id: null, // 服务端按待办关联填充
      risk_update_preview: {
        finding_id: "",
        new_type: "not_applicable",
        new_severity: "low",
        reason: "用户明确表示产品不含该功能场景",
        confidence: "medium",
        confidence_reason: "结论完全基于用户单方陈述，建议留存界面佐证",
        na_basis: "用户确认产品不包含该功能能力",
      },
      cross_risk_impact: [],
    };
  }
  if (/已有保护|已保护|默认隐藏|有开关|已加密|不可见|已有该设计|已经支持|已支持/.test(userInput)) {
    return {
      kind: "sufficient",
      summary: `拟记录用户确认：「${userInput.slice(0, 120)}」。产品已有对应保护机制。`,
      facts_to_record: [`用户确认：${userInput.slice(0, 120)}`],
      fact_sources: ["用户对话输入"],
      scope: "仅影响本待办关联的 Finding",
      affected_finding_id: null,
      risk_update_preview: {
        finding_id: "",
        new_type: "protected",
        new_severity: "low",
        reason: "用户确认保护机制存在并有可用入口",
        confidence: "medium",
        confidence_reason: "依赖用户口述，缺少界面截图硬证据",
      },
      cross_risk_impact: [],
    };
  }
  return {
    kind: "sufficient",
    summary: `拟记录用户确认事实：「${userInput.slice(0, 120)}」，适用于本待办关联的风险判定范围。`,
    facts_to_record: [`用户确认：${userInput.slice(0, 120)}`],
    fact_sources: ["用户对话输入"],
    scope: "仅影响本待办关联的 Finding",
    affected_finding_id: null, // 由服务端按待办关联填充
    risk_update_preview: null, // 无充分判据时不给预览，服务端保持原状
    cross_risk_impact: [],
  };
}

/** Mock 高风险复核：来源为空的结论降级 */
export function mockVerifyHighRisk(
  finding: { sources: string[]; type: string },
  rule: RuleV1 | undefined,
): VerifyHighRiskOutput {
  if (finding.sources.length === 0) {
    return {
      consistent: false,
      issues: ["结论缺少材料来源，不满足可追溯要求"],
      corrected_type: "unverified_risk",
      corrected_severity: "medium",
      reason: "来源为空 → 降级为待验证风险（不变量：证据不足 ≠ 风险）",
    };
  }
  return {
    consistent: true,
    issues: [],
    corrected_type: null,
    corrected_severity: null,
    reason: `证据链与规则 ${rule?.rule_id ?? "-"} 匹配，结论一致`,
  };
}

export function pickDeterministicRule(rules: RuleV1[], seed: string): RuleV1 {
  return seededPick(seed, rules);
}
