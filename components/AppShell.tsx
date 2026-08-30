"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Suspense } from "react";
import { Bell, CircleHelp, FileSearch, FolderKanban, Library, PanelLeftClose, PanelLeftOpen, Settings, X } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import OnboardingTour from "@/components/OnboardingTour";
import BrandAssistant from "@/components/BrandAssistant";
import RouteFeedback from "@/components/RouteFeedback";

const primaryItems = [
  { href: "/", label: "项目", icon: FolderKanban },
  { href: "/rules", label: "规则库", icon: Library },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [notice, setNotice] = useState("");
  const [tourOpen, setTourOpen] = useState(false);
  const tourTriggerRef = useRef<HTMLButtonElement>(null);
  const fixedProjectWorkbench = /^\/projects\/[^/]+$/.test(pathname);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const showUnavailable = (name: string) => setNotice(`${name}功能暂未开放`);

  return (
    <div className={`${fixedProjectWorkbench ? "xl:h-screen xl:overflow-hidden" : "min-h-screen"} bg-neutral-100 text-neutral-950`}>
      <Suspense fallback={null}><RouteFeedback /></Suspense>
      <a href="#main-content" className="sr-only z-50 rounded-md bg-brand-600 px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">跳到主要内容</a>
      <aside className={`fixed inset-y-0 left-0 z-40 hidden bg-neutral-100/95 lg:flex lg:flex-col ${collapsed ? "w-[76px]" : "w-[232px]"}`}>
        <div className="flex h-16 items-center px-5">
          <Link href="/" className="flex min-w-0 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
            <BrandMark className="h-8 w-8 shrink-0" />
            {!collapsed && <span className="min-w-0"><span className="block text-[15px] font-bold tracking-tight">她测</span><span className="block text-[10px] font-medium tracking-[0.14em] text-neutral-400">HERSAFE QA</span></span>}
          </Link>
        </div>
        <nav className="flex-1 px-3 py-5" aria-label="主导航">
          {!collapsed && <p className="mb-2 px-3 text-[11px] font-semibold tracking-[0.12em] text-neutral-400">工作区</p>}
          <div className="space-y-1">
            {primaryItems.map((item) => {
              const Icon = item.icon;
              const active = item.href === "/" ? pathname === "/" || pathname.startsWith("/projects/") : pathname.startsWith(item.href);
              const cls = `flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium transition-[background-color,box-shadow,transform] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${active ? "bg-white text-neutral-950 shadow-sm" : "text-neutral-600 hover:bg-white/70 hover:text-neutral-950"}`;
              return <Link key={item.label} href={item.href} scroll={false} data-tour={item.href === "/" ? "projects-nav" : "rules-nav"} className={cls} title={collapsed ? item.label : undefined}><Icon className="h-[18px] w-[18px] shrink-0" />{!collapsed && item.label}</Link>;
            })}
          </div>
        </nav>
        <div className="p-3">
          <button type="button" onClick={() => showUnavailable("通知")} className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" title={collapsed ? "通知" : undefined}><Bell className="h-[18px] w-[18px] shrink-0" />{!collapsed && "通知"}</button>
          <button ref={tourTriggerRef} type="button" onClick={() => setTourOpen(true)} aria-haspopup="dialog" aria-expanded={tourOpen} className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" title={collapsed ? "新手引导" : undefined}><CircleHelp className="h-[18px] w-[18px] shrink-0" />{!collapsed && "新手引导"}</button>
          <button type="button" onClick={() => showUnavailable("设置")} className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" title={collapsed ? "设置" : undefined}><Settings className="h-[18px] w-[18px] shrink-0" />{!collapsed && "设置"}</button>
          <button type="button" onClick={() => setCollapsed((v) => !v)} className="mt-2 flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-neutral-500 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}>{collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}{!collapsed && "收起侧边栏"}</button>
        </div>
      </aside>
      <div className={collapsed ? "lg:pl-[76px]" : "lg:pl-[232px]"}>
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between bg-neutral-100/80 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 lg:hidden"><BrandMark className="h-8 w-8" /><span className="text-sm font-bold">她测 HerSafe QA</span></div>
          <div className="hidden items-center gap-2 text-sm text-neutral-500 lg:flex"><FileSearch className="h-4 w-4" /><span>产品风险审查工作台</span></div>
          <button type="button" onClick={() => showUnavailable("消息中心")} className="grid h-9 w-9 place-items-center rounded-lg border border-[#e4e7ef] text-neutral-500 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label="打开消息中心"><Bell className="h-4 w-4" /></button>
        </header>
        <main id="main-content" className={fixedProjectWorkbench ? "xl:h-[calc(100dvh-4rem)] xl:overflow-hidden" : "min-h-[calc(100vh-4rem)]"}>{children}</main>
      </div>
      {tourOpen ? <OnboardingTour open onClose={() => setTourOpen(false)} triggerRef={tourTriggerRef} /> : null}
      <BrandAssistant />
      {notice && <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white shadow-xl" role="status" aria-live="polite"><span className="h-2 w-2 rounded-full bg-[#d6f000]" />{notice}<button type="button" onClick={() => setNotice("")} className="rounded p-1 text-neutral-400 hover:bg-white/10 hover:text-white" aria-label="关闭提示"><X className="h-4 w-4" /></button></div>}
    </div>
  );
}
