// Pretext 排印工具层（@chenglou/pretext）
// 核心价值：绕开 DOM reflow 的文本测量——收缩贴合、平衡断行、精确宽度预测。
// ⚠️ prepare() 依赖浏览器 Canvas 2D，SSR/Node 不可用：
//    所有函数带 canMeasure 守卫，服务端/首帧返回 null，由调用方回退为未测量形态（auto 宽度），
//    客户端 effect 内测量后再应用。measureCache 按「文本+字体+选项」缓存 prepared 句柄（prepare 是重活，禁止重复跑）。
import {
  prepare,
  prepareWithSegments,
  layout,
  layoutWithLines,
  measureLineStats,
  measureNaturalWidth,
  walkLineRanges,
  type PreparedText,
  type PreparedTextWithSegments,
} from "@chenglou/pretext";
// 富内联流是独立子路径导出（package.json exports["./rich-inline"]）
import {
  prepareRichInline,
  layoutNextRichInlineLineRange,
  materializeRichInlineLineRange,
  type RichInlineItem,
} from "@chenglou/pretext/rich-inline";

/** 浏览器能力守卫：Canvas 2D + Intl.Segmenter 双依赖（README Caveats） */
export const canMeasure =
  typeof document !== "undefined" && typeof Intl !== "undefined" && "Segmenter" in Intl;

/** 全站测量用字体栈（与 tailwind fontFamily.sans 对齐的 canvas font 片段，不含字号/字重） */
export const SANS_STACK = '"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';

const preparedCache = new Map<string, PreparedText>();
const preparedSegCache = new Map<string, PreparedTextWithSegments>();

/** 从任意 DOM 元素提取 canvas font 简写——保证测量字体与真实渲染字体逐像素一致 */
export function fontFromComputed(el: HTMLElement, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const cs = getComputedStyle(el);
  return `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
}

function getPrepared(text: string, font: string, letterSpacing?: number): PreparedText | null {
  if (!canMeasure) return null;
  const key = `${font}|${letterSpacing ?? 0}|${text}`;
  let p = preparedCache.get(key);
  if (!p) {
    p = prepare(text, font, letterSpacing !== undefined ? { letterSpacing } : undefined);
    preparedCache.set(key, p);
  }
  return p;
}

function getPreparedSeg(text: string, font: string, letterSpacing?: number): PreparedTextWithSegments | null {
  if (!canMeasure) return null;
  const key = `${font}|${letterSpacing ?? 0}|${text}`;
  let p = preparedSegCache.get(key);
  if (!p) {
    p = prepareWithSegments(text, font, letterSpacing !== undefined ? { letterSpacing } : undefined);
    preparedSegCache.set(key, p);
  }
  return p;
}

/** 单行自然宽度（不含换行折叠）——标签/铭牌/气泡贴合的基础量 */
export function naturalWidth(text: string, font: string, letterSpacing?: number): number | null {
  const p = getPreparedSeg(text, font, letterSpacing);
  return p ? measureNaturalWidth(p) : null;
}

/** 多行收缩贴合：给定最大宽度，返回「装得下内容的最紧宽度」与行数。
    气泡、铭牌、活字块用——CSS 十几年做不到的 multiline shrinkwrap */
export function shrinkWrap(
  text: string,
  font: string,
  maxWidth: number,
  lineHeight = 0,
  letterSpacing?: number,
): { width: number; lineCount: number } | null {
  const p = getPreparedSeg(text, font, letterSpacing);
  if (!p) return null;
  const stats = measureLineStats(p, maxWidth);
  if (stats.lineCount <= 1) return { width: measureNaturalWidth(p), lineCount: 1 };
  // 多行时二分逼近「恰好保持目标行数的最小宽度」，即最紧的收缩宽
  let lo = Math.max(1, stats.maxLineWidth * 0.5);
  let hi = maxWidth;
  let best = maxWidth;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (measureLineStats(p, mid).lineCount <= stats.lineCount) {
      best = mid;
      hi = mid;
    } else {
      lo = mid;
    }
  }
  void lineHeight;
  return { width: Math.ceil(best), lineCount: stats.lineCount };
}

/** 平衡断行：在 [minWidth, maxWidth] 内寻找「恰好 targetLines 行且各行宽度最均衡」的容器宽。
    治中文长标题「首行撑满、次行孤字」的丑断行 */
export function balancedWidth(
  text: string,
  font: string,
  maxWidth: number,
  targetLines = 2,
  letterSpacing?: number,
): number | null {
  const p = getPreparedSeg(text, font, letterSpacing);
  if (!p) return null;
  const full = measureLineStats(p, maxWidth);
  if (full.lineCount < targetLines) return null; // 目标行数装不下，交给调用方回退
  // 找到「行数降到 targetLines 的宽度下界」
  let lo = 1;
  let hi = maxWidth;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (measureLineStats(p, mid).lineCount <= targetLines) hi = mid;
    else lo = mid;
  }
  // 在下界附近细扫：挑「最宽行最窄」（即各行最均衡）的宽度
  let bestWidth = hi;
  let bestImbalance = Number.POSITIVE_INFINITY;
  for (let w = hi; w <= maxWidth; w += Math.max(1, (maxWidth - hi) / 24)) {
    let minW = Number.POSITIVE_INFINITY;
    let maxW = 0;
    walkLineRanges(p, w, (line) => {
      minW = Math.min(minW, line.width);
      maxW = Math.max(maxW, line.width);
    });
    const imbalance = maxW - minW;
    if (imbalance < bestImbalance) {
      bestImbalance = imbalance;
      bestWidth = w;
    }
  }
  return Math.ceil(bestWidth);
}

/** 预测多行文本高度（行数 × lineHeight）——滚动锚定/占位用 */
export function predictHeight(
  text: string,
  font: string,
  maxWidth: number,
  lineHeight: number,
  letterSpacing?: number,
): number | null {
  const p = getPrepared(text, font, letterSpacing);
  if (!p) return null;
  const { height } = layout(p, maxWidth, lineHeight);
  return height;
}

/** F4 · 手动断行：拿到每一行的文本与精确宽度（Hero 逐行入场等场景）。
    resize 时只需重调本函数（prepared 已缓存，纯算术热路径） */
export function layoutLines(
  text: string,
  font: string,
  maxWidth: number,
  lineHeight: number,
  letterSpacing?: number,
): Array<{ text: string; width: number }> | null {
  const p = getPreparedSeg(text, font, letterSpacing);
  if (!p) return null;
  const { lines } = layoutWithLines(p, maxWidth, lineHeight);
  return lines.map((l) => ({ text: l.text, width: l.width }));
}

/** F5 · 富内联流：chip（break:"never" 原子不拆）与普通文字混排，
    返回按行分组的片段（itemIndex 回指源数组），供渲染成「杂志式活字流」 */
export function richInlineLines(
  items: Array<{ text: string; font: string; break?: "normal" | "never"; extraWidth?: number }>,
  maxWidth: number,
): Array<Array<{ itemIndex: number; text: string }>> | null {
  if (!canMeasure) return null;
  const prepared = prepareRichInline(items as RichInlineItem[]);
  const lines: Array<Array<{ itemIndex: number; text: string }>> = [];
  let range = layoutNextRichInlineLineRange(prepared, maxWidth);
  while (range) {
    const line = materializeRichInlineLineRange(prepared, range);
    lines.push(line.fragments.map((f) => ({ itemIndex: f.itemIndex, text: f.text })));
    range = layoutNextRichInlineLineRange(prepared, maxWidth, range.end);
  }
  return lines;
}
