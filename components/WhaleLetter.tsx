// 开场短笺（WhaleLetter）——彩绘首字下沉 + 一段产品叙事，正文用 pretext
// 的「每行不同宽度」能力排版。单鲸纪律：短笺内不绘制鲸鱼——全站唯一的粉鲸
// 住在 FloatingWhale 全屏巡游层；但鲸位（whaleState 每帧广播）会实时驱动
// 本段绕排：鲸游进短笺，文字像水流分开让路，游远后合拢复原——「发光龙」式
// 龙过字随的排版交互（pretextjs.dev showcase-illuminated-dragon 同款思路）。
"use client";

import { useEffect, useRef } from "react";
import {
  layoutNextLine,
  measureLineStats,
  prepareWithSegments,
  type LayoutCursor,
  type PreparedTextWithSegments,
} from "@chenglou/pretext";
import { canMeasure, naturalWidth, SANS_STACK } from "@/lib/typography";
import { whaleState } from "@/lib/whale-state";

const TEXT =
  "每一件健康产品上线之前，都值得被认真地问一句：她用起来，安全吗？她测把一张张截图变成证据，把模糊的直觉变成可核查的规则——经期与生育、孕期产后，逐条对照有来源的女性健康专项规则；证据不足就先补证，已有保护就确认，绝不凭「看起来没问题」下结论。我们相信，为女性设计从来不只是一句口号，而是一行一行可以被验证的细节：一次透明的授权、一个能一键撤回的伴侣权限、一条不再刺痛人的推送。愿每一次改版的深夜，都有她在屏幕之外的安心。";

const BODY_FONT = `16px ${SANS_STACK}`;
const BODY_LINE = 30; // 行高
const PAD_TOP = 18;
const DROP_LINES = 3; // 首字下沉占 3 行
const DROP_FONT = `600 64px ${SANS_STACK}`;
// 鲸身剪影半长/半高基准（与 lib/whale.ts 吻端 95、半高 30 对齐），
// 运行时按 whaleState.scale（全屏鲸当前绘制比例，随视口宽度 0.55-0.9）换算
const WHALE_BODY_HALF_W = 95;
const WHALE_BODY_HALF_H = 30;
const WHALE_CLEAR = 14; // 文字与鲸身净距（旧版 82px 被吐槽「间隔太大」的根因之一）

