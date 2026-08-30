// 上传文件访问（审查台展示截图用）：仅 data/uploads 内文件，防路径穿越
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { UPLOAD_DIR } from "@/lib/config";

export const runtime = "nodejs";

type Params = { params: Promise<{ path: string[] }> };

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(_req: NextRequest, { params }: Params) {
  const { path: parts } = await params;
  // 防路径穿越：仅允许单级文件名
  const name = (parts ?? []).join("/");
  if (!name || name.includes("..") || name.includes("/") || name.includes("\\")) {
    return NextResponse.json({ error: "非法路径" }, { status: 400 });
  }
  const abs = path.join(UPLOAD_DIR, path.basename(name));
  if (!abs.startsWith(UPLOAD_DIR)) {
    return NextResponse.json({ error: "非法路径" }, { status: 400 });
  }
  try {
    const bytes = await fs.readFile(abs);
    const ext = path.extname(abs).toLowerCase();
    return new NextResponse(new Uint8Array(bytes), {
      headers: { "Content-Type": MIME[ext] ?? "application/octet-stream" },
    });
  } catch {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }
}
