// 材料上传（PRD F1）：multipart（截图/PDF/DOCX/MD/TXT/ZIP/源码）+ JSON（URL）
// 至少一种可解析材料即可开始；超限/失败明确提示（F1.6）
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ingestArtifacts } from "@/lib/services/ingest";
import { LIMITS } from "@/lib/config";

export const runtime = "nodejs";
export const maxDuration = 120; // Playwright 抓取可能较慢

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const project = await prisma.auditProject.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "项目不存在" }, { status: 404 });

  try {
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      // JSON：URL 输入
      const body = await req.json();
      const result = await ingestArtifacts(id, { url: body?.url });
      return NextResponse.json(result, { status: 201 });
    }

    // multipart：文件输入
    const form = await req.formData();
    const images = form.getAll("images").filter((f): f is File => f instanceof File);
    const pdf = form.get("pdf");
    const docs = form.getAll("docs").filter((f): f is File => f instanceof File);
    const codeFiles = form.getAll("code").filter((f): f is File => f instanceof File);

    const result = await ingestArtifacts(id, {
      images: await Promise.all(
        images.map(async (f) => ({ name: f.name, bytes: Buffer.from(await f.arrayBuffer()) })),
      ),
      pdf: pdf instanceof File ? { name: pdf.name, bytes: Buffer.from(await pdf.arrayBuffer()) } : undefined,
      docs: await Promise.all(
        docs.map(async (f) => {
          const type = f.name.toLowerCase().endsWith(".docx")
            ? ("docx" as const)
            : f.name.toLowerCase().endsWith(".md")
              ? ("md" as const)
              : ("txt" as const);
          const bytes = Buffer.from(await f.arrayBuffer());
          return type === "docx"
            ? { name: f.name, bytes, type }
            : { name: f.name, text: bytes.toString("utf-8"), type };
        }),
      ),
      codeFiles: await Promise.all(
        codeFiles.map(async (f) => ({ name: f.name, bytes: Buffer.from(await f.arrayBuffer()) })),
      ),
    });

    return NextResponse.json({ ...result, limits: LIMITS }, { status: 201 });
  } catch (err) {
    // 超限等业务错误 → 400 明确提示
    return NextResponse.json({ error: err instanceof Error ? err.message : "上传失败" }, { status: 400 });
  }
}
