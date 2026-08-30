// 评测集 v1 —— 女性健康定位固定案例集（tace.md §10.1）
// 覆盖五类判定路径：正确风险识别 / 误报拒绝 / 待办生成 / 已有保护 / 不适用与通用基础问题。
// 用途：AI 回归基线 + 八项质量指标计算（scripts/run-eval.ts）。
import type { FindingType, Severity } from "@/lib/types";

export type EvalCategory = "risk_detect" | "refusal" | "todo_generation" | "protected" | "not_applicable";

export interface EvalCase {
  case_id: string;
  category: EvalCategory;
  /** 固定输入样本描述（回归时使用同一样本） */
  materials: string;
  /** 产品画像要点（决定规则包与适用性） */
  profile?: {
    productType: string;
    sensitiveData?: string[];
    coreTasks?: string[];
    healthClaims?: string[];
    targetAudience?: string[];
  };
  /** 期望生成的待办关键词 */
  expected_todos: string[];
  /** 期望的结论类型与严重程度 */
  expected_findings: { type: FindingType; severity: Severity; rule_id: string }[];
  /** 明确不应判为风险的点（材料不足 / 已有保护 / 不适用） */
  expected_refusals: string[];
  /** 命中的 rule_id */
  rules: string[];
}

export const EVALSET_VERSION = "v1.0.0";

export const EVALSET_V1: EvalCase[] = [
  // ===== 一、正确风险识别 =====
  {
    case_id: "RD-01",
    category: "risk_detect",
    materials: "经期App截图：锁屏通知明文显示「排卵期已开始」；通知设置页无隐藏健康内容选项",
    profile: { productType: "period_tracking", sensitiveData: ["cycle"], coreTasks: ["notification"] },
    expected_todos: [],
    expected_findings: [{ type: "confirmed_risk", severity: "high", rule_id: "MENS-PRIV-001" }],
    expected_refusals: [],
    rules: ["MENS-PRIV-001"],
  },
  {
    case_id: "RD-02",
    category: "risk_detect",
    materials:
      "经期App预测页截图：以确定语气给出「安全期：今天」，无任何误差或人群局限说明；文档写明模型为固定28天周期",
    profile: {
      productType: "period_tracking",
      targetAudience: ["pcos", "irregular"],
      coreTasks: ["predict"],
    },
    expected_todos: [],
    expected_findings: [{ type: "confirmed_risk", severity: "high", rule_id: "MENS-EQTY-001" }],
    expected_refusals: [],
    rules: ["MENS-EQTY-001"],
  },
  {
    case_id: "RD-03",
    category: "risk_detect",
    materials: "孕期App截图+文档：流产后次日仍收到「宝宝今天7周啦」推送；设置中无孕育通知总开关",
    profile: { productType: "pregnancy", sensitiveData: ["pregnancy_outcome"], coreTasks: ["push"] },
    expected_todos: [],
    expected_findings: [{ type: "confirmed_risk", severity: "high", rule_id: "PREG-HLP-001" }],
    expected_refusals: [],
    rules: ["PREG-HLP-001"],
  },
  // ===== 二、误报拒绝 =====
  {
    case_id: "RF-01",
    category: "refusal",
    materials: "仅提供经期App首页截图：锁屏通知行为未知，材料未含任何通知相关页面",
    profile: { productType: "period_tracking" },
    expected_todos: ["补充锁屏/通知设置证据"],
    expected_findings: [{ type: "unverified_risk", severity: "medium", rule_id: "MENS-PRIV-001" }],
    expected_refusals: ["不得直接判定锁屏暴露为 confirmed_risk（没有看到 ≠ 没有设计）"],
    rules: ["MENS-PRIV-001"],
  },
  {
    case_id: "RF-02",
    category: "refusal",
    materials: "经前提醒推送文案：「月经将至，记得备好温暖」。语气中性，无羞耻比喻",
    profile: { productType: "period_tracking" },
    expected_todos: [],
    expected_findings: [],
    expected_refusals: ["中性文案不构成 MENS-DIGN-001 风险"],
    rules: ["MENS-DIGN-001"],
  },
  {
    case_id: "RF-03",
    category: "refusal",
    materials: "按钮配色偏灰、层级折叠较深等界面审美反馈",
    profile: { productType: "period_tracking" },
    expected_todos: [],
    expected_findings: [],
    expected_refusals: ["通用 UX 审美问题超出规则库范围"],
    rules: [],
  },
  // ===== 三、待办生成 =====
  {
    case_id: "TG-01",
    category: "todo_generation",
    materials: "经期App文档称「支持导出全部数据」，但未见设置页导出入口截图",
    profile: { productType: "period_tracking", coreTasks: ["export"] },
    expected_todos: ["上传设置页/导出功能截图"],
    expected_findings: [],
    expected_refusals: ["文档自述不可作唯一证据"],
    rules: ["BASE-PRIV-004"],
  },
  {
    case_id: "TG-02",
    category: "todo_generation",
    materials: "AI 经期建议机器人上线；隐私政策未提及训练用途条款，训练开关设置页缺失",
    profile: { productType: "period_tracking", healthClaims: ["AI建议"], sensitiveData: ["ai_inference"] },
    expected_todos: ["补充 AI 训练用途的同意层与设置页材料"],
    expected_findings: [{ type: "requirement_gap", severity: "high", rule_id: "HDAI-PRIV-002" }],
    expected_refusals: [],
    rules: ["HDAI-PRIV-002"],
  },
  // ===== 四、已有保护 =====
  {
    case_id: "PT-01",
    category: "protected",
    materials: "经期App截图：锁屏横幅显示「你有一条新提醒」，设置页存在独立的「健康内容预览」开关且默认关闭",
    profile: { productType: "period_tracking", coreTasks: ["notification"] },
    expected_todos: [],
    expected_findings: [{ type: "protected", severity: "low", rule_id: "MENS-PRIV-001" }],
    expected_refusals: ["保护机制满足规则要求，不得报风险"],
    rules: ["MENS-PRIV-001"],
  },
  {
    case_id: "PT-02",
    category: "protected",
    materials: "伴侣共享权限页：由本人发起邀请、权限逐项可选、单方面一键解除并即时生效",
    profile: { productType: "pregnancy" },
    expected_todos: [],
    expected_findings: [{ type: "protected", severity: "low", rule_id: "PREG-AUTN-001" }],
    expected_refusals: ["撤回即刻生效满足规则，不得报风险"],
    rules: ["PREG-AUTN-001"],
  },
  // ===== 五、不适用 / 通用基础问题 =====
  {
    case_id: "NA-01",
    category: "not_applicable",
    materials: "经期App完整功能清单与系统设置截图：产品明确没有任何日历同步/小组件/邮件摘要能力",
    profile: { productType: "period_tracking" },
    expected_todos: [],
    expected_findings: [{ type: "not_applicable", severity: "low", rule_id: "MENS-PRIV-002" }],
    expected_refusals: ["产品不含系统能力则该规则不适用，不得硬套风险"],
    rules: ["MENS-PRIV-002"],
  },
  {
    case_id: "BS-01",
    category: "refusal",
    materials: "泛健康App科普文章《叶酸怎么补》：正文无科学依据引用亦无更新时间标注（通用内容质量问题）",
    profile: { productType: "general_health", sensitiveData: [], coreTasks: ["content"] },
    expected_todos: [],
    expected_findings: [{ type: "baseline_issue", severity: "medium", rule_id: "BASE-SAFT-001" }],
    expected_refusals: ["通用底线失败应记为 baseline_issue，不包装成女性专项风险"],
    rules: ["BASE-SAFT-001"],
  },
];
