// NumberTicker · anime.js v4 数字滚动（Magic UI NumberTicker 思路的 anime.js 实现）
// 替代旧 rAF 手写 count-up：outExpo 缓动收尾更利落，多次触发自动合并到最新值；
// prefers-reduced-motion 直接落定值，不做任何插值。
"use client";

import { useEffect, useRef, useState } from "react";
import { animate, type JSAnimation } from "animejs";

/** 数值滚动 hook：返回当前展示值（四舍五入整数）。终态宽度防抖由调用方的 pretext minWidth 负责 */
export function useNumberTicker(value: number, duration = 900): number {
  const [display, setDisplay] = useState(value);
  // 最近一次目标值记录：重复触发同一终值时零成本跳过
  const lastTargetRef = useRef<number | null>(null);
  useEffect(() => {
    if (lastTargetRef.current === value) return;
    lastTargetRef.current = value;
    const obj = { v: display };
    // reduced-motion：并入同一流程、仅压缩时长——setState 一律经由动画回调，
    // 既符合 react-hooks/set-state-in-effect 规约，也让插值路径单一无分叉
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let inst: JSAnimation | null = animate(obj, {
      v: value,
      duration: reduced ? 1 : duration,
      ease: "outExpo", // anime.js v4 参数名为 ease
      onUpdate: () => setDisplay(Math.round(obj.v)),
    });
    return () => {
      inst?.pause?.();
      inst = null;
    };
    // display 刻意不入依赖：以 effect 启动那一刻的展示值为起点
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);
  return display;
}

export default function NumberTicker({
  value,
  duration,
  className = "",
}: {
  value: number;
  duration?: number;
  className?: string;
}) {
  return (
    <span className={`tabular-nums ${className}`}>
      <TickerText value={value} duration={duration} />
    </span>
  );
}

/** 内层组件：让 hook 的消费组件与样式壳分离，避免外层 span 重渲染干扰计时 */
function TickerText({ value, duration }: { value: number; duration?: number }) {
  const shown = useNumberTicker(value, duration);
  return <>{shown}</>;
}
