// 阶跃星辰 StepFun 供应商接入（OpenAI 兼容接口；pro plan 专属网关）
// 业务代码不得绕过网关直连供应商（PRD §5.2）；本文件是唯一 HTTP 出口。

import { stepfunConfig } from "@/lib/config";
import { GatewayError } from "@/lib/ai-gateway/retry";

export interface ImagePart {
  /** base64 编码图片（不含 data: 前缀） */
  base64: string;
  mimeType: string;
}

export interface ChatRequest {
  system: string;
  user: string;
  images?: ImagePart[];
  temperature?: number;
  /** 覆盖默认模型：带截图走 cfg.model（多模态），纯文本走 cfg.textModel（网关按 images 自动路由） */
  model?: string;
}

export interface ChatResponse {
  content: string;
  tokensIn?: number;
  tokensOut?: number;
}

/** 单次调用（不含重试——重试由 retry.ts 包装） */
export async function stepfunChat(req: ChatRequest): Promise<ChatResponse> {
  const cfg = stepfunConfig();
  if (!cfg.apiKey) {
    throw new GatewayError("auth", "STEPFUN_API_KEY 未配置，无法调用实时模型");
  }

  // OpenAI 兼容多模态消息组装
  const userContent: Array<Record<string, unknown>> = [{ type: "text", text: req.user }];
  for (const img of req.images ?? []) {
    userContent.push({
      type: "image_url",
      image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
    });
  }

  const controller = new AbortController();
  // 超时控制：step-3.7-flash 为推理模型，思考期（reasoning）显著长于普通对话模型，放宽至 120s
  const timeout = setTimeout(() => controller.abort(), 120_000);

  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: req.model ?? cfg.model,
        temperature: req.temperature ?? cfg.temperature,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.images ? userContent : req.user },
        ],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("abort")) {
      throw new GatewayError("timeout", "模型调用超时（120s）");
    }
    throw new GatewayError("network", `网络错误：${msg}`);
  }
  clearTimeout(timeout);

  if (res.status === 401 || res.status === 403) {
    throw new GatewayError("auth", "API Key 无效或无权限（不自动重试）");
  }
  if (res.status === 429) {
    throw new GatewayError("rate_limit", "触发限流（可有限重试）");
  }
  if (res.status >= 500) {
    throw new GatewayError("provider", `供应商服务错误（${res.status}，可有限重试）`);
  }
  if (!res.ok) {
    throw new GatewayError("unsupported", `不支持的请求（${res.status}，不自动重试）`);
  }

  // 响应解析：step-3.7-flash 为推理模型，思考过程在 message.reasoning_content，
  // 最终答案在 message.content——网关的 JSON 输出约定只认 content
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new GatewayError("format", "模型返回为空");
  }
  return {
    content,
    tokensIn: data.usage?.prompt_tokens,
    tokensOut: data.usage?.completion_tokens,
  };
}
