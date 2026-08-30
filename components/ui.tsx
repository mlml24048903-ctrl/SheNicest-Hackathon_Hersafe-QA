// 轻量 UI 基础组件（样式统一入口）
// 令牌消费规范：卡片 rounded-xl · 控件 rounded-lg · chip/badge rounded-md · 胶囊 rounded-full
"use client";

import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import type { FindingType, Severity, TodoStatus } from "@/lib/types";
import { FINDING_TYPE_LABELS, SEVERITY_LABELS, TODO_STATUS_LABELS } from "@/lib/types";
import { CircleCheck, ChevronDown, Info, OctagonAlert, TriangleAlert, X } from "lucide-react";
import { canMeasure, fontFromComputed, naturalWidth } from "@/lib/typography";
// Magic UI 三件套本地化资产：数字滚动（anime.js 引擎）与光束描边
import { useNumberTicker } from "@/components/magicui/number-ticker";
import BorderBeam from "@/components/magicui/border-beam";

/* ---------------- Button ---------------- */

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  size = "md",
  type = "button",
  className = "",
  ...buttonProps
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  variant?: "primary" | "outline" | "danger" | "ghost";
  size?: "sm" | "md";
  type?: "button" | "submit";
  /** 追加类名（外边距等布局修饰） */
  className?: string;
}) {
  const base =
    "inline-flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl font-medium select-none " +
    "transition-[color,background-color,border-color,box-shadow,transform] duration-150 " +
    "active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50 " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-2";
  const sizes = size === "sm" ? "px-2.5 py-1 text-xs" : "px-4 py-2 text-sm";
  const variants = {
    // 主操作：品牌粉底 + 光晕阴影 + hover 一次性光泽扫过（btn-sheen 仅给主按钮，降噪纪律）；
    // 按压加深一档，hover 微提亮呼应扫光
    primary:
      "bg-brand-600 text-white shadow-cta hover:bg-brand-700 active:bg-brand-800",
    outline:
      "border border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400 hover:bg-neutral-50",
    // 破坏性操作：不做缩放反馈，以示慎重
    danger: "bg-red-600 text-white hover:bg-red-700 active:scale-100 focus-visible:ring-red-500/60",
    ghost: "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
  };
  return (
    <button
      {...buttonProps}
      type={type}
      className={`${base} ${sizes} ${variants[variant]} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

/* ---------------- Card ---------------- */

export function Card({
  children,
  className = "",
  interactive = false,
  style,
  ...cardProps
}: HTMLAttributes<HTMLDivElement> & {
  /** 可交互卡片：悬停时抬升阴影并点亮品牌描边（用于可点击的项目行等） */
  interactive?: boolean;
  /** 透传内联样式（如入场 stagger 的 animationDelay） */
  style?: React.CSSProperties;
}) {
  const interactiveCls = interactive
    ? "cursor-pointer transition-[box-shadow,background-color] duration-150 hover:bg-neutral-50 hover:shadow-md"
    : "";
  return (
    <div
      {...cardProps}
      style={style}
      className={`rounded-[22px] bg-white shadow-card ${interactiveCls} ${className}`}
    >
      {children}
    </div>
  );
}

/* ---------------- Badge ---------------- */

export function Badge({
  children,
  color = "neutral",
  icon,
}: {
  children: ReactNode;
  color?: string;
  /** 可选的行内小图标（lucide，尺寸由调用方给 h-3 w-3 之类） */
  icon?: ReactNode;
}) {
  const colors: Record<string, string> = {
    neutral: "bg-neutral-100 text-neutral-600",
    red: "bg-red-50 text-red-700",
    amber: "bg-amber-50 text-amber-700",
    green: "bg-green-50 text-green-700",
    blue: "bg-blue-50 text-blue-700",
    pink: "bg-brand-50 text-brand-700",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${colors[color] ?? colors.neutral}`}
    >
      {icon}
      {children}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const map: Record<Severity, string> = { high: "red", medium: "amber", low: "blue" };
  return <Badge color={map[severity]}>{SEVERITY_LABELS[severity]}风险</Badge>;
}

export function TypeBadge({ type }: { type: FindingType }) {
  const map: Record<FindingType, string> = {
    confirmed_risk: "red",
    unverified_risk: "amber",
    requirement_gap: "blue",
    protected: "green",
    not_applicable: "neutral",
    baseline_issue: "blue",
  };
  return <Badge color={map[type]}>{FINDING_TYPE_LABELS[type]}</Badge>;
}

const TODO_STATUS_COLOR: Record<TodoStatus, string> = {
  pending: "neutral",
  in_chat: "blue",
  awaiting_confirm: "amber",
  re_evaluating: "blue",
  done: "green",
  needs_manual: "red",
  retryable_error: "red",
};

export function TodoStatusBadge({ status }: { status: TodoStatus }) {
  return <Badge color={TODO_STATUS_COLOR[status] ?? "neutral"}>{TODO_STATUS_LABELS[status] ?? status}</Badge>;
}

/* ---------------- Spinner ---------------- */

export function Spinner({ label = "加载中…" }: { label?: string }) {
  return (
    <div className="flex animate-fade-in items-center gap-2 text-sm text-neutral-500">
      {/* 双色风车：brand 玫瑰主导 + 丁香补 segment，旋转自带极光色感 */}
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-r-aurora-lilac-300/70 border-t-brand-600" />
      {label}
    </div>
  );
}

/* ---------------- Banner ---------------- */

const BANNER_STYLE = {
  info: {
    box: "bg-blue-50 border-blue-200 text-blue-800",
    Icon: Info,
  },
  // 警示采用"白底 + 左侧色条"降噪变体：合规声明等重要但不紧急的信息不应像错误页
  warn: {
    box: "border-l-4 border-l-amber-500 bg-white ring-1 ring-amber-100 text-neutral-700",
    Icon: TriangleAlert,
  },
  error: {
    box: "bg-red-50 border-red-200 text-red-800",
    Icon: OctagonAlert,
  },
  success: {
    box: "bg-green-50 border-green-200 text-green-800",
    Icon: CircleCheck,
  },
} as const;

export function Banner({
  kind = "info",
  title,
  children,
  onClose,
}: {
  kind?: keyof typeof BANNER_STYLE;
  title?: string;
  children: ReactNode;
  /** 可选关闭按钮：传入即渲染右侧 ×；不传保持原常驻形态（向后兼容，既有调用零改动） */
  onClose?: () => void;
}) {
  const { box, Icon } = BANNER_STYLE[kind];
  const iconColor =
    kind === "info"
      ? "text-blue-500"
      : kind === "warn"
        ? "text-amber-500"
        : kind === "error"
          ? "text-red-500"
          : "text-green-600";
  return (
    <div
      className={`flex animate-fade-in items-start gap-2.5 rounded-xl border px-4 py-3 text-sm leading-relaxed ${box}`}
      role={kind === "error" ? "alert" : "status"}
    >
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconColor}`} aria-hidden />
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children}
      </div>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭通知"
          className="ml-auto shrink-0 rounded-md p-1 opacity-50 transition-[opacity,background-color] duration-150 hover:bg-black/5 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

/* ---------------- 表单原语（Input / Textarea / Select） ---------------- */

// 统一字段样式：聚焦时品牌色描边 + 柔和光环
const fieldBase =
  "w-full min-h-11 rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-neutral-900 " +
  "placeholder:text-neutral-400 outline-none transition-[border-color,box-shadow] duration-150 " +
  "focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 " +
  "disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-400";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className = "", ...rest },
  ref,
) {
  return <input ref={ref} className={`${fieldBase} ${className}`} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className = "", ...rest }, ref) {
    return <textarea ref={ref} className={`${fieldBase} min-h-[72px] ${className}`} {...rest} />;
  },
);

export const Select = forwardRef<
  HTMLSelectElement,
  Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> & { size?: "sm" | "md" }
>(function Select({ className = "", children, size = "md", ...rest }, ref) {
  // sm 紧凑档：不强制 w-full（行内密集场景），复刻 fieldBase 的品牌 focus 语言
  const smBase =
    "appearance-none rounded-md border border-neutral-300 bg-white py-1 pl-2 pr-7 text-xs text-neutral-900 " +
    "outline-none transition-[border-color,box-shadow] duration-150 " +
    "focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 " +
    "disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-400";
  const mdBase = `${fieldBase} appearance-none pr-8`;
  return (
    <div className={size === "sm" ? "relative inline-block align-middle" : "relative"}>
      <select ref={ref} className={`${size === "sm" ? smBase : mdBase} ${className}`} {...rest}>
        {children}
      </select>
      {/* 自绘下拉箭头：消除原生外观的平台差异 */}
      <ChevronDown
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-neutral-400 ${size === "sm" ? "right-1.5 h-3.5 w-3.5" : "right-2.5 h-4 w-4"}`}
        aria-hidden
      />
    </div>
  );
});

