// 网关横切：错误归一化 + 有限重试（PRD §5.6 / §7.3 失败降级矩阵）
// 可重试：格式错误 / 限流 / 临时网络错误 / 5xx / 超时
// 不自动重试：权限、密钥、预算、不支持格式

export type GatewayErrorCode =
  "auth" | "budget" | "timeout" | "rate_limit" | "network" | "format" | "unsupported" | "provider";

export class GatewayError extends Error {
  constructor(
    public readonly code: GatewayErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GatewayError";
  }
  /** 是否允许自动重试 */
  get retryable(): boolean {
    return ["timeout", "rate_limit", "network", "format", "provider"].includes(this.code);
  }
}

export interface RetryOptions {
  /** 最大自动重试次数（不含首次） */
  maxRetries?: number;
  /** 退避基数（毫秒），指数退避 */
  backoffMs?: number;
}

const DEFAULT_RETRY: Required<RetryOptions> = { maxRetries: 2, backoffMs: 800 };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 有限重试包装：仅对可重试错误进行指数退避重试；
 * 权限/密钥/预算/不支持格式立即抛出（不自动重试）。
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const opts = { ...DEFAULT_RETRY, ...options };
  let lastError: unknown;
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!(err instanceof GatewayError) || !err.retryable) throw err;
      if (attempt === opts.maxRetries) break;
      await sleep(opts.backoffMs * Math.pow(2, attempt));
    }
  }
  throw lastError;
}

/** 宽松 JSON 解析：剥离 ```json 围栏、截取首尾大括号 */
export function parseJsonLoose(raw: string): unknown {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new GatewayError("format", "模型输出中未找到 JSON 对象");
  }
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (err) {
    throw new GatewayError("format", `JSON 解析失败：${err instanceof Error ? err.message : err}`);
  }
}
