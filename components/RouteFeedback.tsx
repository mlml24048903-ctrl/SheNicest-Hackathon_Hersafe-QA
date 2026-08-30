"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export default function RouteFeedback() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const routeKey = `${pathname}?${search}`;
  const [pendingState, setPendingState] = useState({ routeKey, pending: false });
  const pending = pendingState.routeKey === routeKey && pendingState.pending;

  useEffect(() => {
    const start = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.origin !== window.location.origin) return;
      const next = new URL(anchor.href);
      if (`${next.pathname}${next.search}${next.hash}` === `${location.pathname}${location.search}${location.hash}`) return;
      setPendingState({ routeKey, pending: true });
    };
    document.addEventListener("click", start, true);
    return () => document.removeEventListener("click", start, true);
  }, [routeKey]);

  return pending ? (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] overflow-hidden bg-brand-100" role="status" aria-label="正在打开页面">
      <span className="block h-full w-1/3 animate-[route-progress_900ms_ease-in-out_infinite] bg-brand-400" />
    </div>
  ) : null;
}
