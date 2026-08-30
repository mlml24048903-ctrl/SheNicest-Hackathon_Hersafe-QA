// 报告数据（PRD F4.6）
import { NextRequest, NextResponse } from "next/server";
import { buildReport } from "@/lib/report";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const report = await buildReport(id);
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "报告构建失败" }, { status: 404 });
  }
}
