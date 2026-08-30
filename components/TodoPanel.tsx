"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, Braces, Camera, ClipboardList, ExternalLink, FileQuestion, FileText, Paperclip, RotateCcw, Send, ShieldCheck, X } from "lucide-react";
import { Badge, Banner, Button, Card, EmptyState, Input, Spinner, TodoStatusBadge } from "@/components/ui";
import ScreenshotEvidencePreview from "@/components/ScreenshotEvidencePreview";
import type { Notice } from "@/components/notice";
import { getRuleById } from "@/lib/rules";
import { getSourceUrl, isUnverifiedSource } from "@/lib/rules/source-links";
import type { ChatAttachment, ChatMessage, ContinueTodoOutput, ControlCandidate, TodoStatus } from "@/lib/types";
import { formatModelMessage } from "@/lib/text-format";

interface TodoItem {
  id: string;
  title: string;
  priority: string;
  reason: string;
  status: string;
  ruleId: string | null;
  findingId: string | null;
  evidenceRefs?: string[];
}

const PRIORITY_TONE: Record<string, string> = { high: "red", medium: "amber", low: "blue" };
const PRIORITY_LABEL: Record<string, string> = { high: "高风险", medium: "中风险", low: "低风险" };
const QUICK_ANSWERS = ["产品中已有该设计", "目前没有相关设计", "已有设计，但材料未上传", "目前无法确认"];

function fileKind(file: File): "image" | "pdf" | "doc" | null {
  const name = file.name.toLowerCase();
  if (/\.(jpe?g|png|webp)$/.test(name)) return "image";
  if (name.endsWith(".pdf")) return "pdf";
  if (/\.(docx|md|txt)$/.test(name)) return "doc";
  return null;
}

function AttachmentChip({ attachment }: { attachment: ChatAttachment }) {
  const content = (
    <>
      {attachment.kind === "image" ? <Camera className="h-3.5 w-3.5 shrink-0" /> : <FileText className="h-3.5 w-3.5 shrink-0" />}
      <span className="max-w-44 truncate">{attachment.name}</span>
      {attachment.status === "deduped" && <span className="text-neutral-400">已去重</span>}
      {attachment.status === "failed" && <span className="text-red-600">未入库</span>}
    </>
  );
  const className = "inline-flex min-h-8 items-center gap-1.5 rounded-xl bg-white px-2.5 text-[11px] font-medium text-neutral-600 shadow-sm ring-1 ring-black/5";
  if (attachment.kind === "image" && attachment.storagePath) {
    const source = `/api/uploads/${attachment.storagePath.split("/").pop()}`;
    return <a className={`${className} hover:bg-neutral-50`} href={source} target="_blank" rel="noreferrer" title="打开补充截图">{content}</a>;
  }
  return <span className={className}>{content}</span>;
}

