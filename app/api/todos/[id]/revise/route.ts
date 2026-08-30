import { NextRequest, NextResponse } from "next/server";
import { reopenTodoForRevision } from "@/lib/services/todo-chat";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    return NextResponse.json(await reopenTodoForRevision(id));
  } catch (error) {
    const message = error instanceof Error ? error.message : "无法重新打开这项待办";
    const status = message.includes("只有") || message.includes("状态") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
