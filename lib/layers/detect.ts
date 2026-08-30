// 图层检测引擎 —— 纯函数、确定性、零模型费用（PRD F2.1 / ROADMAP T2.1）
// 流程：灰度 → Sobel 边缘 → 自适应阈值 → 膨胀 → 连通区域 → 候选矩形
//       + 颜色量化区域分析（捕获无强边缘的大色块卡片/面板）
//       → 过滤（过小/过大）→ 合并（IoU/包含）→ 类型启发式分类 → 稳定排序
// 只回答“页面上可能有哪些视觉对象”，不理解业务含义（PRD 边界）。

import type { ControlKind } from "@/lib/types";
import type { RawImage } from "@/lib/parsers/phash";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DetectedControl extends Rect {
  kind: ControlKind;
  /** 0-1 启发式置信度（边缘密度），用于排序而非判定 */
  confidence: number;
  /** 检测来源：edge 边缘轮廓 | region 颜色区域 */
  source: "edge" | "region";
}

export interface DetectOptions {
  /** 最小边长（px），小于此值的噪声块丢弃 */
  minSize?: number;
  /** 候选框占整图面积比例上限（超过视为背景，非面板） */
  maxFillRatio?: number;
  /** Sobel 阈值系数：threshold = mean + k * std */
  edgeK?: number;
  /** 合并时的 IoU 阈值 */
  mergeIoU?: number;
  /** 是否过滤手机系统状态栏、底部手势区 */
  ignoreSystemChrome?: boolean;
  /** 相邻小图标与文字的最大合并间距（px） */
  nearbyGap?: number;
}

const DEFAULTS: Required<DetectOptions> = {
  minSize: 14,
  maxFillRatio: 0.92,
  edgeK: 0.6,
  mergeIoU: 0.45,
  ignoreSystemChrome: true,
  nearbyGap: 18,
};

/** 灰度化 */
export function toGrayscale(img: RawImage): Float64Array {
  const { width, height, data } = img;
  const gray = new Float64Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return gray;
}

/** Sobel 梯度幅值图 */
export function sobelMagnitude(gray: Float64Array, width: number, height: number): Float64Array {
  const mag = new Float64Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const tl = gray[i - width - 1],
        t = gray[i - width],
        tr = gray[i - width + 1];
      const l = gray[i - 1],
        r = gray[i + 1];
      const bl = gray[i + width - 1],
        b = gray[i + width],
        br = gray[i + width + 1];
      const gx = -tl - 2 * l - bl + tr + 2 * r + br;
      const gy = -tl - 2 * t - tr + bl + 2 * b + br;
      mag[i] = Math.hypot(gx, gy);
    }
  }
  return mag;
}

/** 自适应二值化：threshold = mean + k * std */
export function adaptiveThreshold(mag: Float64Array, k: number): { binary: Uint8Array; threshold: number } {
  let sum = 0;
  for (const v of mag) sum += v;
  const mean = sum / mag.length;
  let sq = 0;
  for (const v of mag) sq += (v - mean) * (v - mean);
  const std = Math.sqrt(sq / mag.length);
  const threshold = mean + k * std;
  const binary = new Uint8Array(mag.length);
  for (let i = 0; i < mag.length; i++) binary[i] = mag[i] > threshold && mag[i] > 24 ? 1 : 0; // 下限去平场噪声
  return { binary, threshold };
}

/** 3×3 膨胀（闭合边缘断口，使轮廓连通） */
export function dilate(binary: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(binary.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (binary[i]) {
        out[i] = 1;
        continue;
      }
      let hit = 0;
      for (let dy = -1; dy <= 1 && !hit; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx,
            ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height && binary[ny * width + nx]) {
            hit = 1;
            break;
          }
        }
      }
      out[i] = hit;
    }
  }
  return out;
}

