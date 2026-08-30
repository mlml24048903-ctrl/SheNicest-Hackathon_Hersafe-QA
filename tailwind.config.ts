import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // 品牌色：白色为主体；荧光绿用于聚焦与小面积互动，深绿档保证白字按钮对比度。
        brand: {
          50: "#f9ffe8",
          100: "#efffc2",
          200: "#e0ff85",
          300: "#d2ff4a",
          400: "#c7f400",
          500: "#8fc700",
          600: "#437b00",
          700: "#315e00",
          800: "#284b06",
          900: "#223f0a",
          950: "#102300",
        },
        // 图层四类状态色（颜色 + 文字 + 图标三重编码，PRD F2.2）
        // ⚠️ 前四个键名被 app/globals.css 的 @apply border-layer-* 引用，禁止重命名
        layer: {
          risk: "#ff5035",
          evidence: "#ff7a22",
          protected: "#00a97a",
          unconfirmed: "#3977f6",
          // 深墨档：仅供画布图层标签文字载体使用——11px 白字压 600 档多数不足 AA(4.5:1)
          // （如 amber-600 仅 ~3.2:1），加深到 700 级保证可读；框体边框/图例仍用上面的亮档
          "risk-ink": "#b91c1c", // red-700
          "evidence-ink": "#b45309", // amber-700
          "protected-ink": "#15803d", // green-700
          "unconfirmed-ink": "#334155", // slate-700
        },
        // 极光辅助色：仅为「粉紫极光」氛围层提供渐变端点，禁止承载正文文字
        // lilac 与 brand 同明度段（L≈68%）混入渐变不断层；lilac-600 白底约 5:1 是允许的最深文字档位，
        // 且只出现在 ≥24px 大标题（AA-large 3:1）中。装饰背景/描边任意档位可用。
        aurora: {
          lilac: {
            100: "#f4f1fe",
            200: "#e8ddfc",
            300: "#d4bef9",
            400: "#b699f2",
            500: "#9a72e9",
            600: "#7a4fd0",
          },
          peach: {
            100: "#fff2ea",
            200: "#ffe2cc",
            300: "#fdcda9",
            400: "#fbb382",
            500: "#f59557",
            600: "#de7430",
          },
        },
        // 语义色约定（直接使用 Tailwind 内置色，不建第二套平行体系）：
        // 危险=red-600 · 警示=amber-600 · 成功=green-600 · 信息=blue-600 · 未确认/中性=slate-500
      },
      boxShadow: {
        // 卡片常态：极轻的双层投影，替代散落的 shadow-sm
        card: "0 1px 2px rgb(0 0 0 / 0.035), 0 10px 36px rgb(0 0 0 / 0.055)",
        // 卡片悬停：抬升感
        "card-hover": "0 2px 4px rgb(0 0 0 / 0.05), 0 18px 48px rgb(0 0 0 / 0.10)",
        // 主操作按钮：品牌粉光晕
        cta: "0 1px 2px rgb(16 35 0 / 0.16), 0 6px 16px -5px rgb(115 166 0 / 0.42)",
        // 聚焦光环辅助
        focus: "0 0 0 3px rgb(199 244 0 / 0.30)",
        // 品牌色调悬浮影：玫瑰+丁香双色光晕，用于统计卡/重点卡的 hover「点亮」感
        halo: "0 0 0 1px rgb(207 47 112 / 0.05), 0 12px 32px -16px rgb(154 114 233 / 0.35), 0 8px 20px -12px rgb(227 74 137 / 0.22)",
      },
      fontFamily: {
        sans: [
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "PingFang SC",
          "Hiragino Sans GB",
          "Microsoft YaHei",
          "sans-serif",
        ],
      },
      letterSpacing: {
        // 标题专用收紧字距（中文标题在负字距下更利落）
        tightest: "-0.02em",
      },
      keyframes: {
        // 入场：上移淡入（列表 stagger 用内联 animationDelay 实现）
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.97)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        // 骨架屏扫光：高光条横移一个 backgroundPosition 周期（配合 bg-[length:220%_100%] 无缝循环）
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        // 进度条流动条纹：位移恰为一个纹理周期（28px），保证循环无缝
        "stripe-flow": {
          to: { backgroundPosition: "28px 0" },
        },
        // 状态点呼吸：光环扩散消散 + 微放大；颜色经 --breathe-color 注入以适配蓝/绿/琥珀多语境
        breathe: {
          "0%,100%": {
            boxShadow: "0 0 0 0 var(--breathe-color, rgb(59 130 246 / 0.40))",
            transform: "scale(1)",
          },
          "50%": {
            boxShadow: "0 0 0 5px rgb(59 130 246 / 0)",
            transform: "scale(1.14)",
          },
        },
        // 极光光斑漂移：双伪层交替位移缩放，周期长、幅度小，营造「活着的氛围」而不抢注意力
        "aurora-a": {
          "0%,100%": { transform: "translate3d(-2%, -1%, 0) scale(1)" },
          "50%": { transform: "translate3d(2%, 2%, 0) scale(1.06)" },
        },
        "aurora-b": {
          "0%,100%": { transform: "translate3d(2%, 1%, 0) scale(1.04)" },
          "50%": { transform: "translate3d(-2%, -2%, 0) scale(1)" },
        },
        // Magic UI 本地化 · AuroraText 流动渐变：背景位移一个来回，260% 宽度保证端点同色
        "aurora-drift": {
          "0%": { backgroundPosition: "0% 50%" },
          "100%": { backgroundPosition: "200% 50%" },
        },
        // BorderBeam conic 光束旋转：纯 transform 合成层，时长经 --beam-duration 注入
        "beam-spin": {
          to: { transform: "rotate(360deg)" },
        },
        // RiveWhale 降级鲸慢浮动：±6px + ±2° 轻摇摆
        "whale-float": {
          "0%,100%": { transform: "translateY(-4px) rotate(-2deg)" },
          "50%": { transform: "translateY(6px) rotate(2deg)" },
        },
        "puff-swim": {
          "0%,100%": { transform: "translate3d(0, 8px, 0) scaleX(1)" },
          "38%": { transform: "translate3d(-58px, -10px, 0) scaleX(1)" },
          "49%": { transform: "translate3d(-72px, 2px, 0) scaleX(1)" },
          "50%": { transform: "translate3d(-72px, 2px, 0) scaleX(-1)" },
          "88%": { transform: "translate3d(-12px, -7px, 0) scaleX(-1)" },
          "99%": { transform: "translate3d(0, 8px, 0) scaleX(-1)" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-in": "fade-in 0.3s ease-out both",
        "scale-in": "scale-in 0.25s cubic-bezier(0.22, 1, 0.36, 1) both",
        // 动效节奏纪律：反馈类 ≤250ms（复用弹性曲线）；环境/信息型 ≥2.4s 且仅限有信息含义的场景；
        // infinite 白名单 = 加载中、进行中、进度计算中——纯装饰永不无限循环
        shimmer: "shimmer 1.6s linear infinite",
        "stripe-flow": "stripe-flow 0.9s linear infinite",
        breathe: "breathe 2.4s ease-in-out infinite",
        "aurora-a": "aurora-a 26s ease-in-out infinite",
        "aurora-b": "aurora-b 32s ease-in-out infinite",
        // Magic UI 本地化三档：字流（氛围 ≥2.4s）、光束（时长变量注入）、鲸浮（氛围慢档）
        "aurora-drift": "aurora-drift 20s ease-in-out infinite alternate",
        "beam-spin": "beam-spin var(--beam-duration, 7s) linear infinite",
        "whale-float": "whale-float 6s ease-in-out infinite",
        "puff-swim": "puff-swim 12s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