export default function WhaleLetter() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (!canMeasure) return; // 无 Canvas/Segmenter 的环境直接不渲染短笺

    const dpr = Math.min(2, window.devicePixelRatio || 1);

    // 正文（去掉首字——首字单独作彩绘下沉）
    const body = TEXT.slice(1);
    const prep: PreparedTextWithSegments = prepareWithSegments(body, BODY_FONT);
    const dropChar = TEXT[0];
    const dropW = naturalWidth(dropChar, DROP_FONT) ?? 64;
    const dropCapW = dropW + 16;

    let W = 0;
    let H = 0;

    const measure = () => {
      W = canvas.parentElement!.clientWidth;
      // 高度 = 实测行数（满宽 pretext 测量）+ 2 行绕排余量。
      // 旧公式按 0.55×W 悲观估计多算 ~4 行，是页面中部大空白的元凶
      const baseLines = measureLineStats(prep, W).lineCount;
      H = PAD_TOP + (baseLines + 2) * BODY_LINE + 8;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.height = `${H}px`;
    };

    /** 单帧排版 + 绘制。whale 为 null 时整段满宽静态排版 */
    const render = (now: number, whale: { x: number; y: number; dx: number } | null) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // 彩绘首字：丁香→玫瑰纵向渐变下沉
      const dgrad = ctx.createLinearGradient(0, PAD_TOP, 0, PAD_TOP + DROP_LINES * BODY_LINE);
      dgrad.addColorStop(0, "#ad2259"); // brand-700
      dgrad.addColorStop(1, "#7a4fd0"); // aurora.lilac-600
      ctx.fillStyle = dgrad;
      ctx.font = DROP_FONT;
      ctx.textBaseline = "top";
      ctx.fillText(dropChar, 2, PAD_TOP - 6);

      // 正文：layoutNextLine 逐行排版，行宽随「首字下沉区 / 鲸身占位」变化。
      // 绕排用椭圆弦长模型：距鲸中心越远的行弦宽越窄（几乎不让位），
      // 消除旧版固定半径「隔空矩形空洞」造成的巨大间隔
      ctx.font = BODY_FONT;
      ctx.fillStyle = "rgba(41, 37, 36, 0.92)"; // stone-800 微透
      ctx.textBaseline = "top";
      let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
      let line = 0;
      const wy = whale ? whale.y : null;
      const wx = whale ? whale.x : null;
      // 鲸身椭圆半轴按全屏鲸当前绘制比例换算（鲸变大变小，让位孔洞随之缩放）
      const halfW = WHALE_BODY_HALF_W * whaleState.scale;
      const rh = WHALE_BODY_HALF_H * whaleState.scale + WHALE_CLEAR; // 椭圆纵半径

      for (let guard = 0; guard < 60; guard++) {
        const yTop = PAD_TOP + line * BODY_LINE;
        const yMid = yTop + BODY_LINE / 2;
        const x0 = line < DROP_LINES ? dropCapW : 0;
        // 本行的鲸身避让窗口（弦半宽随垂直距收窄）
        let holeL: number | null = null;
        let holeR: number | null = null;
        if (wx !== null && wy !== null) {
          const dy = yMid - wy;
          if (Math.abs(dy) < rh) {
            const chord = Math.sqrt(1 - (dy / rh) ** 2);
            const half = halfW * chord + WHALE_CLEAR;
            holeL = wx - half;
            holeR = wx + half;
          }
        }

        if (holeL === null || holeR === null) {
          const l = layoutNextLine(prep, cursor, W - x0 - 4);
          if (!l) break;
          ctx.fillText(l.text, x0, yTop + 4);
          cursor = l.end;
        } else {
          const leftEdge = Math.max(holeL, x0 + 60);
          const leftW = leftEdge - x0;
          if (leftW >= 96) {
            // 鲸左段：从 x0 排到鲸缘，再从鲸右侧续排右段——一行被鲸「分开」
            const l1 = layoutNextLine(prep, cursor, leftW);
            if (!l1) break;
            ctx.fillText(l1.text, x0, yTop + 4);
            const l2 = layoutNextLine(prep, l1.end, W - holeR - 4);
            if (l2) {
              ctx.fillText(l2.text, holeR, yTop + 4);
              cursor = l2.end;
            } else break;
          } else {
            // 鲸太靠左压住行首：整行让到鲸右侧
            const l = layoutNextLine(prep, cursor, W - holeR - 4);
            if (!l) break;
            ctx.fillText(l.text, holeR, yTop + 4);
            cursor = l.end;
          }
        }
        line++;
      }
    };

    measure();
    render(performance.now(), null); // 首帧满宽静态排版（whaleState 尚未激活）

    // ===== 「发光龙」式实时绕排：鲸游近短笺时逐帧让位排版，游远后满宽复原。
    // 近距门控：鲸远离时完全跳过排版绘制，rAF 空转成本≈0 =====
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      let raf = 0;
      let near = false;
      const NEAR_MARGIN = 280; // 提前 280px 开始绕排，避免鲸到眼前才突然分开
      const isNearWhale = (rect: DOMRect) => {
        if (!whaleState.active) return false;
        const lx = whaleState.x - rect.left;
        const ly = whaleState.y - rect.top;
        return (
          lx > -NEAR_MARGIN &&
          ly > -NEAR_MARGIN &&
          lx < rect.width + NEAR_MARGIN &&
          ly < rect.height + NEAR_MARGIN
        );
      };
      const loop = (now: number) => {
        const rect = canvas.getBoundingClientRect();
        if (isNearWhale(rect)) {
          render(now, {
            x: whaleState.x - rect.left,
            y: whaleState.y - rect.top,
            dx: whaleState.vx,
          });
        } else if (near) {
          render(now, null); // 鲸刚游远 → 恢复满宽排版一帧
        }
        near = isNearWhale(rect);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);

      const onResizeLive = () => {
        measure();
        // resize 重置位图后按当前远近立即补一帧
        const rect = canvas.getBoundingClientRect();
        render(
          performance.now(),
          isNearWhale(rect)
            ? {
                x: whaleState.x - rect.left,
                y: whaleState.y - rect.top,
                dx: whaleState.vx,
              }
            : null,
        );
      };
      window.addEventListener("resize", onResizeLive);
      return () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", onResizeLive);
      };
    }

    // reduced-motion：不接鲸位、不启动循环——整段保持满宽静态排版（可读性优先）
    const onResize = () => {
      measure();
      render(performance.now(), null);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <canvas ref={canvasRef} role="img" aria-label={TEXT} className="block w-full" />;
}
