// 她测核心类型与 zod Schema —— 状态机合法值、图层、材料、网关输出的唯一权威定义
// （SQLite 不支持 Prisma 枚举，所有 DB 状态字段以 String 存储、以本文件 Schema 校验）
// v1：定位更新为女性健康数字产品风险审查（tace.md）——六维体系 / 六类结论 / 产品画像。
import { z } from "zod";

// ===== 六维度（女性健康审查维度，tace.md §2）=====
export const DIMENSION_LABELS: Record<string, string> = {
  health_safety: "健康安全",
  autonomy: "身体与生育自主权",
  privacy_control: "隐私与控制权",
  dignity: "尊严与非污名化",
  equity: "公平与包容",
  help_redress: "求助与补救",
};

export const DimensionSchema = z.enum([
  "health_safety",
  "autonomy",
  "privacy_control",
  "dignity",
  "equity",
  "help_redress",
]);
export type HealthDimension = z.infer<typeof DimensionSchema>;
/** 兼容别名：部分调用点使用该类型名 */
export type Dimension = HealthDimension;

// ===== 规则包（tace.md §5：四个规则包）=====
export const RulePackCodeSchema = z.enum(["BASE", "MENS", "PREG", "HDAI"]);
export type RulePackCode = z.infer<typeof RulePackCodeSchema>;

export const PACK_META: Record<RulePackCode, { label: string; desc: string }> = {
  BASE: {
    label: "通用数字健康底座",
    desc: "所有数字健康产品的底线要求（临床内容安全/数据保护/技术质量/无障碍）",
  },
  MENS: { label: "经期与生育记录", desc: "周期/排卵/性生活/流产等数据的采集、预测边界与暴露控制" },
  PREG: { label: "孕期与产后", desc: "孕周匹配建议、危险症状升级、妊娠失败后的内容与权限处理" },
  HDAI: { label: "健康数据与 AI 建议", desc: "AI 健康建议的可追溯性、人群覆盖、不确定性报告与训练限制" },
};

// ===== 待办状态机（不变）=====
export const TodoStatusSchema = z.enum([
  "pending",
  "in_chat",
  "awaiting_confirm",
  "re_evaluating",
  "done",
  "needs_manual",
  "retryable_error",
]);
export type TodoStatus = z.infer<typeof TodoStatusSchema>;

export const TODO_STATUS_LABELS: Record<TodoStatus, string> = {
  pending: "待处理",
  in_chat: "核对中",
  awaiting_confirm: "待你确认",
  re_evaluating: "重新评估中",
  done: "已完成",
  needs_manual: "需人工确认",
  retryable_error: "可重试错误",
};

// 合法状态转移表（lib/state/todo-machine.ts 的唯一依据）
export const TODO_TRANSITIONS: Record<TodoStatus, TodoStatus[]> = {
  pending: ["in_chat", "needs_manual", "retryable_error"],
  in_chat: ["awaiting_confirm", "re_evaluating", "needs_manual", "retryable_error", "done"],
  awaiting_confirm: ["done", "re_evaluating", "retryable_error"],
  re_evaluating: ["in_chat", "awaiting_confirm", "needs_manual", "retryable_error"],
  needs_manual: ["in_chat", "awaiting_confirm", "done"],
  retryable_error: ["in_chat", "pending", "needs_manual"],
  done: [],
};

// ===== Finding 结论类型（六类，tace.md §6.2）=====
export const FindingTypeSchema = z.enum([
  "confirmed_risk", // 已确认风险
  "unverified_risk", // 待验证风险
  "requirement_gap", // 需求缺口
  "protected", // 已有保护
  "not_applicable", // 不适用（须给 naBasis）
  "baseline_issue", // 通用基础问题（仅由服务端按规则包派生，模型不直接输出）
]);
export type FindingType = z.infer<typeof FindingTypeSchema>;

export const FINDING_TYPE_LABELS: Record<FindingType, string> = {
  confirmed_risk: "已确认风险",
  unverified_risk: "需要确认的风险线索",
  requirement_gap: "需求缺口",
  protected: "已有保护",
  not_applicable: "不适用",
  baseline_issue: "通用基础问题",
};

/** 初始分析允许产出的结论白名单（证据不足只能成待办/假设；不适用须用户确认事实后产生） */
export const INITIAL_FINDING_TYPE_SCHEMA = z.enum(["unverified_risk", "requirement_gap"]);