/** 连通区域标记（4 邻接，迭代栈避免递归溢出）→ 每个连通分量的外接矩形 */
export function connectedRects(
  mask: Uint8Array,
  width: number,
  height: number,
): Array<Rect & { pixels: number }> {
  const labels = new Int32Array(mask.length).fill(-1);
  const rects: Array<Rect & { pixels: number }> = [];
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start] !== -1) continue;
    const comp = rects.length;
    let minX = width,
      maxX = 0,
      minY = height,
      maxY = 0,
      count = 0;
    stack.length = 0;
    stack.push(start);
    labels[start] = comp;
    while (stack.length) {
      const i = stack.pop()!;
      const y = (i / width) | 0;
      const x = i - y * width;
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      // 4 邻接
      if (x > 0 && mask[i - 1] && labels[i - 1] === -1) {
        labels[i - 1] = comp;
        stack.push(i - 1);
      }
      if (x < width - 1 && mask[i + 1] && labels[i + 1] === -1) {
        labels[i + 1] = comp;
        stack.push(i + 1);
      }
      if (y > 0 && mask[i - width] && labels[i - width] === -1) {
        labels[i - width] = comp;
        stack.push(i - width);
      }
      if (y < height - 1 && mask[i + width] && labels[i + width] === -1) {
        labels[i + width] = comp;
        stack.push(i + width);
      }
    }
    rects.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, pixels: count });
  }
  return rects;
}

/** 颜色量化区域分析：RGB 各取高 3 位（512 色），同色连通区域 → 大色块候选 */
export function colorRegionRects(img: RawImage): Array<Rect & { pixels: number }> {
  const { width, height, data } = img;
  const quant = new Int32Array(width * height);
  for (let p = 0; p < width * height; p++) {
    const i = p * 4;
    quant[p] = ((data[i] >> 5) << 6) | ((data[i + 1] >> 5) << 3) | (data[i + 2] >> 5);
  }
  const labels = new Int32Array(width * height).fill(-1);
  const rects: Array<Rect & { pixels: number }> = [];
  const stack: number[] = [];
  const total = width * height;
  for (let start = 0; start < total; start++) {
    if (labels[start] !== -1) continue;
    const color = quant[start];
    const comp = rects.length;
    let minX = width,
      maxX = 0,
      minY = height,
      maxY = 0,
      count = 0;
    stack.length = 0;
    stack.push(start);
    labels[start] = comp;
    while (stack.length) {
      const i = stack.pop()!;
      const y = (i / width) | 0;
      const x = i - y * width;
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0 && labels[i - 1] === -1 && quant[i - 1] === color) {
        labels[i - 1] = comp;
        stack.push(i - 1);
      }
      if (x < width - 1 && labels[i + 1] === -1 && quant[i + 1] === color) {
        labels[i + 1] = comp;
        stack.push(i + 1);
      }
      if (y > 0 && labels[i - width] === -1 && quant[i - width] === color) {
        labels[i - width] = comp;
        stack.push(i - width);
      }
      if (y < height - 1 && labels[i + width] === -1 && quant[i + width] === color) {
        labels[i + width] = comp;
        stack.push(i + width);
      }
    }
    rects.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, pixels: count });
  }
  return rects;
}

/** 两矩形 IoU */
export function iou(a: Rect, b: Rect): number {
  const x1 = Math.max(a.x, b.x),
    y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w),
    y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (inter <= 0) return 0;
  const union = a.w * a.h + b.w * b.h - inter;
  return inter / union;
}

/** b 是否大部分包含于 a（包含率 ≥0.8 视为包含） */
export function contains(a: Rect, b: Rect): boolean {
  const x1 = Math.max(a.x, b.x),
    y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w),
    y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / (b.w * b.h) >= 0.8;
}

/** 合并重叠候选（IoU 达标或包含），保留更大的框 */
export function mergeRects(rects: Rect[], ioUThreshold: number): Rect[] {
  const result: Rect[] = [...rects];
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const a = result[i],
          b = result[j];
        const overlap = iou(a, b) >= ioUThreshold || contains(a, b) || contains(b, a);
        if (overlap) {
          // 保留面积更大者
          const keep = a.w * a.h >= b.w * b.h ? a : b;
          result[i] = keep;
          result.splice(j, 1);
          changed = true;
          break outer;
        }
      }
    }
  }
  return result;
}

/**
 * 合并同一功能入口中相邻的图标与文字。
 * 仅处理高度相近、处于同一行且组合后仍是局部区域的矩形，避免把整行导航或整页卡片吞成一个大框。
 */
