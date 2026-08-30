import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { askProductAssistant, GatewayError } from "@/lib/ai-gateway";

export const runtime = "nodejs";
export const maxDuration = 120;

const RequestSchema = z.object({
  question: z.string().trim().min(1).max(1000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(1000) })).max(6).default([]),
});

export async function POST(request: NextRequest) {
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "请输入要咨询的问题" }, { status: 400 });
  try {
    const result = await askProductAssistant(parsed.data);
    return NextResponse.json({ ...result.result, modelMode: result.mode });
  } catch (error) {
    const message = error instanceof Error ? error.message : "泡芙暂时无法回答，请稍后重试";
    const status = error instanceof GatewayError && error.code === "auth" ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
