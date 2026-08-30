// 待办独立对话（M3 / PRD F3）：
// - 打开待办零模型调用（初始问题已由初始分析生成）
// - 对话上下文按待办隔离（不同待办不串线）
// - 每待办最多 3 轮 AI 追问，第 4 轮拦截转人工
// - 用户确认时不重复调用模型（PRD F3.5）

import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { continueTodo } from "@/lib/ai-gateway";
import type { ImagePart } from "@/lib/ai-gateway/provider";
import { nextRound, canTransition } from "@/lib/state/todo-machine";
import { UPLOAD_DIR } from "@/lib/config";
import { ingestArtifacts, type IngestWarning } from "@/lib/services/ingest";
import { buildDocExcerpt } from "@/lib/parsers/docs";
import { validateContinueOutput } from "@/lib/services/gateway-validation";
import type { ChatAttachment, ChatMessage, ContinueTodoOutput, TodoStatus } from "@/lib/types";
import type { SourceRef } from "@/lib/types";

/** 打开待办（零模型调用）：返回待办 + 完整对话 */
export async function getTodoView(todoId: string) {
  const todo = await prisma.reviewTodo.findUnique({
    where: { id: todoId },
    include: { conversation: true, finding: true },
  });
  if (!todo) throw new Error("待办不存在");
  return {
    todo: {
      id: todo.id,
      title: todo.title,
      priority: todo.priority,
      reason: todo.reason,
      status: todo.status,
      ruleId: todo.ruleId,
      aiRounds: todo.aiRounds,
      finding: todo.finding
        ? {
            id: todo.finding.id,
            title: todo.finding.title,
            type: todo.finding.type,
            severity: todo.finding.severity,
          }
        : null,
      evidenceRefs: todo.evidenceRefs,
    },
    messages: ((todo.conversation?.messages as ChatMessage[]) ?? []).map((m) => ({
      role: m.role,
      content: m.content,
      kind: m.kind,
      round: m.round,
      createdAt: m.createdAt,
      attachments: m.attachments ?? [], // 存量消息无此字段
    })),
  };
}

/** 对话附件输入：与 ingest 的 IngestInput 同构（对话内不收 URL），路由层负责 multipart 解析 */
export interface AttachmentInput {
  images?: Array<{ name: string; bytes: Buffer }>;
  pdf?: { name: string; bytes: Buffer };
  docs?: Array<{ name: string; bytes?: Buffer; text?: string; type: "docx" | "md" | "txt" }>;
}

/** 附件入库结果摘要：attachments 挂到用户消息上；计数供 UI 拼「已入库/去重/警告」文案 */
export interface AttachmentOutcome {
  attachments: ChatAttachment[];
  created: number;
  deduped: number;
  warnings: IngestWarning[];
}

export interface SendMessageResult {
  status: "in_chat" | "awaiting_confirm" | "needs_manual";
  messages: ChatMessage[];
  /** 第 4 轮被拦截时给出说明 */
  intercepted?: string;
  /** 本轮带附件时的入库汇总（纯文本消息不含该字段，响应向后兼容） */
  attachments?: AttachmentOutcome;
}

/** 附件标记行（进 userInput，参与缓存哈希）：空文本消息的兜底输入 + 同文本不同附件不命中旧缓存 */
function attachmentMarker(attachments: ChatAttachment[]): string {
  const images = attachments.filter((a) => a.kind === "image");
  const docs = attachments.filter((a) => a.kind !== "image");
  const parts: string[] = [];
  if (images.length) parts.push(`${images.length} 张截图 ${images.map((a) => a.name).join("、")}`);
  if (docs.length) parts.push(`${docs.length} 份文档 ${docs.map((a) => a.name).join("、")}`);
  return `（本轮附带材料：${parts.join("；")}）`;
}

/** 附件入库 + 解析回填：ingest → 按 sourceRef 回查最新行 → 附件元数据 / AI ImageParts / 文档摘录。
 *  数量超限在 ingestArtifacts 内抛错（消息不发送、零持久化副作用）；
 *  图片读盘取压缩产物（管线恒输出 JPEG，多模态载荷远小于原图）；
 *  去重命中经 parseOutput.duplicateOf 回溯原件路径，保证 AI 对本轮每张贴图可见。
 *  已知取舍：文档类无内容去重（仅图片有 pHash），同一文档重复上传会重复入库——根因在 ingest 管线，本期不改。 */
