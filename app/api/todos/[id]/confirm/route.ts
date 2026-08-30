// 用户确认拟写入证据摘要 → EvidenceUpdate 事务写入（PRD F4.1/F4.2）
// 确认动作不调用模型（PRD F3.5）
import { NextRequest, NextResponse } from "next/server";
import { confirmEvidenceUpdate } from "@/lib/services/evidence-update";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    const outcome = await confirmEvidenceUpdate(id, body?.confirmedBy ?? "演示用户");
    return NextResponse.json(outcome);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "确认写入失败";
    const status = msg.includes("不可确认") || msg.includes("未找到") ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