export function mergeNearbyRects(rects: Rect[], maxGap: number, imageWidth: number): Rect[] {
  const result = [...rects];
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const a = result[i];
        const b = result[j];
        const top = Math.max(a.y, b.y);
        const bottom = Math.min(a.y + a.h, b.y + b.h);
        const verticalOverlap = Math.max(0, bottom - top) / Math.max(1, Math.min(a.h, b.h));
        const left = a.x <= b.x ? a : b;
        const right = left === a ? b : a;
        const gap = right.x - (left.x + left.w);
        const combined = {
          x: Math.min(a.x, b.x),
          y: Math.min(a.y, b.y),
          w: Math.max(a.x + a.w, b.x + b.w) - Math.min(a.x, b.x),
          h: Math.max(a.y + a.h, b.y + b.h) - Math.min(a.y, b.y),
        };
        const similarHeight = Math.max(a.h, b.h) / Math.max(1, Math.min(a.h, b.h)) <= 2.4;
        const localWidth = combined.w <= imageWidth * 0.62;
        if (gap >= 0 && gap <= maxGap && verticalOverlap >= 0.5 && similarHeight && localWidth) {
          result[i] = combined;
          result.splice(j, 1);
          changed = true;
          break outer;
        }
      }
    }
  }
  return result;
}

/** 手机长截图的系统状态栏和底部手势条不属于产品交互层。 */
export function isSystemChromeRect(rect: Rect, width: number, height: number): boolean {
  if (height <= width * 1.25) return false;
  const topBand = Math.min(88, height * 0.075);
  const bottomBand = Math.min(64, height * 0.045);
  return rect.y + rect.h <= topBand || rect.y >= height - bottomBand;
}

/** 类型启发式分类（宽高比 + 尺寸，非业务语义） */
export function classifyRect(r: Rect, imgArea: number): ControlKind {
  const { w, h } = r;
  const area = w * h;
  if (area / imgArea > 0.45) return "panel";
  if (w < 52 && h < 52 && Math.abs(w - h) < Math.max(w, h) * 0.45) return "icon";
  if (h <= 64 && w >= Math.max(56, h * 1.6)) return "button";
  if (h > 64 && w <= 240 && h / Math.max(w, 1) >= 1.6) return "input";
  if (area / imgArea > 0.12) return "card";
  if (h <= 40) return "text";
  return "unknown";
}

/**
 * 主入口：确定性候选图层检测。
 * 同一输入永远产生同一输出（顺序稳定：按 y、x 排序）。
 */
export function detectControls(img: RawImage, options: DetectOptions = {}): DetectedControl[] {
  const opts = { ...DEFAULTS, ...options };
  const { width, height } = img;
  const imgArea = width * height;

  // --- 通道 1：边缘轮廓 ---
  const gray = toGrayscale(img);
  const mag = sobelMagnitude(gray, width, height);
  const { binary } = adaptiveThreshold(mag, opts.edgeK);
  const dilated = dilate(binary, width, height);
  const edgeRects = connectedRects(dilated, width, height)
    .filter((r) => r.w >= opts.minSize && r.h >= opts.minSize)
    .filter((r) => (r.w * r.h) / imgArea <= opts.maxFillRatio);

  // --- 通道 2：颜色区域（大色块卡片/面板） ---
  const regionRects = colorRegionRects(img)
    .filter((r) => r.pixels / imgArea >= 0.004 && r.pixels / imgArea <= 0.5) // 面积占比 0.4%~50%
    .filter((r) => r.w >= opts.minSize && r.h >= opts.minSize)
    .filter((r) => (r.w * r.h) / imgArea <= opts.maxFillRatio);

  // --- 合并 ---
  const all: Array<Rect> = [
    ...edgeRects.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h })),
    ...regionRects.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h })),
  ];
  const withoutSystemChrome = opts.ignoreSystemChrome
    ? all.filter((rect) => !isSystemChromeRect(rect, width, height))
    : all;
  const merged = mergeNearbyRects(mergeRects(withoutSystemChrome, opts.mergeIoU), opts.nearbyGap, width);

  // 置信度 = 该框内边缘像素密度（归一化，仅用于排序展示）
  const controls: DetectedControl[] = merged.map((r) => {
    let edgePixels = 0;
    let total = 0;
    for (let y = r.y; y < Math.min(r.y + r.h, height); y++) {
      for (let x = r.x; x < Math.min(r.x + r.w, width); x++) {
        total++;
        if (dilated[y * width + x]) edgePixels++;
      }
    }
    const density = total > 0 ? edgePixels / total : 0;
    const kind = classifyRect(r, imgArea);
    return {
      ...r,
      kind,
      confidence: Math.min(1, Math.round((0.25 + density * 2.5) * 100) / 100),
      source: "edge" as const,
    };
  });

  // 稳定排序：y → x，保证同输入同输出
  controls.sort((a, b) => a.y - b.y || a.x - b.x);
  // 上限保护：最多 60 个候选，避免长图爆炸
  return controls.slice(0, 60);
}