async function ingestAttachments(
  projectId: string,
  input: AttachmentInput,
): Promise<{ outcome: AttachmentOutcome; imageParts: ImagePart[]; docExcerpt: string }> {
  const ingest = await ingestArtifacts(projectId, input);

  // 同名文件只取首个（同批重名必被 ingest 去重池命中，重复元数据/重复 ImagePart 无意义）
  const seenNames = new Set<string>();
  const entries: Array<{ name: string; kind: "image" | "pdf" | "doc" }> = [
    ...(input.images ?? []).map((i) => ({ name: i.name, kind: "image" as const })),
    ...(input.pdf ? [{ name: input.pdf.name, kind: "pdf" as const }] : []),
    ...(input.docs ?? []).map((d) => ({ name: d.name, kind: "doc" as const })),
  ].filter((e) => (seenNames.has(e.name) ? false : (seenNames.add(e.name), true)));

  // 回查附件对应的 InputArtifact 行：同名历史文件取最新一条（≤4 名，单次查询 + 内存去重）
  const rows = await prisma.inputArtifact.findMany({
    where: { projectId, sourceRef: { in: entries.map((e) => e.name) } },
    orderBy: { createdAt: "desc" },
  });
  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) if (!latest.has(row.sourceRef)) latest.set(row.sourceRef, row);

  // 去重链回溯：第三次上传同一张图时，duplicateOf 可能指向另一条去重行（而非原件），
  // 需沿链逐级查到有 storagePath 的行为止（环保护 + 未取回的祖先行懒加载补查）
  const byId = new Map<string, (typeof rows)[number]>();
  const remember = (r: (typeof rows)[number] | undefined) => {
    if (r && !byId.has(r.id)) byId.set(r.id, r);
  };
  rows.forEach(remember);
  const resolveOriginPath = async (start: (typeof rows)[number]): Promise<string | null> => {
    let cur: (typeof rows)[number] | undefined = start;
    const seen = new Set<string>([start.id]);
    while (cur && !cur.storagePath) {
      const dupOf: string | undefined = (cur.parseOutput as { duplicateOf?: string } | null)?.duplicateOf;
      if (!dupOf || seen.has(dupOf)) return null;
      seen.add(dupOf);
      let next: (typeof rows)[number] | undefined = byId.get(dupOf);
      if (!next) {
        next = (await prisma.inputArtifact.findMany({ where: { id: dupOf } }))[0];
        remember(next);
      }
      cur = next;
    }
    return cur?.storagePath ?? null;
  };

  const attachments: ChatAttachment[] = [];
  const imageParts: ImagePart[] = [];
  const excerptEntries: Array<{
    name: string;
    pageCount: number;
    pages: Array<{ index: number; text: string }>;
  }> = [];
  // 警告 = ingest 结果 + 本函数内读取异常（F1.6：AI 看不到用户附图时必须明确提示）
  const warnings: IngestWarning[] = [...ingest.warnings];

  for (const { name, kind } of entries) {
    const row = latest.get(name);
    if (!row) {
      // 无行 = 超限跳过或解析失败（ingest 对图片/文档失败只出 warning；PDF 失败会建 failed 行，走下方分支）
      attachments.push({ kind, artifactId: null, name, storagePath: null, status: "failed" });
      continue;
    }
    if (kind === "image") {
      let storagePath: string | null = row.storagePath;
      if (row.status === "deduped" && !storagePath) {
        storagePath = await resolveOriginPath(row);
        if (!storagePath) {
          warnings.push({
            artifactRef: name,
            message: "去重图片未能定位原件，本轮 AI 未能看到该图（不影响入库）",
          });
        }
      }
      if (storagePath) {
        const abs = path.resolve(process.cwd(), storagePath);
        // 防御：storagePath 来自 DB Json，读取前校验落在上传目录内（同 uploads 路由 / image.ts 惯例）
        if (!abs.startsWith(UPLOAD_DIR + path.sep)) {
          warnings.push({ artifactRef: name, message: "图片路径非法，本轮 AI 未能看到该图（不影响入库）" });
        } else {
          try {
            const bytes = await fs.readFile(abs);
            imageParts.push({ base64: bytes.toString("base64"), mimeType: "image/jpeg" });
          } catch {
            warnings.push({ artifactRef: name, message: "图片读取失败，本轮 AI 未能看到该图（不影响入库）" });
          }
        }
      }
      attachments.push({
        kind: "image",
        artifactId: row.id,
        name,
        storagePath,
        status: row.status === "deduped" ? "deduped" : row.status === "parsed" ? "parsed" : "failed",
      });
      continue;
    }
    // pdf / doc：摘录取 parseOutput.pages（PDF 失败行为 failed 行，无 pages）
    const po = row.parseOutput as {
      pages?: Array<{ index: number; text: string }>;
      pageCount?: number;
    } | null;
    if (row.status === "parsed" && po?.pages) {
      excerptEntries.push({ name, pageCount: po.pageCount ?? po.pages.length, pages: po.pages });
    }
    attachments.push({
      kind,
      artifactId: row.id,
      name,
      storagePath: null,
      status: row.status === "parsed" ? "parsed" : "failed",
    });
  }

  return {
    outcome: {
      attachments,
      created: ingest.created.length,
      deduped: ingest.deduped.length,
      warnings,
    },
    imageParts,
    docExcerpt: buildDocExcerpt(excerptEntries),
  };
}

