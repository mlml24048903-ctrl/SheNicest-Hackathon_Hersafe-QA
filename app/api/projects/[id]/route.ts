// 项目详情（审查台一次拉全量）与删除（联动清理文件，PRD §7.2）
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { cleanupProjectFiles } from "@/lib/services/ingest";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const project = await prisma.auditProject.findUnique({
    where: { id },
    include: {
      artifacts: { orderBy: { createdAt: "asc" } },
      evidencePackage: { include: { coverage: true } },
      todos: { orderBy: [{ priority: "asc" }, { createdAt: "asc" }] },
      findings: { include: { testCases: true }, orderBy: { createdAt: "asc" } },
      evidenceUpdates: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!project) return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  return NextResponse.json({ project });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const project = await prisma.auditProject.findUnique({
    where: { id },
    include: { artifacts: { select: { storagePath: true } } },
  });
  if (!project) return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  const storagePaths = project.artifacts.flatMap((artifact) => artifact.storagePath ? [artifact.storagePath] : []);
  // 先删除数据库记录，避免数据库失败时材料文件已经不可恢复。
  await prisma.auditProject.delete({ where: { id } });
  // 数据库删除成功后再清理文件；文件清理采用尽力而为，不让残留文件阻断项目删除结果。
  await cleanupProjectFiles(id, storagePaths);
  return NextResponse.json({ deleted: true });
}