/* ---------------- SegmentedControl（分段切换） ---------------- */

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "md",
}: {
  options: ReadonlyArray<{ value: T; label: string; icon?: ReactNode }>;
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  const itemSize = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm";
  return (
    <div
      className="inline-flex gap-1 rounded-lg bg-neutral-100/80 p-1 ring-1 ring-inset ring-white/60 backdrop-blur-sm"
      role="tablist"
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(opt.value)}
            className={`inline-flex items-center gap-1.5 rounded-md transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 ${itemSize} ${
              selected
                ? "bg-white font-medium text-neutral-900 shadow-sm ring-1 ring-inset ring-black/[0.04]"
                : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {opt.icon ? opt.icon : null}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- FileField（文件选择域） ---------------- */

export function FileField({
  inputRef,
  label,
  hint,
  accept,
  multiple = false,
  icon,
  selectedFiles = [],
  onFilesChange,
}: {
  /** 业务层的文件收集 ref——数据流与裸 input 时代完全一致 */
  inputRef: React.RefObject<HTMLInputElement | null>;
  label: string;
  hint?: string;
  accept?: string;
  multiple?: boolean;
  /** 左侧展示图标（lucide 组件元素） */
  icon?: ReactNode;
  /** 由业务层保存的待上传文件。避免页面刷新状态后只依赖隐藏 input。 */
  selectedFiles?: File[];
  onFilesChange?: (files: File[]) => void;
}) {
  useEffect(() => {
    if (!selectedFiles.length && inputRef.current) inputRef.current.value = "";
  }, [inputRef, selectedFiles.length]);

  const readableSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div>
      <label className={`flex min-h-[88px] cursor-pointer items-center gap-3 rounded-[16px] border-2 border-dashed bg-white p-4 transition-[border-color,background-color,box-shadow,transform] duration-150 active:scale-[0.96] focus-within:ring-4 focus-within:ring-brand-500/15 ${selectedFiles.length ? "border-brand-400 bg-brand-50/35 shadow-focus" : "border-neutral-300 hover:border-brand-400 hover:bg-brand-50/40"}`}>
        {icon ? <span className="grid h-8 w-8 shrink-0 place-items-center text-brand-500">{icon}</span> : null}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-neutral-700">{selectedFiles.length ? `${selectedFiles.length} 个文件已选中` : label}</span>
          {hint ? <span className="mt-0.5 block text-xs leading-relaxed text-neutral-400">{hint}</span> : null}
        </span>
        <span className="grid min-h-9 shrink-0 place-items-center rounded-xl bg-neutral-100 px-3 text-[11px] font-medium text-neutral-600">{selectedFiles.length ? "重新选择" : "浏览"}</span>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="sr-only"
          onChange={(event) => onFilesChange?.(Array.from(event.currentTarget.files ?? []))}
        />
      </label>
      {selectedFiles.length ? (
        <div className="mt-2 rounded-xl bg-white px-3 py-2 ring-1 ring-neutral-200">
          <div className="flex items-center justify-between gap-3">
            <ul className="min-w-0 flex-1 space-y-1" aria-label="待上传文件">
              {selectedFiles.map((file) => (
                <li key={`${file.name}-${file.size}-${file.lastModified}`} className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate font-medium text-neutral-700">{file.name}</span>
                  <span className="shrink-0 tabular-nums text-neutral-400">{readableSize(file.size)}</span>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => onFilesChange?.([])} className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">清空</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- EmptyState（空态） ---------------- */

export function EmptyState({
  icon,
  illustration,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  illustration?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-8 text-center">
      {illustration ? <div className="mb-1 flex h-20 items-center justify-center text-brand-600">{illustration}</div> : null}
      {icon ? (
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-50 text-brand-700 shadow-[inset_0_0_0_1px_rgb(199_244_0/0.24)]">
          {icon}
        </span>
      ) : null}
      <p className="mt-3 text-sm font-semibold leading-6 text-neutral-800">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-xs leading-5 text-neutral-500">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/* ---------------- Skeleton（骨架屏） ---------------- */

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-shimmer relative overflow-hidden rounded-md bg-neutral-100 ${className}`}
      // 扫光骨架屏：品牌化高光白(#f8f4f6)横向掠过替代呼吸闪烁；
      // 「加载中」属信息型动画，在 infinite 白名单内，reduced-motion 时被全局关停
      style={{
        backgroundImage: "linear-gradient(110deg, #eeeeee 8%, #f8f4f6 30%, #eeeeee 52%)",
        backgroundSize: "220% 100%",
      }}
    />
  );
}