/**
 * 确认写入阶段允许的结论集合：
 * baseline_issue 由服务端依据规则包派生映射（决策 D3），不由模型输出；
 * 其余五类均可出现在拟写入预览中。
 */
export const CONFIRMABLE_FINDING_TYPE_SCHEMA = z.enum([
  "confirmed_risk",
  "unverified_risk",
  "requirement_gap",
  "protected",
  "not_applicable",
]);

// ===== 置信度（证据充分程度；与严重程度=潜在后果严格分离，tace.md §6.1）=====
export const ConfidenceSchema = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof ConfidenceSchema>;
export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  high: "高（证据充分）",
  medium: "中（部分佐证）",
  low: "低（主要靠推断）",
};

export const SeveritySchema = z.enum(["high", "medium", "low"]);
export type Severity = z.infer<typeof SeveritySchema>;

export const SEVERITY_LABELS: Record<Severity, string> = { high: "高", medium: "中", low: "低" };

// Finding 状态：初始假设 → 待验证 → 终态（终态可被新证据经新待办重新打开）
export const FindingStatusSchema = z.enum(["hypothesis", "pending_verify", "final"]);

// ===== 项目产品画像（创建向导输入，决定规则包推荐，tace.md §4 步骤 1-2）=====
export const ProductTypeSchema = z.enum([
  "period_tracking", // 经期记录
  "fertility_ttc", // 备孕/排卵
  "pregnancy", // 孕期
  "postpartum", // 产后
  "maternal_mental", // 母婴心理支持
  "general_health", // 泛健康
  "other",
]);
export type ProductType = z.infer<typeof ProductTypeSchema>;
export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  period_tracking: "经期记录",
  fertility_ttc: "备孕 / 排卵",
  pregnancy: "孕期管理",
  postpartum: "产后恢复",
  maternal_mental: "母婴心理支持",
  general_health: "泛健康管理",
  other: "其他",
};

export const SensitiveDataSchema = z.enum([
  "cycle", // 周期
  "sexual_life", // 性生活
  "pregnancy_outcome", // 妊娠结局
  "temperature", // 基础体温
  "hormone", // 激素/LH
  "location",
  "device_id",
  "ai_inference", // 基于健康数据的推断标签
]);
export type SensitiveDataKind = z.infer<typeof SensitiveDataSchema>;
export const SENSITIVE_DATA_LABELS: Record<SensitiveDataKind, string> = {
  cycle: "月经周期",
  sexual_life: "性生活",
  pregnancy_outcome: "妊娠结局（怀孕/流产/分娩）",
  temperature: "基础体温",
  hormone: "激素/LH 检测",
  location: "位置",
  device_id: "设备标识",
  ai_inference: "健康推断标签",
};

export const UserRoleSchema = z.enum(["owner", "partner", "family_member", "clinician"]);
export type UserRole = z.infer<typeof UserRoleSchema>;
export const USER_ROLE_LABELS: Record<UserRole, string> = {
  owner: "本人",
  partner: "伴侣",
  family_member: "家人",
  clinician: "医护人员",
};

export const ProjectProfileSchema = z.object({
  productType: ProductTypeSchema,
  targetAudience: z.array(z.string()).max(12).default([]),
  coreTasks: z.array(z.string()).max(12).default([]),
  healthClaims: z.array(z.string()).max(12).default([]),
  sensitiveData: z.array(SensitiveDataSchema).max(8).default([]),
  userRoles: z.array(UserRoleSchema).max(4).default([]),
});
export type ProjectProfile = z.infer<typeof ProjectProfileSchema>;

/** 项目 × 规则包绑定的 API 形态 */
export const PackSelectionSchema = z.object({
  packCode: RulePackCodeSchema,
  selected: z.boolean().default(true),
});

// ===== 输入材料 =====
export const ArtifactTypeSchema = z.enum(["url", "image", "pdf", "docx", "md", "txt", "code"]);
export type ArtifactType = z.infer<typeof ArtifactTypeSchema>;

export const ArtifactStatusSchema = z.enum(["pending", "parsing", "parsed", "failed", "deduped"]);

// ===== 候选图层 =====
export const ControlKindSchema = z.enum(["button", "input", "card", "icon", "panel", "text", "unknown"]);
export type ControlKind = z.infer<typeof ControlKindSchema>;

export const ControlStatusSchema = z.enum([
  "unconfirmed",
  "risk",
  "needs_evidence",
  "protected",
  "not_applicable",
]);
export type ControlStatus = z.infer<typeof ControlStatusSchema>;

