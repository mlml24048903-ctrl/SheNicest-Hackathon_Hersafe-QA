// 全局配置：上传限制与存储路径（PRD F1.2 工程建议值，环境变量可覆盖）
import path from "path";

function envInt(name: string, fallback: number): number {
  const v = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(v) && v > 0 ? v : fallback;
}

export const LIMITS = {
  /** 每项目最多 1 个网站 */
  maxUrls: 1,
  /** 3-5 个网页 */
  maxPages: envInt("MAX_PAGES", 5),
  /** 12 张截图 */
  maxImages: envInt("MAX_IMAGES", 12),
  /** 20 页 PDF */
  maxPdfPages: envInt("MAX_PDF_PAGES", 20),
  maxImgMB: envInt("MAX_IMG_MB", 10),
  maxPdfMB: envInt("MAX_PDF_MB", 50),
  maxDocMB: envInt("MAX_DOC_MB", 5),
  maxCodeMB: envInt("MAX_CODE_MB", 30),
  maxCodeFiles: envInt("MAX_CODE_FILES", 3),
  /** 每次初始分析最多待办数 */
  maxTodosPerAnalysis: 5,
  /** 每待办最多追问轮次 */
  maxAiRounds: 3,
} as const;

/** 上传文件落盘目录（git 忽略，项目删除时联动清理） */
export const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");

/** AI 网关预算（三档：单项目/单用户/每日，单位：元人民币） */
export const BUDGET_DEFAULTS = {
  perProject: 5,
  perUser: 20,
  perDay: 50,
} as const;

/** 阶跃星辰 StepFun 接入配置（OpenAI 兼容 Chat Completions；pro plan 专属网关） */
export function stepfunConfig() {
  return {
    // 用户项目只使用真实模型。Mock 仅由测试环境在网关内部启用。
    apiKey: process.env.STEPFUN_API_KEY ?? "",
    baseUrl: process.env.STEP_BASE_URL ?? "https://api.stepfun.com/step_plan/v1",
    /** 多模态调用（截图分析）：旗舰多模态推理模型 */
    model: process.env.STEP_MODEL ?? "step-3.7-flash",
    /** 纯文本调用（待办追问/高风险复核）：高频 Agent 场景优化版 */
    textModel: process.env.STEP_TEXT_MODEL ?? "step-3.5-flash-2603",
    temperature: 0.1, // PRD §5.5：温度 0.1（允许 0.0-0.2）
  };
}
