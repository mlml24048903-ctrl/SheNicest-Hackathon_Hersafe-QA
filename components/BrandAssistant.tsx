"use client";

import { useEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import PuffMascot from "@/components/PuffMascot";
import { formatModelMessage } from "@/lib/text-format";

type Message = { role: "user" | "assistant"; content: string };

const STARTERS = ["怎么上传代码包？", "初步分析和待办有什么区别？", "规则库来自哪里？"];

export default function BrandAssistant() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [suggestions, setSuggestions] = useState(STARTERS);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      requestAnimationFrame(() => inputRef.current?.focus());
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      requestAnimationFrame(() => triggerRef.current?.focus());
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const ask = async (question: string) => {
    const clean = question.trim();
    if (!clean || sending) return;
    const history = messages.slice(-6);
    setMessages((current) => [...current, { role: "user", content: clean }]);
    setInput("");
    setError("");
    setSending(true);
    const response = await fetch("/api/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: clean, history }),
    });
    const body = await response.json().catch(() => ({}));
    setSending(false);
    if (!response.ok) {
      setError(body.error ?? "泡芙暂时无法回答，请稍后重试");
      return;
    }
    setMessages((current) => [...current, { role: "assistant", content: body.answer }]);
    setSuggestions(Array.isArray(body.suggestions) && body.suggestions.length ? body.suggestions : STARTERS);
  };

  return (
    <>
      <div className={`puff-swim-zone fixed bottom-3 right-3 z-40 h-[88px] w-[280px] sm:bottom-5 sm:right-5 sm:w-[380px] ${open ? "hidden" : "block"}`} aria-label="泡芙助手活动区域">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          className="puff-swimmer absolute bottom-2 right-0 grid h-14 w-[76px] place-items-center rounded-full bg-transparent p-0 transition-opacity hover:opacity-90 active:opacity-75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600"
          aria-label="打开泡芙助手"
          aria-haspopup="dialog"
        >
          <PuffMascot className="h-14 w-[76px] drop-shadow-[0_4px_3px_rgb(0_0_0/0.12)]" />
          <span className="sr-only">泡芙会回答系统使用和规则来源问题</span>
        </button>
      </div>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onCancel={(event) => { event.preventDefault(); close(); }}
        onClick={(event) => { if (event.target === event.currentTarget) close(); }}
        className="m-0 ml-auto h-dvh max-h-none w-full max-w-[420px] overflow-hidden bg-white p-0 backdrop:bg-black/15"
        aria-labelledby="puff-title"
      >
        <section className="flex h-dvh flex-col overflow-hidden bg-white shadow-[0_24px_80px_rgb(0_0_0/0.18)] ring-1 ring-black/5 sm:rounded-l-[28px]">
          <header className="flex items-center gap-3 border-b border-neutral-100 px-5 py-4">
            <span className="grid h-11 w-12 place-items-center rounded-2xl bg-brand-50/70"><PuffMascot className="h-9 w-11" /></span>
            <div className="min-w-0 flex-1"><h2 id="puff-title" className="text-base font-semibold">泡芙助手</h2><p className="text-xs text-neutral-500">系统使用与规则说明</p></div>
            <button type="button" onClick={close} className="grid h-10 w-10 place-items-center rounded-xl text-neutral-500 hover:bg-neutral-100 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400" aria-label="关闭泡芙助手"><X className="h-5 w-5" /></button>
          </header>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-white px-4 py-5">
            <div className="max-w-[88%] rounded-[18px] rounded-bl-md bg-white px-4 py-3 text-sm leading-6 text-neutral-700 shadow-sm">你好，我是泡芙。可以问我怎么使用她测、各步骤有什么区别，或者规则库的依据来自哪里。</div>
            {messages.map((message, index) => <div key={`${message.role}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[88%] whitespace-pre-wrap rounded-[18px] px-4 py-3 text-sm leading-6 shadow-sm ${message.role === "user" ? "rounded-br-md bg-neutral-950 text-white" : "rounded-bl-md bg-white text-neutral-800"}`}>{formatModelMessage(message.content)}</div></div>)}
            {sending ? <div className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm text-neutral-500 shadow-sm"><span className="h-2 w-2 animate-pulse rounded-full bg-brand-400" />泡芙正在查找说明…</div> : null}
            {error ? <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm leading-6 text-red-700" role="alert">{error}</div> : null}
          </div>

          <div className="border-t border-neutral-100 bg-white p-4">
            <div className="mb-3 grid gap-2">{suggestions.map((item) => <button key={item} type="button" onClick={() => void ask(item)} disabled={sending} className="min-h-10 w-full rounded-xl bg-brand-50 px-3 text-left text-xs font-medium leading-5 text-brand-800 hover:bg-brand-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">{item}</button>)}</div>
            <div className="flex items-center gap-2 rounded-2xl bg-neutral-100 p-1.5 ring-1 ring-neutral-200 focus-within:ring-2 focus-within:ring-brand-400">
              <input ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) void ask(input); }} placeholder="问问泡芙…" className="min-h-10 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-neutral-400" />
              <button type="button" onClick={() => void ask(input)} disabled={sending || !input.trim()} className="grid h-10 w-10 place-items-center rounded-[13px] bg-neutral-950 text-white disabled:cursor-not-allowed disabled:opacity-35 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400" aria-label="发送问题"><Send className="h-4 w-4" /></button>
            </div>
            <p className="mt-2 text-center text-[11px] text-neutral-400">回答由实时模型生成，请结合规则原文判断。</p>
          </div>
        </section>
      </dialog>
    </>
  );
}

/* Hallmark · genre: modern-minimal · macrostructure: side drawer · design-system: design.md · custom-craft: 泡芙卡通神仙鱼 */