export default function TodoPanel({ projectId, todos, onChanged, selectedTodoId, onSelectTodo, variant = "full", evidence, codeEvidence }: { projectId: string; todos: TodoItem[]; onChanged: () => void | Promise<void>; selectedTodoId?: string | null; onSelectTodo?: (id: string | null) => void; variant?: "full" | "embedded" | "list"; evidence?: { title: string; imageUrl: string; controls: ControlCandidate[] } | null; codeEvidence?: { label: string; filePath: string; startLine: number | null; endLine: number | null; symbol?: string | null } | null }) {
  const [openId, setOpenId] = useState<string | null>(selectedTodoId ?? null);
  const [view, setView] = useState<{
    todo: { id: string; title: string; status: string; reason: string; priority?: string; aiRounds: number; ruleId: string | null; finding: { title: string; type: string; severity?: string } | null };
    messages: ChatMessage[];
    proposal: ContinueTodoOutput | null;
  } | null>(null);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [revising, setRevising] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const openRequestRef = useRef(0);

  const open = useCallback(async (id: string) => {
    const requestId = ++openRequestRef.current;
    setOpenId(id);
    setNotice(null);
    const response = await fetch(`/api/todos/${id}`);
    if (response.ok) {
      const nextView = await response.json();
      if (requestId === openRequestRef.current) setView(nextView);
    }
  }, []);

  useEffect(() => {
    if (variant === "list") return;
    if (selectedTodoId && view?.todo.id !== selectedTodoId) {
      queueMicrotask(() => void open(selectedTodoId));
    } else if (!selectedTodoId && openId) {
      queueMicrotask(() => {
        setOpenId(null);
        setView(null);
      });
    }
  }, [open, openId, selectedTodoId, variant, view?.todo.id]);

  useEffect(() => {
    if (variant !== "list" && openId) queueMicrotask(() => void open(openId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todos]);

  const selectTodo = (id: string | null) => {
    if (onSelectTodo) {
      onSelectTodo(id);
      return;
    }
    setOpenId(id);
    setView(null);
    if (id) void open(id);
  };

  const addFiles = (picked: FileList | File[]) => {
    const next = [...files];
    for (const file of Array.from(picked)) {
      const kind = fileKind(file);
      if (!kind) {
        setNotice({ kind: "error", text: `无法添加 ${file.name}。请选择 JPG、PNG、WebP、PDF、DOCX、MD 或 TXT 文件。` });
        continue;
      }
      if (next.length >= 4) {
        setNotice({ kind: "error", text: "一条消息最多添加 4 个文件。" });
        break;
      }
      if (kind === "pdf" && next.some((item) => fileKind(item) === "pdf")) {
        setNotice({ kind: "error", text: "一条消息最多添加 1 份 PDF。" });
        continue;
      }
      next.push(file);
    }
    setFiles(next);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const sendText = async (content: string, attachments: File[] = []) => {
    if (!openId || (!content.trim() && !attachments.length)) return;
    setSending(true);
    setNotice(null);
    const form = attachments.length ? new FormData() : null;
    if (form) {
      form.append("content", content.trim());
      attachments.forEach((file) => {
        const kind = fileKind(file);
        form.append(kind === "image" ? "images" : kind === "pdf" ? "pdf" : "docs", file);
      });
    }
    const response = form
      ? await fetch(`/api/todos/${openId}/messages`, { method: "POST", body: form })
      : await fetch(`/api/todos/${openId}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: content.trim() }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setSending(false);
      return setNotice({ kind: "error", text: body.error ?? "无法发送补充信息，请重试" });
    }
    setInput("");
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (typeof body.status === "string") {
      setView((current) => current ? { ...current, todo: { ...current.todo, status: body.status } } : current);
    }
    await onChanged();
    await open(openId);
    setSending(false);
    if (body.attachments) {
      const summary = [`已接收 ${body.attachments.created} 份补充材料`];
      if (body.attachments.deduped) summary.push(`识别到 ${body.attachments.deduped} 份重复材料`);
      if (body.attachments.warnings?.length) summary.push(body.attachments.warnings.map((item: { message: string }) => item.message).join("；"));
      setNotice({ kind: body.attachments.warnings?.length ? "info" : "success", text: summary.join("；") });
    } else if (body.status === "awaiting_confirm") {
      setNotice({ kind: "success", text: "模型已完成本轮判断。请检查准备保存的事实，确认后这项待办会标记为已完成。" });
    } else if (body.status === "in_chat") {
      setNotice({ kind: "info", text: "还缺少一项会影响判断的信息，这项待办已进入核对中。" });
    } else if (body.status === "needs_manual") {
      setNotice({ kind: "info", text: "模型无法继续自动判断，这项待办已转为人工确认。" });
    }
  };

  const confirm = async () => {
    if (!openId) return;
    setConfirming(true);
    const response = await fetch(`/api/todos/${openId}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmedBy: "演示用户" }) });
    const body = await response.json().catch(() => ({}));
    setConfirming(false);
    if (!response.ok) return setNotice({ kind: "error", text: body.error ?? "无法确认这项记录，请重试" });
    setView((current) => current ? { ...current, todo: { ...current.todo, status: "done" } } : current);
    setNotice({ kind: "success", text: "这项核查已完成，相关事实和风险判断已经更新。" });
    await onChanged();
    await open(openId);
  };

  const revise = async () => {
    if (!openId) return;
    setRevising(true);
    setNotice(null);
    const response = await fetch(`/api/todos/${openId}/revise`, { method: "POST" });
    const body = await response.json().catch(() => ({}));
    setRevising(false);
    if (!response.ok) return setNotice({ kind: "error", text: body.error ?? "无法重新打开选项，请重试" });
    setView((current) => current ? { ...current, proposal: null, todo: { ...current.todo, status: "re_evaluating" } } : current);
    setNotice({ kind: "info", text: "已撤回本次待确认内容。请重新选择，或在下方补充说明和材料。" });
    await onChanged();
    await open(openId);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  if (!todos.length) return <Card className="p-10"><EmptyState icon={<ClipboardList className="h-6 w-6" />} title="还没有待办" description="完成初步分析后，系统会把需要补充和确认的问题整理到这里。" /></Card>;

  if (variant === "list") return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden p-3">
      <div className="shrink-0 px-2 pb-3 pt-1">
        <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">待办列表</h3><span className="text-xs tabular-nums text-neutral-400">{todos.length}</span></div>
        <p className="mt-1 text-xs leading-5 text-neutral-500">选择一项，进入第三步处理。</p>
      </div>
      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pb-1">
        {todos.map((todo) => <li key={todo.id}><button type="button" onClick={() => onSelectTodo?.(todo.id)} className="group w-full rounded-2xl bg-neutral-50 px-3.5 py-3 text-left shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)] transition-[background-color,box-shadow] duration-150 hover:bg-white hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><div className="flex items-center gap-2"><Badge color={PRIORITY_TONE[todo.priority] ?? "neutral"}>{PRIORITY_LABEL[todo.priority] ?? todo.priority}</Badge><TodoStatusBadge status={todo.status as TodoStatus} /></div><p className="mt-2 truncate text-sm font-semibold leading-5 text-neutral-950" title={todo.title}>{todo.title}</p></button></li>)}
      </ul>
    </Card>
  );

  const activeTodo = todos.find((item) => item.id === openId);
  const rule = view?.todo.ruleId ? getRuleById(view.todo.ruleId) : undefined;
  const proposalType = view?.proposal?.kind === "sufficient" ? view.proposal.risk_update_preview?.new_type : null;
  const proposalOutcome = proposalType === "protected"
    ? "现有设计可以覆盖这项要求"
    : proposalType === "not_applicable"
      ? "已确认这条规则不适用于当前情况"
      : proposalType
        ? "核查信息已足够，但产品仍需要修改"
        : "核查信息已足够，等待你确认";

  return (
    <section className={variant === "embedded" ? "flex h-full min-h-0 flex-col gap-3" : "grid min-h-[620px] gap-3 xl:h-full xl:min-h-0 xl:grid-cols-[232px_minmax(0,1fr)] xl:overflow-hidden"}>
      <Card className={variant === "embedded" ? "max-h-[210px] shrink-0 overflow-y-auto overscroll-contain p-3" : "min-h-0 overflow-y-auto overscroll-contain p-3"}>
        <div className="px-2 pb-3 pt-1"><h3 className="text-base font-semibold">{variant === "embedded" ? "当前截图的待确认项" : "待办列表"}</h3><p className="mt-1 text-xs text-neutral-500">{variant === "embedded" ? "点击风险位置时，会自动打开对应待办。" : "选择一项，集中处理当前问题。"}</p></div>
        <ul className="space-y-1.5">
          {todos.map((todo) => {
            const active = todo.id === openId;
            return <li key={todo.id}><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => selectTodo(todo.id)} className={`w-full rounded-2xl px-3 py-3 text-left transition-[background-color,box-shadow,transform] duration-150 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${active ? "bg-neutral-950 text-white shadow-md" : "bg-neutral-50 hover:bg-white hover:shadow-sm"}`}><div className="flex items-center gap-2"><Badge color={PRIORITY_TONE[todo.priority] ?? "neutral"}>{PRIORITY_LABEL[todo.priority] ?? todo.priority}</Badge><TodoStatusBadge status={todo.status as TodoStatus} /></div><p className="mt-2 line-clamp-2 text-sm font-semibold leading-5">{todo.title}</p></button></li>;
          })}
        </ul>
      </Card>

      {!openId || !view ? <Card className="grid min-h-[320px] flex-1 place-items-center p-8"><EmptyState icon={<FileQuestion className="h-7 w-7" />} title="选择一项待办" description="这里会显示问题、风险等级、规则解释和补充入口。" /></Card> : (
        <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto overscroll-contain pb-3 pr-1 xl:grid-cols-[minmax(250px,0.32fr)_minmax(0,0.68fr)] xl:auto-rows-max">
          <Card className="p-5 xl:col-span-2">
            <button type="button" onClick={() => selectTodo(null)} className={`mb-3 min-h-10 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${variant === "embedded" ? "inline-flex" : "inline-flex xl:hidden"}`}><ArrowLeft className="h-4 w-4" />返回待办列表</button>
            <div><div className="flex flex-wrap items-center gap-2"><Badge color={PRIORITY_TONE[activeTodo?.priority ?? ""] ?? "neutral"}>{PRIORITY_LABEL[activeTodo?.priority ?? ""] ?? "待判断"}</Badge><TodoStatusBadge status={view.todo.status as TodoStatus} /></div><h3 className="mt-3 text-xl font-semibold tracking-[-0.02em]">{view.todo.title}</h3><div className="mt-3"><p className="text-xs font-semibold text-neutral-500">为什么需要核查</p><p className="mt-1 text-sm leading-6 text-neutral-700">{view.todo.reason}</p></div>{view.todo.finding && <div className="mt-4 flex min-w-0 items-center gap-3 rounded-2xl bg-red-50 px-4 py-3"><p className="shrink-0 text-xs font-semibold text-red-600">关联风险</p><span className="h-4 w-px shrink-0 bg-red-200" /><p className="min-w-0 flex-1 whitespace-normal text-left text-sm font-semibold leading-6 text-red-800">{view.todo.finding.title}</p></div>}</div>
          </Card>

          <div className="flex min-h-[240px] flex-col gap-3 xl:col-start-1 xl:row-start-2">
            {evidence && <ScreenshotEvidencePreview imageUrl={evidence.imageUrl} controls={evidence.controls} title={evidence.title} />}
            {codeEvidence && <Card className="h-full flex-1 p-5"><div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-[13px] bg-blue-50 text-blue-600"><Braces className="h-4 w-4" /></span><div className="min-w-0"><p className="text-xs font-semibold text-blue-700">代码中已经确认</p><p className="mt-1 text-sm font-medium leading-5 text-neutral-900">{codeEvidence.label}</p><p className="mt-2 [overflow-wrap:anywhere] font-mono text-xs leading-5 text-neutral-500">{codeEvidence.filePath}{codeEvidence.startLine ? `:${codeEvidence.startLine}${codeEvidence.endLine && codeEvidence.endLine !== codeEvidence.startLine ? `–${codeEvidence.endLine}` : ""}` : ""}{codeEvidence.symbol ? ` · ${codeEvidence.symbol}` : ""}</p><p className="mt-2 text-xs leading-5 text-neutral-500">这说明代码里有这项处理。它在真实产品中的表现，还需要继续确认。</p></div></div></Card>}
          </div>

          {rule && (
            <Card className="min-h-[240px] p-5 xl:col-start-2 xl:row-start-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0"><p className="text-xs font-semibold text-brand-600">对应规则 · {rule.rule_id}</p><h3 className="mt-1.5 text-base font-semibold leading-6">{rule.title}</h3></div>
                <Link href={`/rules?returnTo=${encodeURIComponent(`/projects/${projectId}?step=todos&todo=${openId}`)}#${rule.rule_id}`} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-neutral-100 px-3 text-sm font-semibold text-neutral-700 hover:bg-neutral-200"><BookOpen className="h-4 w-4" />查看完整规则</Link>
              </div>
              <div className="mt-4 grid gap-5 2xl:grid-cols-2">
                <div><p className="text-xs font-semibold text-neutral-500">规则要求什么</p><p className="mt-1.5 text-sm leading-6 text-neutral-700">{rule.normative_requirement}</p></div>
                <div><p className="text-xs font-semibold text-neutral-500">为什么要核查</p><p className="mt-1.5 text-sm leading-6 text-neutral-700">{rule.harm_path}</p></div>
              </div>
              <details className="mt-4 border-t border-neutral-100 pt-4"><summary className="cursor-pointer text-sm font-medium text-neutral-700">查看需要补充的证据和公开依据</summary><div className="mt-3 space-y-3 text-xs leading-5 text-neutral-600"><p><b>需要的证据：</b>{rule.required_evidence.join("；")}</p><p><b>观察要点：</b>{rule.observable_checkpoints.join("；")}</p><ul className="space-y-2">{rule.sources.map((source) => { const url = getSourceUrl(source.ref); return <li key={`${source.ref}-${source.clause ?? ""}`} className="flex flex-wrap items-center justify-between gap-2"><span>{source.ref}{source.clause ? `（${source.clause}）` : ""}</span>{url ? <a href={url} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1 font-semibold text-brand-700">打开依据来源<ExternalLink className="h-3.5 w-3.5" /></a> : <Badge color={isUnverifiedSource(source.ref) ? "amber" : "neutral"}>{isUnverifiedSource(source.ref) ? "待核验" : "暂无链接"}</Badge>}</li>; })}</ul></div></details>
            </Card>
          )}

          <Card className="flex h-[min(620px,68dvh)] min-h-[480px] flex-col overflow-hidden xl:col-span-2 xl:col-start-1 xl:row-start-3">
            <div className="p-5 sm:px-7 sm:py-5"><h3 className="text-base font-semibold">补充并确认事实</h3><p className="mt-1 text-sm leading-6 text-neutral-500">请只补充系统还不能从代码中确认的实际情况。可以直接选择，也可以输入说明或添加材料。</p>{(view.todo.status === "pending" || view.todo.status === "in_chat" || view.todo.status === "re_evaluating") && <div className="mt-4 flex flex-wrap gap-2">{QUICK_ANSWERS.map((answer) => <Button key={answer} variant="outline" size="sm" onClick={() => sendText(answer)} disabled={sending}>{answer}</Button>)}<Button variant="outline" size="sm" onClick={() => inputRef.current?.focus()}>补充其他情况</Button></div>}</div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-neutral-50 px-5 py-5 sm:px-7">{view.messages.map((message, index) => <div key={`${message.createdAt}-${index}`} className={`flex flex-col ${message.role === "user" ? "items-end" : "items-start"}`}>{!!message.attachments?.length && <div className="mb-1.5 flex max-w-[88%] flex-wrap justify-end gap-1.5">{message.attachments.map((attachment, attachmentIndex) => <AttachmentChip key={`${attachment.name}-${attachmentIndex}`} attachment={attachment} />)}</div>}{(message.content || !message.attachments?.length) && <div className={`max-w-[88%] whitespace-pre-wrap rounded-[18px] px-4 py-3 text-sm leading-6 shadow-sm ${message.role === "user" ? "rounded-br-md bg-neutral-950 text-white" : message.kind === "proposal" ? "rounded-bl-md bg-brand-50 text-neutral-900" : "rounded-bl-md bg-white text-neutral-800"}`}>{message.kind === "proposal" && <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-brand-800"><ClipboardList className="h-3.5 w-3.5" />准备保存的事实</p>}{formatModelMessage(message.content)}</div>}</div>)}{sending && <Spinner label={files.length ? "正在解析补充材料…" : "正在整理你的补充信息…"} />}</div>
            {notice && <div className="px-5 pt-4 sm:px-7"><Banner kind={notice.kind}>{notice.text}</Banner></div>}
            {view.todo.status === "awaiting_confirm" && view.proposal && <div className="border-t border-amber-100 bg-amber-50 p-5 sm:px-7"><p className="text-sm font-semibold text-amber-950">{proposalOutcome}</p><p className="mt-1 text-xs leading-5 text-amber-800">请确认上面的内容是否准确。确认后会立即保存最新事实、更新风险判断，并把这项待办标记为已完成。</p><div className="mt-4 flex flex-wrap gap-2"><Button onClick={confirm} disabled={confirming || revising}>{confirming ? "正在保存" : <><ShieldCheck className="h-4 w-4" />确认并更新待办</>}</Button><Button variant="outline" onClick={revise} disabled={confirming || revising}>{revising ? "正在重新打开" : <><RotateCcw className="h-4 w-4" />重新选择或补充</>}</Button></div></div>}
            {(view.todo.status === "pending" || view.todo.status === "in_chat" || view.todo.status === "re_evaluating") && <div className="border-t border-neutral-100 bg-white p-5 sm:px-7">{files.length > 0 && <div className="mb-3 flex flex-wrap gap-2">{files.map((file, index) => <span key={`${file.name}-${index}`} className="inline-flex min-h-9 max-w-56 items-center gap-1.5 rounded-xl bg-neutral-100 px-3 text-xs font-medium text-neutral-700"><Paperclip className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{file.name}</span><button type="button" onClick={() => setFiles(files.filter((_, itemIndex) => itemIndex !== index))} className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-neutral-400 hover:bg-white hover:text-neutral-700" aria-label={`移除 ${file.name}`}><X className="h-3.5 w-3.5" /></button></span>)}</div>}<div className="flex flex-col gap-3 sm:flex-row"><input ref={fileInputRef} type="file" multiple accept="image/jpeg,image/png,image/webp,.pdf,.docx,.md,.txt" className="sr-only" onChange={(event) => event.target.files && addFiles(event.target.files)} /><button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-neutral-200 px-4 text-sm font-medium text-neutral-700 shadow-sm transition-[background-color,transform] active:scale-[0.96] hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><Paperclip className="h-4 w-4" />添加材料</button><Input ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => event.key === "Enter" && !event.nativeEvent.isComposing && sendText(input, files)} placeholder="描述产品实际行为，也可以添加截图或文档" className="flex-1" /><Button onClick={() => sendText(input, files)} disabled={sending || (!input.trim() && !files.length)}><Send className="h-4 w-4" />发送补充</Button></div><p className="mt-2 text-[11px] leading-5 text-neutral-400">支持 JPG、PNG、WebP、PDF、DOCX、MD 和 TXT；一条消息最多 4 个文件。</p></div>}
          </Card>
        </div>
      )}
    </section>
  );
}

/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: design.md · designed-as-app
 * pre-emit critique: P5 H5 E4 S5 R5 V4
 */