/** 用户发送一轮回答 → 网关 continueTodo（唯一模型调用点）；attachments 可选：走完整 ingest 管线入库 */
export async function sendUserMessage(
  todoId: string,
  userInput: string,
  attachments?: AttachmentInput,
): Promise<SendMessageResult> {
  const todo = await prisma.reviewTodo.findUnique({
    where: { id: todoId },
    include: { conversation: true, finding: true },
  });
  if (!todo) throw new Error("待办不存在");
  if (!todo.conversation) throw new Error("对话线程缺失");
  if (todo.status === "done") throw new Error("待办已完成");
  if (todo.status === "needs_manual") throw new Error("待办已转人工确认，请在人工确认入口处理");
  if (todo.status === "awaiting_confirm") throw new Error("已有待确认的拟写入摘要，请先确认或重新评估");

  const messages = [...((todo.conversation.messages as ChatMessage[]) ?? [])];
  const now = () => new Date().toISOString();

  // ===== 附件入库（消息持久化之前）：进项目证据包 + 供 AI 多模态/摘录 =====
  // 取舍：ingest 成功后若网关调用失败，材料已入库但消息未持久化——重发同图会 pHash 命中成 deduped（无害），
  // 孤儿 artifact 占用 12 张额度；与「补充截图」流同语义（材料本就是项目证据），不做补偿事务。
  let att: Awaited<ReturnType<typeof ingestAttachments>> | null = null;
  if (
    attachments &&
    ((attachments.images?.length ?? 0) > 0 || attachments.pdf || (attachments.docs?.length ?? 0) > 0)
  ) {
    att = await ingestAttachments(todo.projectId, attachments);
  }

  // ===== 轮次限制：第 4 轮拦截转人工（PRD F3.4）。附件已入库并挂到被拦截的用户消息上，供人工确认入口使用 =====
  const { forceManual } = nextRound(todo.aiRounds);
  if (forceManual) {
    messages.push({
      role: "user",
      content: userInput,
      round: todo.aiRounds,
      kind: "answer",
      createdAt: now(),
      attachments: att?.outcome.attachments ?? [],
    });
    messages.push({
      role: "assistant",
      content: "已达到 3 轮追问上限，自动转为人工确认。请在人工确认入口补充材料或直接裁定。",
      round: todo.aiRounds,
      kind: "note",
      createdAt: now(),
      attachments: [],
    });
    await prisma.$transaction([
      prisma.todoConversation.update({
        where: { todoId },
        data: { messages, updatedAt: new Date() },
      }),
      prisma.reviewTodo.update({ where: { id: todoId }, data: { status: "needs_manual" } }),
    ]);
    return {
      status: "needs_manual",
      messages,
      intercepted: "第 4 轮追问被系统拦截，已转人工确认",
      ...(att ? { attachments: att.outcome } : {}),
    };
  }

  // ===== 网关增量调用（只发送本待办上下文，PRD §5.4）=====
  const context = [
    "以下背景已显示在页面上，只用于判断，不要在回答中重新复述：",
    `待办：${todo.title}（${todo.id}）`,
    `原因：${todo.reason}`,
    todo.ruleId ? `关联规则：${todo.ruleId}` : "",
    todo.finding
      ? `关联风险：${todo.finding.title}（当前类型 ${todo.finding.type}，严重度 ${todo.finding.severity}）`
      : "",
    `对话摘要（最近3条）：${messages
      .slice(-3)
      .map((m) => `${m.role}:${m.content.slice(0, 80)}`)
      .join(" / ")}`,
    "回复要求：若仍缺信息，只说明尚需核对的事实并提出一条具体问题。",
  ]
    .filter(Boolean)
    .join("\n");

  // 附件标记行进 userInput（空文本时兜底非空 + 防缓存误命中）；文档摘录进 todoContext（6000 字 prompt 额度内）
  const userInputForAi = att
    ? [userInput, attachmentMarker(att.outcome.attachments)].filter(Boolean).join("\n")
    : userInput;

  const gw = await continueTodo({
    projectId: todo.projectId,
    ruleId: todo.ruleId,
    todoContext: att?.docExcerpt ? `${context}\n${att.docExcerpt}` : context,
    userInput: userInputForAi,
    images: att?.imageParts,
  });
  const [pkg, projectFindings] = await Promise.all([
    prisma.evidencePackage.findUnique({ where: { projectId: todo.projectId }, select: { sourceIndex: true } }),
    prisma.finding.findMany({ where: { projectId: todo.projectId }, select: { id: true } }),
  ]);
  const sourceKeys = new Set(((pkg?.sourceIndex as SourceRef[] | undefined) ?? []).map((source) => source.key));
  const { result: output } = validateContinueOutput(gw.result as ContinueTodoOutput, {
    sourceKeys,
    currentFindingId: todo.findingId,
    allowedFindingIds: new Set(projectFindings.map((finding) => finding.id)),
  });

  messages.push({
    role: "user",
    content: userInput,
    round: todo.aiRounds + 1,
    kind: "answer",
    createdAt: now(),
    attachments: att?.outcome.attachments ?? [],
  });

  if (output.kind === "need_info") {
    messages.push({
      role: "assistant",
      content: output.question,
      round: todo.aiRounds + 1,
      kind: "question",
      createdAt: now(),
      attachments: [],
    });
    const nextStatus = canTransition(todo.status as TodoStatus, "in_chat") ? "in_chat" : todo.status;
    await prisma.$transaction([
      prisma.todoConversation.update({
        where: { todoId },
        data: { messages, updatedAt: new Date() },
      }),
      prisma.reviewTodo.update({
        where: { id: todoId },
        data: { status: nextStatus, aiRounds: todo.aiRounds + 1 },
      }),
    ]);
    return { status: "in_chat", messages, ...(att ? { attachments: att.outcome } : {}) };
  }

  // sufficient → 待确认写入：拟写入摘要入对话（kind=proposal），完整 JSON 存 contextSummary 供确认读取
  const prev = output.risk_update_preview;
  messages.push({
    role: "assistant",
    content: `【拟写入证据摘要】${output.summary}\n记录事实：${output.facts_to_record.join("；")}\n适用范围：${output.scope}${
      prev
        ? `\n风险更新预览：${prev.new_type} / ${prev.new_severity}（${prev.reason}）\n置信度：${prev.confidence}${prev.confidence_reason ? `——${prev.confidence_reason}` : ""}${
            prev.new_type === "not_applicable" && prev.na_basis ? `\n不适用依据：${prev.na_basis}` : ""
          }`
        : ""
    }`,
    round: todo.aiRounds + 1,
    kind: "proposal",
    createdAt: now(),
    attachments: [],
  });
  await prisma.$transaction([
    prisma.todoConversation.update({
      where: { todoId },
      data: { messages, contextSummary: JSON.stringify(output), updatedAt: new Date() },
    }),
    prisma.reviewTodo.update({
      where: { id: todoId },
      data: {
        status: canTransition(todo.status as TodoStatus, "awaiting_confirm")
          ? "awaiting_confirm"
          : todo.status,
        aiRounds: todo.aiRounds + 1,
      },
    }),
  ]);
  return { status: "awaiting_confirm", messages, ...(att ? { attachments: att.outcome } : {}) };
}

