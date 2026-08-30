// 打开待办（零模型调用，PRD F3.3）
import { NextRequest, NextResponse } from "next/server";
import { getTodoView, getPendingProposal } from "@/lib/services/todo-chat";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const view = await getTodoView(id);
    const proposal = view.todo.status === "awaiting_confirm" ? await getPendingProposal(id) : null;
    return NextResponse.json({ ...view, proposal });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "待办不存在" }, { status: 404 });
  }
}
