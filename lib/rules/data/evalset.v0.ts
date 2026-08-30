// 评测集 v0 —— 15 组固定案例（PRD §9.1 格式）
// 三类覆盖：正确风险识别 risk_detect / 误报拒绝 refusal / 期望待办生成 todo_generation
// 用途：AI 回归基线——锁定材料、模型、Prompt、规则与 Schema 版本跑分对比（PRD §9.3）

import type { FindingType, Severity } from "@/lib/types";

export type EvalCategory = "risk_detect" | "refusal" | "todo_generation";

export interface EvalCase {
  case_id: string;
  category: EvalCategory;
  /** 固定输入样本描述（回归时使用同一样本） */
  materials: string;
  /** 期望生成的待办标题（数量即期望数量） */
  expected_todos: string[];
  /** 期望的结论类型与严重程度 */
  expected_findings: { type: FindingType; severity: Severity; rule_id: string }[];
  /** 明确不应判为风险的点（材料不足 / 已有保护） */
  expected_refusals: string[];
  /** 命中的 rule_id */
  rules: string[];
}

export const EVALSET_VERSION = "v0.1.0";

export const EVALSET_V0: EvalCase[] = [
  // ===== 一、正确风险识别（5 组）=====
  {
    case_id: "RD-01",
    category: "risk_detect",
    materials: "聊天 App 截图：锁屏通知明文显示“某某：你昨晚在哪”；通知设置页无隐藏内容选项",
    expected_todos: [],
    expected_findings: [{ type: "confirmed_risk", severity: "high", rule_id: "PRI-001" }],
    expected_refusals: [],
    rules: ["PRI-001"],
  },
  {
    case_id: "RD-02",
    category: "risk_detect",
    materials: "社区 App：改密流程截图 + 改密后网页端仍可收发私信的录屏帧 + 文档说明“会话保持 7 天”",
    expected_todos: [],
    expected_findings: [{ type: "confirmed_risk", severity: "high", rule_id: "CTRL-002" }],
    expected_refusals: [],
    rules: ["CTRL-002"],
  },
  {
    case_id: "RD-03",
    category: "risk_detect",
    materials: "位置分享 App：关闭分享操作截图 + 对方端仍显示“最后已知位置”且 5 分钟后仍在刷新的对比截图",
    expected_todos: [],
    expected_findings: [{ type: "confirmed_risk", severity: "high", rule_id: "LOC-003" }],
    expected_refusals: [],
    rules: ["LOC-003"],
  },
  {
    case_id: "RD-04",
    category: "risk_detect",
    materials: "论坛 App：拉黑操作截图 + 拉黑后共同群聊中对方消息仍可见且可@的截图",
    expected_todos: [],
    expected_findings: [{ type: "confirmed_risk", severity: "medium", rule_id: "HRAS-001" }],
    expected_refusals: [],
    rules: ["HRAS-001"],
  },
  {
    case_id: "RD-05",
    category: "risk_detect",
    materials: "社交 App：注销条款文档写明“注销需客服人工审核 15 个工作日”+ 注销入口截图",
    expected_todos: [],
    expected_findings: [{ type: "unverified_risk", severity: "medium", rule_id: "HELP-003" }],
    expected_refusals: [],
    rules: ["HELP-003"],
  },

  // ===== 二、误报拒绝（5 组）=====
  {
    case_id: "RF-01",
    category: "refusal",
    materials: "仅提供主页截图，未提供任何通知设置页材料",
    expected_todos: ["补充通知设置页截图以核查锁屏通知内容暴露"],
    expected_findings: [],
    expected_refusals: ["不得因未见通知设置而判定锁屏通知为缺陷（没有看到 ≠ 没有设计）"],
    rules: ["PRI-001"],
  },
  {
    case_id: "RF-02",
    category: "refusal",
    materials: "PRD 文档说明存在“登录设备管理”功能，但无对应界面截图",
    expected_todos: ["上传登录设备管理页截图以确认一键下线能力"],
    expected_findings: [],
    expected_refusals: ["不得判定“缺少设备管理”为缺陷——文档已有设计，仅截图缺失"],
    rules: ["CTRL-001"],
  },
  {
    case_id: "RF-03",
    category: "refusal",
    materials: "位置分享 App：关闭分享后对方端显示“位置共享已结束”的截图",
    expected_todos: [],
    expected_findings: [{ type: "protected", severity: "low", rule_id: "LOC-003" }],
    expected_refusals: ["不得对已证明失效的分享继续输出风险"],
    rules: ["LOC-003"],
  },
  {
    case_id: "RF-04",
    category: "refusal",
    materials: "仅有产品概念 PDF 原型（产品未实现），原型含“账号注销”流程图",
    expected_todos: ["产品实现后补充真实注销流程截图"],
    expected_findings: [],
    expected_refusals: ["不得把“未实现”判定为产品缺陷，只能生成待办"],
    rules: ["HELP-003"],
  },
  {
    case_id: "RF-05",
    category: "refusal",
    materials: "网站 URL 抓取的隐私政策页与截图中的说明一致",
    expected_todos: [],
    expected_findings: [],
    expected_refusals: ["不得在材料一致时输出 material_conflicts（描述不一致）结论"],
    rules: ["PRI-004"],
  },

  // ===== 三、期望待办生成（5 组）=====
  {
    case_id: "TG-01",
    category: "todo_generation",
    materials: "截图识别到“清除历史记录”按钮，但无点击后的确认弹窗或结果状态截图",
    expected_todos: ["补充“清除历史记录”点击后的页面或状态截图"],
    expected_findings: [],
    expected_refusals: ["不得因缺少点击后状态而直接判定清除功能失效"],
    rules: ["PRI-002"],
  },
  {
    case_id: "TG-02",
    category: "todo_generation",
    materials: "文档描述了“开启位置共享”流程，未描述撤销、异常或恢复机制",
    expected_todos: ["补充位置共享的撤销流程与停止后的状态说明"],
    expected_findings: [],
    expected_refusals: [],
    rules: ["LOC-002", "LOC-003"],
  },
  {
    case_id: "TG-03",
    category: "todo_generation",
    materials: "网站页脚写“注销 3 步完成”，PDF 条款写“15 个工作日人工审核”",
    expected_todos: ["核对注销时长描述不一致：网站 3 步 vs 条款 15 个工作日"],
    expected_findings: [{ type: "requirement_gap", severity: "medium", rule_id: "HELP-003" }],
    expected_refusals: [],
    rules: ["HELP-003"],
  },
  {
    case_id: "TG-04",
    category: "todo_generation",
    materials: "界面存在“仅好友可评论”开关截图，但无法从界面证明后台对陌生人评论的实际拦截行为",
    expected_todos: ["提供陌生人评论被拦截的实际行为证据（测试账号截图）"],
    expected_findings: [],
    expected_refusals: ["界面存在开关 ≠ 后台已生效，不得直接输出已有保护"],
    rules: ["HRAS-004"],
  },
  {
    case_id: "TG-05",
    category: "todo_generation",
    materials: "PDF 扫描件 OCR 中文识别失败页（模糊），无法提取条款文本",
    expected_todos: ["OCR 识别失败：请人工补充该页条款原文"],
    expected_findings: [],
    expected_refusals: ["不得把 OCR 失败当作材料缺失风险写入 Finding"],
    rules: ["HELP-001"],
  },
];
