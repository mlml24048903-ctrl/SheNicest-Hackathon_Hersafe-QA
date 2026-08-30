"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";

const OPEN_WIZARD_EVENT = "hersafe:open-create-project";
const CLOSE_WIZARD_EVENT = "hersafe:close-create-project";

interface TourStep {
  title: string;
  description: string;
  selectors: string[];
  screen: "home" | "wizard" | "materials" | "analysis" | "todos" | "report";
}

const STEPS: TourStep[] = [
  { title: "创建审查项目", description: "从这里新建一次审查。下一步会直接打开创建窗口，你不需要真的提交项目。", selectors: ['[data-tour="create-project"]'], screen: "home" },
  { title: "填写项目基本信息", description: "先填写项目名称和简要说明，再补充产品画像。系统会据此推荐适用的规则包。", selectors: ['[data-tour="create-project-dialog"]'], screen: "wizard" },
  { title: "从项目列表继续审查", description: "项目卡片会保留材料、待办和结论数量。选择已有项目，可以继续上次的进度。", selectors: ['[data-tour="project-list"]'], screen: "home" },
  { title: "四个步骤可以随时切换", description: "项目分为上传材料、初步分析、待办核查和风险报告。引导会依次带你查看每一步。", selectors: ['[data-tour="project-steps"]'], screen: "materials" },
  { title: "上传代码包或其他材料", description: "可以只上传代码包，也可以补充截图、网页和产品文档。系统只做静态解析，不会执行项目。", selectors: ['[data-tour="upload-code"]'], screen: "materials" },
  { title: "查看产品功能和交互路径", description: "初步分析会整理页面、按钮、跳转和数据流，再把无法从材料确认的问题生成待办。", selectors: ['[data-tour="analysis-actions"]', '[data-tour-step="analysis"]'], screen: "analysis" },
  { title: "逐项补充并确认事实", description: "选择一项待办，回答系统还不能确认的问题。只有你确认后，最新事实和风险判断才会写入。", selectors: ['[data-tour="todo-workbench"]', '[data-tour-step="todos"]'], screen: "todos" },
  { title: "查看最终风险报告", description: "报告会汇总确认后的风险、规则依据、材料来源和修改建议。完成引导后会回到你开始引导前的页面。", selectors: ['[data-tour="report-summary"]', '[data-tour-step="report"]'], screen: "report" },
];

interface RectState {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

function findVisibleTarget(selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    const target = document.querySelector<HTMLElement>(selector);
    if (target && target.getClientRects().length) return target;
  }
  return null;
}

function projectBaseFromPage(): string | null {
  const current = window.location.pathname.match(/^\/projects\/[^/]+/)?.[0];
  if (current) return current;
  const href = document.querySelector<HTMLAnchorElement>('[data-tour="project-list"] a[href^="/projects/"]')?.getAttribute("href");
  return href?.match(/^\/projects\/[^/?]+/)?.[0] ?? null;
}