export const CONTROL_STATUS_META: Record<ControlStatus, { label: string; icon: string; desc: string }> = {
  risk: { label: "已确认风险", icon: "⛔", desc: "证据已能证明问题存在" },
  needs_evidence: { label: "需补充证据", icon: "❓", desc: "证据不足，需补充材料" },
  protected: { label: "已有保护", icon: "🛡️", desc: "用户确认产品已有保护机制" },
  not_applicable: { label: "不适用", icon: "🚫", desc: "用户确认产品不涉及此功能" },
  unconfirmed: { label: "未确认", icon: "⬜", desc: "尚未核对" },
};

// 五选项确认流
export const ControlConfirmationSchema = z.enum([
  "not_present",
  "design_exists_no_shot",
  "cannot_verify",
  "other",
  "protected",
]);
export type ControlConfirmation = z.infer<typeof ControlConfirmationSchema>;

export const CONFIRMATION_LABELS: Record<ControlConfirmation, string> = {
  not_present: "产品没有这个设计（判不适用）",
  design_exists_no_shot: "已有设计，但截图未上传",
  cannot_verify: "目前无法确认",
  other: "其他情况",
  protected: "产品已有保护机制",
};

export const ControlCandidateSchema = z.object({
  id: z.string(),
  artifactId: z.string(),
  pageIndex: z.number().int().default(0),
  rect: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
  kind: ControlKindSchema.default("unknown"),
  origin: z.enum(["auto", "manual"]).default("auto"),
  status: ControlStatusSchema.default("unconfirmed"),
  confirmation: ControlConfirmationSchema.nullable().default(null),
  ruleId: z.string().nullable().default(null),
  todoId: z.string().nullable().default(null),
  supplementArtifactId: z.string().nullable().default(null),
});
export type ControlCandidate = z.infer<typeof ControlCandidateSchema>;

