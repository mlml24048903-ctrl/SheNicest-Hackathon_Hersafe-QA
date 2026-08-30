// 触发项目级初始分析（每项目原则上一次，PRD §5.2）
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runInitialAnalysis } from "@/lib/services/analysis";

export const runtime = "nodejs";
export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const outcome = await runInitialAnalysis(id);
    return NextResponse.json(outcome, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "初始分析失败";
    const status = msg.includes("已完成") || msg.includes("进行中") || msg.includes("尚未构建") ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const project = await prisma.auditProject.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!project) return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  const invocations = await prisma.modelInvocation.findMany({
    where: { functionName: { in: ["analyzeProject", "continueTodo", "verifyHighRisk"] } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      functionName: true,
      model: true,
      cacheHit: true,
      cost: true,
      latencyMs: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ projectStatus: project.status, invocations });
}