/* ---------------- StatTile（统计卡） ---------------- */

// 统计卡图标格：四档语义色的渐变化升级（浅入更浅的斜向渐变 + 内嵌同系描边），质感更挺括
const STAT_TONE = {
  risk: "bg-gradient-to-br from-red-100 to-red-50 text-red-600 ring-1 ring-inset ring-red-100",
  warn: "bg-gradient-to-br from-amber-100 to-amber-50 text-amber-600 ring-1 ring-inset ring-amber-100",
  info: "bg-gradient-to-br from-blue-100 to-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100",
  ok: "bg-gradient-to-br from-green-100 to-green-50 text-green-600 ring-1 ring-inset ring-green-100",
} as const;

export function StatTile({
  icon,
  tone,
  count,
  label,
  beamed,
}: {
  icon: ReactNode;
  tone: keyof typeof STAT_TONE;
  count: number;
  label: string;
  /** true 时叠加 BorderBeam 信息型光束（如报告页「已确认风险」>0 的持续信号），由调用方按语义决定 */
  beamed?: boolean;
}) {
  // F7 · 数字滚动升级（anime.js v4 easeOutExpo）+ pretext 预固定终值宽度：滚动期间容器零抖动
  const shown = useNumberTicker(count);
  const numRef = useRef<HTMLParagraphElement>(null);
  const [minW, setMinW] = useState<number | null>(null);
  useEffect(() => {
    const el = numRef.current;
    if (!el || !canMeasure) return;
    // 挂载后测量终值宽度并锁定 minWidth，一次即终态非级联
    setMinW((naturalWidth(String(count), fontFromComputed(el, "600 24px sans-serif")) ?? 0) + 1);
  }, [count]);
  return (
    <Card className="p-4 transition-shadow duration-300 hover:shadow-halo">
      <div className="flex items-center gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${STAT_TONE[tone]}`}>
          {icon}
        </span>
        <div className="min-w-0">
          {/* tabular-nums + pretext minWidth 双保险：数字滚动时卡片纹丝不动 */}
          <p
            ref={numRef}
            style={minW ? { minWidth: minW } : undefined}
            className="text-2xl font-semibold tabular-nums tracking-tightest text-neutral-900"
          >
            {shown}
          </p>
          <p className="truncate text-xs text-neutral-500">{label}</p>
        </div>
      </div>
      {/* 信息型光束描边：仅在调用方声明语义时挂载；Card 已相对定位承接 inset 环 */}
      {beamed ? <BorderBeam mode="always" duration={5} /> : null}
    </Card>
  );
}