// ===== 来源索引 =====
export const SourceRefSchema = z.object({
  key: z.string(),
  artifactId: z.string(),
  locator: z.object({
    kind: z.enum(["url", "page", "coords", "code"]),
    url: z.string().nullable().default(null),
    page: z.number().int().nullable().default(null),
    coords: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).nullable().default(null),
    filePath: z.string().nullable().optional(),
    startLine: z.number().int().nullable().optional(),
    endLine: z.number().int().nullable().optional(),
    symbol: z.string().nullable().optional(),
  }),
  label: z.string(),
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

// ===== 证据包页面 =====
export const PackagePageSchema = z.object({
  page_id: z.string(),
  title: z.string(),
  artifact_id: z.string(),
  purpose: z.string().default(""),
});
export type PackagePage = z.infer<typeof PackagePageSchema>;

// ===== 待办对话附件（存于 ChatMessage.attachments，Json 列免迁移；对话内上传走完整 ingest 管线） =====
export const ChatAttachmentSchema = z.object({
  /** 附件大类：图片 / PDF / 文档（docx|md|txt 统称 doc） */
  kind: z.enum(["image", "pdf", "doc"]),
  /** 对应 InputArtifact 行 id；解析失败/超限跳过时为 null（仅作展示记录） */
  artifactId: z.string().nullable().default(null),
  /** 用户侧原始文件名 */
  name: z.string(),
  /** 图片压缩产物相对路径（仅 image 有；pdf/doc 不落盘）。渲染取 /api/uploads/<basename> */
  storagePath: z.string().nullable().default(null),
  /** 入库结果：parsed=新入库 deduped=pHash 命中去重 failed=跳过/解析失败 */
  status: z.enum(["parsed", "deduped", "failed"]).default("parsed"),
});
export type ChatAttachment = z.infer<typeof ChatAttachmentSchema>;

// ===== 待办对话消息 =====
export const ChatMessageSchema = z.object({
  role: z.enum(["system", "assistant", "user"]),
  content: z.string(),
  round: z.number().int().default(0),
  kind: z.enum(["question", "proposal", "answer", "note"]).default("note"),
  createdAt: z.string(),
  /** 本条消息携带的附件（仅用户消息非空；存量消息无此字段，读取侧用 ?? [] 兜底） */
  attachments: z.array(ChatAttachmentSchema).default([]),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

// ===== 初始分析输出 =====
export const TodoDraftSchema = z.object({
  title: z.string(),
  priority: SeveritySchema,
  reason: z.string(),
  evidence_refs: z.array(z.string()).default([]),
  rule_id: z.string().nullable().default(null),
});

export const FindingDraftSchema = z.object({
  title: z.string(),
  // 白名单收敛：初始分析只允许两类（落库层二次防御）
  type: INITIAL_FINDING_TYPE_SCHEMA,
  severity: SeveritySchema,
  dimension: DimensionSchema,
  risk_basis: z.string().default(""), // 命中规则的哪条检查点
  rule_id: z.string().nullable().default(null),
  sources: z.array(z.string()).default([]),
  observed: z.array(z.string()).default([]),
  inference: z.string().default(""),
  suggestion: z.string().default(""),
  status: z.enum(["hypothesis", "pending_verify"]).default("hypothesis"),
});

export const InitialAnalysisSchema = z.object({
  product_summary: z.object({
    name: z.string(),
    domain: z.string(),
    summary: z.string(),
  }),
  pages: z.array(PackagePageSchema).default([]),
  flows: z
    .array(
      z.object({
        flow_id: z.string(),
        name: z.string(),
        steps: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  interactions: z
    .array(
      z.object({
        interaction_id: z.string(),
        page_id: z.string(),
        description: z.string(),
        covered: z.boolean().default(false),
      }),
    )
    .default([]),
  evidence_gaps: z
    .array(
      z.object({
        gap_id: z.string(),
        description: z.string(),
        related_rule_ids: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  material_conflicts: z
    .array(
      z.object({
        conflict_id: z.string(),
        description: z.string(),
        sources: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  todos: z.array(TodoDraftSchema).max(5).default([]),
  initial_findings: z.array(FindingDraftSchema).default([]),
}).superRefine((value, ctx) => {
  const findingKeys = new Set(value.initial_findings.map((finding) => finding.rule_id ?? "__general__"));
  const missingKeys = [...new Set(value.todos.map((todo) => todo.rule_id ?? "__general__"))]
    .filter((key) => !findingKeys.has(key));
  for (const key of missingKeys) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["initial_findings"],
      message: key === "__general__"
        ? "存在未关联规则的待办，但缺少对应的通用待核查结论"
        : `规则 ${key} 的待办缺少对应的待核查结论`,
    });
  }
});
export type InitialAnalysis = z.infer<typeof InitialAnalysisSchema>;

// ===== continueTodo 每轮输出（二选一）=====
export const RiskUpdatePreviewSchema = z
  .object({
    finding_id: z.string(),
    new_type: CONFIRMABLE_FINDING_TYPE_SCHEMA,
    new_severity: SeveritySchema,
    reason: z.string(),
    confidence: ConfidenceSchema.default("medium"),
    confidence_reason: z.string().default(""),
    na_basis: z.string().optional(), // new_type=not_applicable 时必填（superRefine 校验）
  })
  .superRefine((val, ctx) => {
    if (val.new_type === "not_applicable" && !val.na_basis?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["na_basis"],
        message: "判为“不适用”时必须写明命中的不适用条件",
      });
    }
  });

export const ContinueTodoOutputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("need_info"),
    question: z.string(),
  }),
  z.object({
    kind: z.literal("sufficient"),
    summary: z.string(),
    facts_to_record: z.array(z.string()).default([]),
    fact_sources: z.array(z.string()).default([]),
    scope: z.string(),
    affected_finding_id: z.string().nullable().default(null),
    risk_update_preview: RiskUpdatePreviewSchema.nullable().default(null),
    cross_risk_impact: z.array(z.object({ finding_id: z.string(), why: z.string() })).default([]),
  }),
]);
export type ContinueTodoOutput = z.infer<typeof ContinueTodoOutputSchema>;

export const ProductAssistantOutputSchema = z.object({
  answer: z.string().min(1),
  suggestions: z.array(z.string()).max(3).default([]),
});
export type ProductAssistantOutput = z.infer<typeof ProductAssistantOutputSchema>;

// ===== verifyHighRisk 输出 =====
export const VerifyHighRiskOutputSchema = z.object({
  consistent: z.boolean(),
  issues: z.array(z.string()).default([]),
  corrected_type: FindingTypeSchema.nullable().default(null),
  corrected_severity: SeveritySchema.nullable().default(null),
  reason: z.string().default(""),
});
export type VerifyHighRiskOutput = z.infer<typeof VerifyHighRiskOutputSchema>;

// ===== GWT 测试用例 =====
export const TestCaseDraftSchema = z.object({
  given: z.string(),
  when: z.string(),
  then: z.string(),
});