export default function OnboardingTour({ open, onClose, triggerRef }: { open: boolean; onClose: () => void; triggerRef: RefObject<HTMLButtonElement | null> }) {
  const [index, setIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<RectState | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const returnUrlRef = useRef("");
  const projectBaseRef = useRef<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const step = STEPS[index];

  useEffect(() => {
    if (!open || returnUrlRef.current) return;
    returnUrlRef.current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    projectBaseRef.current = projectBaseFromPage();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let timer: number | undefined;
    const goHome = () => {
      window.dispatchEvent(new Event(CLOSE_WIZARD_EVENT));
      if (pathname !== "/") router.push("/", { scroll: false });
    };
    if (step.screen === "home") goHome();
    if (step.screen === "wizard") {
      if (pathname !== "/") router.push("/", { scroll: false });
      timer = window.setTimeout(() => window.dispatchEvent(new Event(OPEN_WIZARD_EVENT)), 80);
    }
    if (["materials", "analysis", "todos", "report"].includes(step.screen)) {
      window.dispatchEvent(new Event(CLOSE_WIZARD_EVENT));
      const navigate = () => {
        projectBaseRef.current = projectBaseRef.current ?? projectBaseFromPage();
        const base = projectBaseRef.current;
        if (!base) return;
        const href = step.screen === "report" ? `${base}/report` : `${base}?step=${step.screen}`;
        const current = `${window.location.pathname}${window.location.search}`;
        if (current !== href) router.push(href, { scroll: false });
      };
      navigate();
      timer = window.setTimeout(navigate, 160);
    }
    return () => { if (timer) window.clearTimeout(timer); };
  }, [open, pathname, router, step.screen]);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const target = findVisibleTarget(step.selectors);
      if (!target) return setTargetRect(null);
      const beforeScroll = target.getBoundingClientRect();
      if (beforeScroll.top < 8 || beforeScroll.bottom > window.innerHeight - 8) {
        target.scrollIntoView({ block: "center", inline: "nearest" });
      }
      const rect = target.getBoundingClientRect();
      setTargetRect({ top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height });
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const timer = window.setInterval(update, 240);
    const frame = window.requestAnimationFrame(() => bubbleRef.current?.focus());
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, step.selectors]);

  const finish = useCallback(() => {
    window.dispatchEvent(new Event(CLOSE_WIZARD_EVENT));
    const destination = returnUrlRef.current || "/";
    onClose();
    router.push(destination, { scroll: false });
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, [onClose, router, triggerRef]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [finish, open]);

  if (!open) return null;

  const bubbleWidth = 348;
  const gap = 14;
  const viewportWidth = typeof window === "undefined" ? 1200 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 800 : window.innerHeight;
  let left = Math.max(16, (viewportWidth - bubbleWidth) / 2);
  let top = Math.max(16, viewportHeight - 270);
  if (targetRect) {
    if (targetRect.right + gap + bubbleWidth <= viewportWidth - 16) {
      left = targetRect.right + gap;
      top = Math.min(Math.max(16, targetRect.top), viewportHeight - 260);
    } else if (targetRect.left - gap - bubbleWidth >= 16) {
      left = targetRect.left - gap - bubbleWidth;
      top = Math.min(Math.max(16, targetRect.top), viewportHeight - 260);
    } else {
      left = Math.min(Math.max(16, targetRect.left), viewportWidth - bubbleWidth - 16);
      top = targetRect.bottom + gap;
      if (top > viewportHeight - 260) top = Math.max(16, targetRect.top - 246);
    }
  }
  const last = index === STEPS.length - 1;

  return (
    <>
      {targetRect ? <div className="pointer-events-none fixed z-[70] rounded-[18px] ring-2 ring-brand-500 ring-offset-4 ring-offset-white/80 shadow-[0_0_0_9999px_rgb(15_23_42/0.1)] transition-[top,left,width,height] duration-150 motion-reduce:transition-none" style={{ top: targetRect.top, left: targetRect.left, width: targetRect.width, height: targetRect.height }} aria-hidden="true" /> : <div className="pointer-events-none fixed inset-0 z-[70] bg-neutral-950/10" aria-hidden="true" />}
      <div ref={bubbleRef} role="dialog" aria-modal="false" aria-labelledby="onboarding-tour-title" aria-describedby="onboarding-tour-description" tabIndex={-1} className="fixed z-[80] w-[min(348px,calc(100vw-32px))] rounded-[24px] bg-white p-5 shadow-[0_22px_70px_rgb(15_23_42/0.22),0_2px_8px_rgb(15_23_42/0.08)] ring-1 ring-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" style={{ top, left }}>
        <div className="flex items-start justify-between gap-4"><span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700">{index + 1} / {STEPS.length}</span><button type="button" onClick={finish} aria-label="关闭新手引导并返回原页面" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-neutral-500 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><X className="h-4 w-4" aria-hidden="true" /></button></div>
        <h2 id="onboarding-tour-title" className="mt-3 text-lg font-semibold tracking-[-0.025em] text-neutral-950">{step.title}</h2>
        <p id="onboarding-tour-description" className="mt-2 text-sm leading-6 text-neutral-600">{step.description}</p>
        {!targetRect && <p role="status" className="mt-3 text-xs text-neutral-400">正在打开对应页面…</p>}
        <div className="mt-5 flex items-center justify-between gap-3"><button type="button" onClick={() => setIndex((current) => Math.max(0, current - 1))} disabled={index === 0} className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-neutral-600 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><ArrowLeft className="h-4 w-4" aria-hidden="true" />上一步</button><button type="button" onClick={() => last ? finish() : setIndex((current) => current + 1)} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white shadow-sm transition-transform active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2">{last ? <><Check className="h-4 w-4" aria-hidden="true" />完成引导</> : <>下一步<ArrowRight className="h-4 w-4" aria-hidden="true" /></>}</button></div>
      </div>
    </>
  );
}
