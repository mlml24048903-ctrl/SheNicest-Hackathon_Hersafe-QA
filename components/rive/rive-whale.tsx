// RiveWhale · Rive 交互式矢量鲸鱼（@rive-app/react-canvas，Apple/OpenAI 官网同款技术栈）
// 资产约定：把 Rive 编辑器导出的 whale.riv 放到 public/animations/whale.riv 即自动启用；
// 资产缺失或 WASM 加载失败时优雅降级为手绘 SVG 慢浮动鲸（氛围纪律 ≥2.4s）。
// ⚠️ 两个实测坑（均已绕开）：
//   1) 404 时 Rive loader 可能静默挂起（onLoadError 不回调）→ 先 HEAD 探测资产存在性；
//   2) useRive 的参数在 mount 后变更不会重新加载（hook 仅初始化一次）
//      → 「先探测后挂载」用独立子组件的挂载时机保证，src 在 mount 时即为有效值。
"use client";

import { useEffect, useState } from "react";
import { useRive, Layout, Fit, RuntimeLoader } from "@rive-app/react-canvas";

const RIV_SRC = "/animations/whale.riv";

// WASM 本地化：运行时默认从 unpkg CDN 拉取 rive.wasm（大文件在国内网络易静默超时），
// 改用 public/ 内托管的本地副本（node_modules/@rive-app/canvas/rive.wasm 同源版本），
// 离线演示环境同样可用——与全站「离线降级不锁死」哲学一致
RuntimeLoader.setWasmUrl("/rive.wasm");

/** 降级鲸：与 AuroraWhale 同色系的极简剪影（lilac→brand 渐变填充），慢速上下浮动 */
function FallbackWhale() {
  return (
    <svg
      viewBox="-100 -42 200 84"
      role="img"
      aria-label="游动的鲸鱼"
      className="h-full w-full animate-whale-float drop-shadow-[0_6px_18px_rgba(154,114,233,0.35)]"
    >
      <defs>
        <linearGradient id="whale-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#9a72e9" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#e34a89" stopOpacity="0.7" />
        </linearGradient>
      </defs>
      {/* 身体剪影：与 AuroraWhale canvas 版同一组贝塞尔曲线，视觉血缘一致 */}
      <path
        d="M95 0 C70 -26 10 -30 -30 -12 C-52 -5 -62 -3 -74 -8 L-48 -12 Q-66 0 -48 12 C-28 12 16 28 72 24 Z"
        fill="url(#whale-body)"
      />
      {/* 背鳍 */}
      <path d="M-6 -26 Q6 -44 24 -25 Z" fill="url(#whale-body)" />
      {/* 眼部留白高光 */}
      <circle cx="72" cy="-5" r="2.2" fill="rgba(255,255,255,0.75)" />
    </svg>
  );
}

/** 加载占位：一枚极淡呼吸圆盘（breathe 属信息型动画白名单内的既有资产），杜绝布局跳动 */
function LoadingDot({ boxStyle }: { boxStyle: React.CSSProperties }) {
  return (
    <div aria-hidden style={boxStyle} className="grid place-items-center">
      <span className="dot-breathe h-2 w-2 rounded-full bg-aurora-lilac-300" />
    </div>
  );
}

/** Rive 画布子组件：只在资产确认就绪后挂载——mount 时 src 即为有效值，绕开
    「useRive 参数变更不重载」的运行时行为；onReady/onFail 双回调供超时保险裁决 */
function RiveCanvas({
  boxStyle,
  onReady,
  onFail,
}: {
  boxStyle: React.CSSProperties;
  onReady: () => void;
  onFail: () => void;
}) {
  const { rive, RiveComponent } = useRive({
    src: RIV_SRC,
    autoplay: true,
    layout: new Layout({ fit: Fit.Contain }),
    onLoad: () => onReady(),
    onLoadError: () => onFail(),
  });
  if (!rive) return <LoadingDot boxStyle={boxStyle} />;
  return (
    <RiveComponent aria-hidden style={boxStyle} className="drop-shadow-[0_6px_18px_rgba(154,114,233,0.35)]" />
  );
}

/** 运行时装载保险时长：实测 @rive-app 在部分 Next.js 构建下 wasm 初始化会静默挂起
    （零错误零请求），4s 内未出真 canvas 即降级 SVG——演示环境永不开天窗 */
const RUNTIME_TIMEOUT_MS = 4000;

export default function RiveWhale({ size = 180 }: { size?: number }) {
  // 资产探测三态：checking（探测中）→ ready（有 .riv，挂运行时）| missing（降级 SVG）
  const [asset, setAsset] = useState<"checking" | "ready" | "missing">("checking");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(RIV_SRC, { method: "HEAD" })
      .then((r) => {
        // Next.js 404 会返回 HTML 错误页而非 .riv 二进制，content-type 一并校验
        const ct = r.headers.get("content-type") ?? "";
        if (alive) setAsset(r.ok && !ct.includes("text/html") ? "ready" : "missing");
      })
      .catch(() => {
        if (alive) setAsset("missing");
      });
    return () => {
      alive = false;
    };
  }, []);

  // 超时保险：ready 后计时，RiveCanvas 的 onLoad 未在时限内回执即落 SVG 降级
  const [runtimeOk, setRuntimeOk] = useState(false);
  useEffect(() => {
    if (asset !== "ready" || runtimeOk) return;
    const timer = setTimeout(() => setFailed(true), RUNTIME_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [asset, runtimeOk]);

  const boxStyle = { width: size, height: Math.round(size * 0.42) } as React.CSSProperties;

  if (asset === "missing" || failed) {
    return (
      <div aria-hidden style={boxStyle}>
        <FallbackWhale />
      </div>
    );
  }
  if (asset === "checking") {
    return <LoadingDot boxStyle={boxStyle} />;
  }
  return <RiveCanvas boxStyle={boxStyle} onReady={() => setRuntimeOk(true)} onFail={() => setFailed(true)} />;
}