/** 从待办读取最新拟写入摘要（确认页展示，零模型调用） */
export async function getPendingProposal(todoId: string): Promise<ContinueTodoOutput | null> {
  const conv = await prisma.todoConversation.findUnique({ where: { todoId } });
  if (!conv?.contextSummary) return null;
  try {
    return JSON.parse(conv.contextSummary) as ContinueTodoOutput;
  } catch {
    return null;
  }
}

/** 用户认为待确认内容不准确时，撤回本次草稿并重新开放回答入口。 */
export async function reopenTodoForRevision(todoId: string): Promise<{ status: "re_evaluating" }> {
  const todo = await prisma.reviewTodo.findUnique({
    where: { id: todoId },
    include: { conversation: true },
  });
  if (!todo) throw new Error("待办不存在");
  if (!todo.conversation) throw new Error("对话线程缺失");
  if (todo.status !== "awaiting_confirm") {
    throw new Error("只有待你确认的内容可以重新选择或补充");
  }
  if (!canTransition(todo.status as TodoStatus, "re_evaluating")) {
    throw new Error("当前待办状态无法重新选择");
  }

  const messages = [...((todo.conversation.messages as ChatMessage[]) ?? [])];
  messages.push({
    role: "assistant",
    content: "本次待确认内容已撤回。请重新选择最接近的情况，或补充文字和材料。系统会根据新信息重新判断。",
    round: todo.aiRounds,
    kind: "question",
    createdAt: new Date().toISOString(),
    attachments: [],
  });

  await prisma.$transaction([
    prisma.todoConversation.update({
      where: { todoId },
      data: { messages, contextSummary: null, updatedAt: new Date() },
    }),
    prisma.reviewTodo.update({
      where: { id: todoId },
      data: { status: "re_evaluating" },
    }),
  ]);
  return { status: "re_evaluating" };
}
