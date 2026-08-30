// 图层审查台（PRD F2）：
// - 全部框选 / 需确认风险双模式切换（四态三重编码：颜色+文字+图标）
// - 人工框选新增、删除、边界修正、类型修改（F2.3）
// - 系统自动识别只读；事实确认统一在关联待办中完成
"use client";

import { useRef, useState } from "react";
import { Banner, Button, SegmentedControl, Select } from "@/components/ui";
import type { Notice } from "@/components/notice";
import {
  CircleDashed,
  CircleHelp,
  CircleSlash,
  OctagonAlert,
  ShieldCheck,
  SquarePlus,
  ArrowUpRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from "lucide-react";
import { useReviewStore } from "@/lib/store";
import { getAllRules } from "@/lib/rules";
import { naturalWidth, SANS_STACK } from "@/lib/typography";
import {
  CONTROL_STATUS_META,
  type ControlCandidate,
  type ControlKind,
  type ControlStatus,
} from "@/lib/types";

const KINDS: ControlKind[] = ["button", "input", "card", "icon", "panel", "text", "unknown"];
const KIND_LABELS: Record<ControlKind, string> = {
  button: "按钮",
  input: "输入区",
  card: "内容卡片",
  icon: "图标入口",
  panel: "页面区域",
  text: "文字",
  unknown: "待识别区域",
};

const STATUS_CLASS: Record<string, string> = {
  risk: "layer-box--risk",
  needs_evidence: "layer-box--evidence",
  protected: "layer-box--protected",
  not_applicable: "layer-box--unconfirmed", // 不适用：复用灰调（图例以图标+文字区分）
  unconfirmed: "layer-box--unconfirmed",
};

// 图层标签底色：统一走 layer.*-ink 深墨档令牌（tailwind.config 同名键）——
// 11px 白字压 600 亮档多数不足 AA(4.5:1)，深墨档保证可读；框体边框/图例仍用亮档，
// 「框=状态亮色 · 签=同色相深墨」的明度分层是有意设计，勿「统一回去」。
// annotate 非图层状态，按语义色约定用内置 blue-700
const TAG_BG: Record<ControlStatus | "annotate", string> = {
  risk: "bg-layer-risk-ink",
  needs_evidence: "bg-layer-evidence-ink",
  protected: "bg-layer-protected-ink",
  not_applicable: "bg-neutral-600",
  unconfirmed: "bg-layer-unconfirmed-ink",
  annotate: "bg-blue-700",
};

// 状态图标映射（UI 专用；lib/types.ts 的 icon emoji 字段不再被 UI 读取）
const STATUS_ICON: Record<ControlStatus, typeof OctagonAlert> = {
  risk: OctagonAlert,
  needs_evidence: CircleHelp,
  protected: ShieldCheck,
  not_applicable: CircleSlash,
  unconfirmed: CircleDashed,
};

export default function LayerCanvas({
  projectId,
  artifactId,
  imageUrl,
  controls,
  onChanged,
  onSelectControl,
}: {
  projectId: string;
  artifactId: string;
  imageUrl: string;
  controls: ControlCandidate[];
  onChanged: () => void;
  onSelectControl?: (control: ControlCandidate) => void;
}) {
  const { mode, setMode, selectedControlId, select, drawing, setDrawing } = useReviewStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [draftRect, setDraftRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const changeZoom = (next: number) => setScale(Math.min(4, Math.max(0.25, next)));
  const fitCanvas = () => {
    if (!naturalSize.width || !viewportRef.current) return;
    changeZoom((viewportRef.current.clientWidth - 32) / naturalSize.width);
  };

  const selected = controls.find((c) => c.id === selectedControlId) ?? null;
  const rules = getAllRules();
  const visibleControls = mode === "risk"
    ? controls.filter((control) => control.todoId || control.status === "risk" || control.status === "needs_evidence")
    : controls;

  const patch = async (payload: Record<string, unknown>) => {
    setBusy(true);
    const res = await fetch(`/api/projects/${projectId}/controls`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setNotice({ kind: "error", text: data.error ?? "操作失败" });
      return false;
    }
    onChanged();
    return true;
  };

  /* ---------- 手工框选（PRD F2.3） ---------- */
  const relativePos = (e: React.MouseEvent) => {
    const rect = containerRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (!drawing) return;
    const p = relativePos(e);
    setDragStart(p);
    setDraftRect({ x: p.x, y: p.y, w: 0, h: 0 });
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!drawing || !dragStart) return;
    const p = relativePos(e);
    setDraftRect({
      x: Math.min(dragStart.x, p.x),
      y: Math.min(dragStart.y, p.y),
      w: Math.abs(p.x - dragStart.x),
      h: Math.abs(p.y - dragStart.y),
    });
  };
  const onMouseUp = async () => {
    if (!drawing || !draftRect || draftRect.w < 8 || draftRect.h < 8) {
      setDragStart(null);
      setDraftRect(null);
      return;
    }
    // 换算回原图坐标
    const control: ControlCandidate = {
      id: "draft",
      artifactId,
      pageIndex: 0,
      rect: {
        x: Math.round(draftRect.x / scale),
        y: Math.round(draftRect.y / scale),
        w: Math.round(draftRect.w / scale),
        h: Math.round(draftRect.h / scale),
      },
      kind: "unknown",
      origin: "manual",
      status: "unconfirmed",
      confirmation: null,
      ruleId: null,
      todoId: null,
      supplementArtifactId: null,
    };
    setDragStart(null);
    setDraftRect(null);
    setDrawing(false);
    await patch({ op: "add", control });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 工具栏：双模式切换 + 框选 */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SegmentedControl
          size="sm"
          options={[
            { value: "annotation", label: "标注模式" },
            { value: "risk", label: "只看需确认" },
          ]}
          value={mode}
          onChange={setMode}
        />
        <Button size="sm" variant={drawing ? "danger" : "outline"} onClick={() => setDrawing(!drawing)}>
          {drawing ? (
            "框选中…（拖拽绘制）"
          ) : (
            <>
              <SquarePlus className="h-3.5 w-3.5" />
              手工框选
            </>
          )}
        </Button>
        {mode === "risk" && (
          <div className="ml-auto flex flex-wrap gap-2 text-xs text-neutral-500">
            {(["risk", "needs_evidence", "protected", "not_applicable", "unconfirmed"] as const).map((s) => {
              const StatusIcon = STATUS_ICON[s];
              return (
                <span key={s} className="inline-flex items-center gap-1">
                  <span className={`inline-block h-2.5 w-2.5 rounded-sm border-2 ${STATUS_CLASS[s]}`} />
                  <StatusIcon className="h-3 w-3" aria-hidden />
                  {CONTROL_STATUS_META[s].label}
                </span>
              );
            })}
          </div>
        )}
        <div className="ml-auto flex items-center rounded-lg border border-neutral-200 bg-white p-1 shadow-sm" aria-label="画布缩放">
          <button type="button" onClick={() => changeZoom(scale - 0.1)} className="grid h-8 w-8 place-items-center rounded-md text-neutral-600 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label="缩小画布"><ZoomOut className="h-4 w-4" /></button>
          <button type="button" onClick={() => changeZoom(1)} className="min-w-14 rounded-md px-2 py-1.5 text-xs font-semibold tabular-nums text-neutral-700 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label="恢复原始大小">{Math.round(scale * 100)}%</button>
          <button type="button" onClick={fitCanvas} className="grid h-8 w-8 place-items-center rounded-md text-neutral-600 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label="适应画布宽度"><Maximize2 className="h-4 w-4" /></button>
          <button type="button" onClick={() => changeZoom(scale + 0.1)} className="grid h-8 w-8 place-items-center rounded-md text-neutral-600 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label="放大画布"><ZoomIn className="h-4 w-4" /></button>
        </div>
      </div>

      {notice && (
        <div className="mb-3">
          <Banner kind={notice.kind}>{notice.text}</Banner>
        </div>
      )}

      {selected && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-sm">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-neutral-400">
              {selected.origin === "auto" ? "系统自动判断" : "用户手工框选"}
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-neutral-900">
              {KIND_LABELS[selected.kind]} · {selected.ruleId ? `关联规则 ${selected.ruleId}` : "暂未关联规则"}
            </p>
          </div>
          {selected.todoId ? (
            <Button size="sm" onClick={() => onSelectControl?.(selected)}>
              打开对应待办 <ArrowUpRight className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <span className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs text-neutral-500">此区域暂无待办</span>
          )}
          <Button size="sm" variant="ghost" onClick={() => select(null)}>取消选择</Button>
          {selected.origin === "manual" && (
            <div className="flex w-full flex-wrap items-center gap-2 border-t border-neutral-100 pt-3">
              <span className="text-xs text-neutral-500">人工标注类型</span>
              <Select size="sm" value={selected.kind} onChange={(e) => patch({ op: "update", control: { ...selected, kind: e.target.value } })}>
                {KINDS.map((kind) => <option key={kind} value={kind}>{KIND_LABELS[kind]}</option>)}
              </Select>
              <span className="text-xs text-neutral-500">关联规则</span>
              <Select size="sm" className="max-w-64" value={selected.ruleId ?? ""} onChange={(e) => patch({ op: "update", control: { ...selected, ruleId: e.target.value || null } })}>
                <option value="">暂不关联</option>
                {rules.map((rule) => <option key={rule.rule_id} value={rule.rule_id}>{rule.rule_id} · {rule.title.slice(0, 18)}</option>)}
              </Select>
              <Button size="sm" variant="danger" disabled={busy} onClick={() => patch({ op: "delete", controlId: selected.id })}>删除人工框选</Button>
            </div>
          )}
        </div>
      )}

      {/* 画布 */}
      <div ref={viewportRef} className="min-h-[460px] flex-1 overflow-auto overscroll-contain rounded-[20px] bg-neutral-100 p-4 shadow-inner xl:min-h-0" aria-label="可独立滚动的审查画布">
       <div
        ref={containerRef}
        className={`canvas-grid relative inline-block origin-top-left overflow-hidden rounded-lg bg-white shadow-sm ${drawing ? "cursor-crosshair" : ""}`}
        style={naturalSize.width ? { width: naturalSize.width * scale, height: naturalSize.height * scale } : undefined}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
       >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt="审查截图"
          className="block max-w-none select-none"
          style={naturalSize.width ? { width: naturalSize.width * scale, height: naturalSize.height * scale } : undefined}
          draggable={false}
          onLoad={(e) => {
            const img = e.currentTarget;
            const nextSize = { width: img.naturalWidth, height: img.naturalHeight };
            setNaturalSize(nextSize);
            const viewportWidth = viewportRef.current?.clientWidth ?? img.naturalWidth;
            setScale(Math.min(1, Math.max(0.25, (viewportWidth - 32) / img.naturalWidth)));
          }}
        />
        {/* 候选图层叠加：标签自上而下做碰撞避让（tagOccupied 为本次渲染的占用表） */}
        {(() => {
          const tagOccupied: Array<{ x: number; y: number; w: number; h: number }> = [];
          return visibleControls.map((c, i) => {
            const meta = mode === "risk" ? CONTROL_STATUS_META[c.status] : null;
            const isSelected = c.id === selectedControlId;
            // 标签避让（门禁3 FAIL-D 修复）：相邻图层的 chip 绝对定位会互相压字。
            // 自上而下维护「已占用标签矩形」，依次尝试 框上方 → 框内左上 → 框内右上 → 框内下移一位，
            // 取首个无冲突位置；全部冲突时兜底回框内左上（至少不裁切）
            const TAG_H = 20; // chip 高：leading-4 + 边框余量
            // F6 · 标签精确宽度（pretext measureNaturalWidth）：替换估算值 92，
            // 碰撞避让零误差；测量按文本缓存，每帧成本可忽略
            const tagLabel =
              mode === "risk"
                ? (meta?.label ?? "")
                : `#${i + 1} ${c.kind}${c.origin === "manual" ? "·手" : ""}`;
            const tagW = (naturalWidth(tagLabel, `11px ${SANS_STACK}`) ?? 80) + 28; // +28 = px-1.5×2 + 图标 14 + 余量
            const GAP = 4;
            const boxL = c.rect.x * scale;
            const boxT = c.rect.y * scale;
            const boxW = c.rect.w * scale;
            const overlaps = (r: { x: number; y: number }) =>
              tagOccupied.some(
                (o) =>
                  r.x < o.x + o.w + GAP &&
                  r.x + tagW + GAP > o.x &&
                  r.y < o.y + o.h + GAP &&
                  r.y + TAG_H + GAP > o.y,
              );
            const candidates = [
              { x: boxL, y: boxT - TAG_H - 2 }, // 框上方（默认位）
              { x: boxL + 2, y: boxT + 2 }, // 框内左上
              { x: Math.max(boxL + 2, boxL + boxW - tagW - 2), y: boxT + 2 }, // 框内右上
              { x: boxL + 2, y: boxT + TAG_H + 4 }, // 框内左上再下移一位
            ].filter((r) => r.x >= 0 && r.y >= 0); // 贴顶/贴左的出界位直接跳过（容器 overflow-hidden 会裁）
            const spot = candidates.find((r) => !overlaps(r)) ?? { x: boxL + 2, y: boxT + 2 };
            tagOccupied.push({ ...spot, w: tagW, h: TAG_H });
            return (
              <div
                key={c.id}
                className={`layer-box ${mode === "risk" ? STATUS_CLASS[c.status] : "border-blue-500/70 bg-blue-500/5"} ${isSelected ? "ring-2 ring-brand-500 ring-offset-1" : ""}`}
                style={{
                  left: c.rect.x * scale,
                  top: c.rect.y * scale,
                  width: c.rect.w * scale,
                  height: c.rect.h * scale,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!drawing) select(c.id);
                  if (!drawing && c.todoId) onSelectControl?.(c);
                }}
                title={`${c.kind}${c.origin === "manual" ? "（人工）" : ""}`}
              >
                <span
                  className={`absolute inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-[11px] leading-4 text-white shadow-sm ring-1 ring-black/10 ${TAG_BG[mode === "risk" ? c.status : "annotate"]}`}
                  style={{ left: spot.x - boxL, top: spot.y - boxT }}
                >
                  {mode === "risk" ? (
                    <>
                      {(() => {
                        const TagIcon = STATUS_ICON[c.status];
                        return <TagIcon className="h-2.5 w-2.5" aria-hidden />;
                      })()}
                      {meta?.label}
                    </>
                  ) : (
                    `#${i + 1} ${KIND_LABELS[c.kind]}${c.origin === "manual" ? "·手工" : ""}`
                  )}
                </span>
              </div>
            );
          });
        })()}
        {/* 框选草稿 */}
        {draftRect && (
          <div
            className="pointer-events-none absolute z-10 border-2 border-dashed border-brand-600 bg-brand-500/10"
            style={{ left: draftRect.x, top: draftRect.y, width: draftRect.w, height: draftRect.h }}
          />
        )}
       </div>
      </div>

      <p className="mt-2 text-[11px] leading-5 text-neutral-400">
        自动框选会忽略手机状态栏，并尽量把同一入口的图标与文字合并。系统识别结果在这里只读；需要确认的事实请在右侧待办中处理。
      </p>
    </div>
  );
}
