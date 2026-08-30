// AuroraText · Magic UI (magicui.design, MIT) 本地化版
// 为极光设计语言定制：brand → lilac → peach 的四段渐变沿背景慢速流动。
// 纪律对齐（hersafe-ui-design-language）：
// - 仅限 ≥24px 大标题使用（lilac-600 端点满足 AA-large 3:1），正文禁用；
// - 流速属氛围档（≥2.4s 且极慢速），prefers-reduced-motion 由 globals.css 全局闸门关停。
"use client";

import type { ReactNode } from "react";

export default function AuroraText({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  // 渐变本体与动效在 .text-aurora-flow（globals.css），组件只做语义封装
  return <span className={`text-aurora-flow ${className}`}>{children}</span>;
}
