// BorderBeam · Magic UI 风格「光束描边」本地化版（conic 旋转环 + mask 挖边实现）
// 展示纪律（呼应全站动效三纪律）：默认完全隐藏——
// - mode="hover"：父级容器获得 .group 且被 hover 时亮起（装饰型不驻留、不无限循环驻屏）
// - mode="always"：仅用于「分析中」等信息型场景（落入 infinite 白名单）
// 用法：放在任意 relative + rounded-* 容器内即可，光束沿容器圆角描边流动。
"use client";

import type { CSSProperties } from "react";

export default function BorderBeam({
  mode = "hover",
  duration = 7,
}: {
  mode?: "hover" | "always";
  /** 一圈秒数；信息型场景建议 ≤3s，装饰型建议 ≥5s */
  duration?: number;
}) {
  return (
    <div
      aria-hidden
      data-mode={mode}
      style={{ "--beam-duration": `${duration}s` } as CSSProperties}
      className="border-beam pointer-events-none absolute inset-0 z-[1] select-none"
    >
      {/* 单一伪元素承担 conic 光束旋转，mask 只保留 1.5px 外环 */}
      <span className="beam-ring" />
    </div>
  );
}
