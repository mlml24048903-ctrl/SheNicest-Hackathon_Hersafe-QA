// 待办对话：用户发言 → 网关 continueTodo（唯一模型触发点，PRD F3.5）
// 附件支持：multipart（content + images/pdf/docs，字段名与材料上传路由 /api/projects/[id]/artifacts 一致）
// 与 JSON 两种请求并存；附件走完整 ingest 管线入库（复用解析管线，不另起炉灶）。
import { NextRequest, NextResponse } from "next/server";
import { sendUserMessage, type AttachmentInput } from "@/lib/services/todo-chat";
import { LIMITS } from "@/lib/config";

export const runtime = "nodejs";
export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

/** 每条消息附件总数上限（多模态载荷与证据包噪声的折中）；单文件体积在下方前置 400（上限与 ingest 一致） */
const MAX_FILES_PER_MESSAGE = 4;

/** multipart → 附件输入：数量/类型校验（中文错误 → 400）；docs 转换与材料上传路由同构 */
async function parseAttachmentForm(form: FormData): Promise<AttachmentInput> {
  const images = form.getAll("images").filter((f): f is File => f instanceof File);
  const pdfs = form.getAll("pdf").filter((f): f is File => f instanceof File);
  const docs = form.getAll("docs").filter((f): f is File => f instanceof File);

  const total = images.length + pdfs.length + docs.length;
  if (total > MAX_FILES_PER_MESSAGE) throw new Error(`单条消息最多附带 ${MAX_FILES_PER_MESSAGE} 个文件`);
  if (pdfs.length > 1) throw new Error("单条消息最多附带 1 份 PDF");

  // 扩展名白名单（与前端 accept 属性一致）
  for (const f of images) {
    if (!/\.(jpe?g|png|webp)$/i.test(f.name))
      throw new Error(`不支持的图片格式：${f.name}（仅 jpg/png/webp）`);
  }
  if (pdfs[0] && !pdfs[0].name.toLowerCase().endsWith(".pdf")) throw new Error("PDF 附件必须为 .pdf 文件");
  for (const f of docs) {
    if (!/\.(docx|md|txt)$/i.test(f.name)) throw new Error(`不支持的文档格式：${f.name}（仅 docx/md/txt）`);
  }

  // 体积前置校验：超限文件直接 400，避免整个文件读入内存后才被 ingest 警告跳过（上限与 ingest 一致）
  for (const f of images) {
    if (f.size > LIMITS.maxImgMB * 1024 * 1024)
      throw new Error(`图片 ${f.name} 超过 ${LIMITS.maxImgMB}MB 上限`);
  }
  if (pdfs[0] && pdfs[0].size > LIMITS.maxPdfMB * 1024 * 1024) {
    throw new Error(`PDF ${pdfs[0].name} 超过 ${LIMITS.maxPdfMB}MB 上限`);
  }
  for (const f of docs) {
    if (f.size > LIMITS.maxDocMB * 1024 * 1024)
      throw new Error(`文档 ${f.name} 超过 ${LIMITS.maxDocMB}MB 上限`);
  }

  return {
    images: await Promise.all(
      images.map(async (f) => ({ name: f.name, bytes: Buffer.from(await f.arrayBuffer()) })),
    ),
    pdf: pdfs[0] ? { name: pdfs[0].name, bytes: Buffer.from(await pdfs[0].arrayBuffer()) } : undefined,
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
  };
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const contentType = req.headers.get("content-type") ?? "";

  let content = "";
  let attachments: AttachmentInput | undefined;
  try {
    if (contentType.includes("multipart/form-data")) {
      // multipart：content 允许为空（有附件即可发纯附件消息）
      const form = await req.formData();
      const raw = form.get("content");
      content = typeof raw === "string" ? raw.trim().slice(0, 2000) : "";
      attachments = await parseAttachmentForm(form);
    } else {
      // JSON：原路径语义不变（content 必填非空）
      const body = await req.json().catch(() => null);
      const c = body?.content;
      if (!c || typeof c !== "string" || !c.trim()) {
        return NextResponse.json({ error: "消息内容必填" }, { status: 400 });
      }
      content = c.trim().slice(0, 2000);
    }
  } catch (err) {
    // multipart 解析/附件校验错误（超限、类型不支持等）→ 400 明确提示
    return NextResponse.json({ error: err instanceof Error ? err.message : "请求解析失败" }, { status: 400 });
  }

  const hasFiles =
    !!attachments &&
    ((attachments.images?.length ?? 0) > 0 || !!attachments.pdf || (attachments.docs?.length ?? 0) > 0);
  if (!content && !hasFiles) {
    return NextResponse.json({ error: "消息内容必填" }, { status: 400 });
  }

  try {
    // 无文件的 multipart（纯文本）不进 ingest，避免空跑证据包重建
    const result = await sendUserMessage(id, content, hasFiles ? attachments : undefined);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "发送失败";
    // 状态冲突 → 409；ingest 数量超限/附件超上限 → 400（对齐材料上传路由）；其余 → 500
    const status =
      msg.includes("已完成") || msg.includes("人工确认") || msg.includes("待确认")
        ? 409
        : msg.includes("超限") || msg.includes("最多")
          ? 400
          : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
