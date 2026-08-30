"use client";

import { useState } from "react";
import { ImageIcon } from "lucide-react";
import type { ControlCandidate } from "@/lib/types";

export default function ScreenshotEvidencePreview({
  imageUrl,
  controls,
  title,
}: {
  imageUrl: string;
  controls: ControlCandidate[];
  title: string;
}) {
  const [scale, setScale] = useState(0);
  return (
    <div className="rounded-[18px] border border-neutral-200 bg-neutral-50 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-neutral-600"><ImageIcon className="h-4 w-4 text-brand-600" />对应截图 · {title}</div>
      <div className="max-h-64 overflow-auto overscroll-contain rounded-xl bg-neutral-200/60 p-2">
        <div className="relative mx-auto w-fit overflow-hidden rounded-lg bg-white shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt={title} className="block max-h-56 w-auto max-w-full object-contain" onLoad={(event) => setScale(event.currentTarget.clientWidth / event.currentTarget.naturalWidth)} />
          {scale > 0 && controls.map((control) => <span key={control.id} className="pointer-events-none absolute border-2 border-red-500 bg-red-500/10 shadow-[0_0_0_1px_rgba(255,255,255,0.9)]" style={{ left: control.rect.x * scale, top: control.rect.y * scale, width: control.rect.w * scale, height: control.rect.h * scale }} />)}
        </div>
      </div>
      {!controls.length && <p className="mt-2 text-[11px] leading-5 text-neutral-400">这项旧待办没有保存精确坐标，因此显示整张证据图；新分析会自动定位到对应区域。</p>}
    </div>
  );
}
