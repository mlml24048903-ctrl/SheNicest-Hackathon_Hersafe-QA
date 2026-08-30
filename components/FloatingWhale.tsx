// 全屏粉鲸巡游层（FloatingWhale）——鲸鱼活动范围扩大到整个视口（首页氛围层）：
// 不再是"单纯移动"，而是画在水里：
//   1) 漫游转向（waypoint 巡游 + 转向速率限制，路径圆润非直线往返）
//   2) 涟漪环：游动时在鲸身周围周期性扩散双圈水纹
//   3) 气泡流：尾部间歇吐出带摆动的上浮气泡
//   4) 幻影拖尾：低透明度历史剪影模拟水体折射残影
//   5) 水下焦散：跟随场景的柔光光斑缓慢漂移
//   6) 鲸位广播：每帧把鲸心坐标/速度/比例写入 whaleState（lib/whale-state），
//      供开场短笺 pretext 实时绕排与大标题逐字照亮消费——「发光龙」式文字交互
// 纪律：pointer-events-none 不挡交互；aria-hidden 不进读屏；reduced-motion 渲染单帧静停；
// 标签页隐藏时暂停 rAF；粒子上限防止长会话内存增长。
// 视觉粒子使用固定种子的确定性伪随机（mulberry32，非加密用途，Mimosa 弱随机场景不适用）。
"use client";

import { useEffect, useRef } from "react";
import { drawWhale } from "@/lib/whale";
import { whaleState } from "@/lib/whale-state";

interface Ripple {
  x: number;
  y: number;
  born: number;
}
interface Bubble {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  seed: number;
  born: number;
}

const LILAC = "154,114,233"; // aurora.lilac-500
const BRAND = "227,74,137"; // brand-500

/** mulberry32 确定性伪随机（装饰用途） */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let s = Math.imul(a ^ (a >>> 15), 1 | a);
    s = (s + Math.imul(s ^ (s >>> 7), 61 | s)) ^ s;
    return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
  };
}

export default function FloatingWhale() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 固定种子装饰随机
    const rng = mulberry32(0x5ac3);

    const dpr = Math.min(1.75, window.devicePixelRatio || 1);
    let W = window.innerWidth;
    let H = window.innerHeight;

    const resize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
    };
    resize();

    // ===== 状态 =====
    const M = { x: Math.max(120, W * 0.16), y: Math.max(140, H * 0.22) }; // 边距
    const whale = { x: W * 0.72, y: H * 0.62, vx: -26, vy: 6, tx: W * 0.25, ty: H * 0.3 };
    const scale = W < 640 ? 0.55 : W < 1024 ? 0.72 : 0.9;
    const ripples: Ripple[] = [];
    const bubbles: Bubble[] = [];
    const trail: Array<{ x: number; y: number; dx: 1 | -1 }> = [];
    let lastRipple = 0;
    let lastBubble = 0;
    let frameCount = 0;
    let raf = 0;
    const t0 = performance.now();
    let last = t0;

    /** 均匀取视口内的下一个漫游目标点 */
    const pickTarget = () => {
      whale.tx = M.x + rng() * Math.max(60, W - M.x * 2);
      whale.ty = M.y + rng() * Math.max(60, H - M.y * 2);
    };

    const spawnRipple = (now: number, x: number, y: number) => {
      if (ripples.length > 14) ripples.shift();
      ripples.push({ x, y, born: now });
    };
    const spawnBubble = (now: number, x: number, y: number) => {
      if (bubbles.length > 26) bubbles.shift();
      bubbles.push({
        x,
        y,
        vx: (rng() - 0.5) * 8,
        vy: -(18 + rng() * 16),
        r: 1.4 + rng() * 2.2,
        seed: rng() * Math.PI * 2,
        born: now,
      });
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      frameCount += 1;
      const t = (now - t0) / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // ===== 1) 水下焦散光斑（三层柔光随极慢正弦漂移）=====
      const glows = [
        { cx: 0.24 + Math.sin(t * 0.06) * 0.06, cy: 0.26 + Math.cos(t * 0.05) * 0.04, c: LILAC, a: 0.05 },
        {
          cx: 0.78 + Math.sin(t * 0.045 + 2) * 0.05,
          cy: 0.7 + Math.cos(t * 0.06 + 1) * 0.05,
          c: BRAND,
          a: 0.045,
        },
        { cx: 0.5 + Math.sin(t * 0.03 + 4) * 0.08, cy: 0.45 + Math.cos(t * 0.04) * 0.07, c: LILAC, a: 0.035 },
      ];
      for (const g of glows) {
        const rr = Math.max(W, H) * 0.34;
        const grad = ctx.createRadialGradient(g.cx * W, g.cy * H, 0, g.cx * W, g.cy * H, rr);
        grad.addColorStop(0, `rgba(${g.c},${g.a})`);
        grad.addColorStop(1, `rgba(${g.c},0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      }

      // ===== 2) 漫游转向（到达目标附近换新目标；转向速率受限→弧线巡游）=====
      const dxT = whale.tx - whale.x;
      const dyT = whale.ty - whale.y;
      const dist = Math.hypot(dxT, dyT);
      if (dist < 56) pickTarget();
      const cruise = 30 + Math.sin(t * 0.23) * 8; // 巡航速度轻微呼吸
      const desiredVx = (dxT / (dist || 1)) * cruise;
      const desiredVy = (dyT / (dist || 1)) * cruise * 0.72; // 横向为主，纵向克制
      const TURN = 1.6 * dt;
      whale.vx += (desiredVx - whale.vx) * Math.min(1, TURN);
      whale.vy += (desiredVy - whale.vy) * Math.min(1, TURN);
      whale.x += whale.vx * dt;
      whale.y += whale.vy * dt;

      // 边界软反弹并重选目标
      if (whale.x < M.x) {
        whale.x = M.x;
        whale.vx = Math.abs(whale.vx);
        pickTarget();
      }
      if (whale.x > W - M.x) {
        whale.x = W - M.x;
        whale.vx = -Math.abs(whale.vx);
        pickTarget();
      }
      if (whale.y < M.y) {
        whale.y = M.y;
        whale.vy = Math.abs(whale.vy);
      }
      if (whale.y > H - M.y) {
        whale.y = H - M.y;
        whale.vy = -Math.abs(whale.vy);
      }

      const facing: 1 | -1 = whale.vx >= 0 ? 1 : -1;
      // 视觉起伏 + 由纵向速度带来的微小俯仰（入水/出水姿态）
      const bobY = Math.sin(t * 0.9) * 7;
      const wy = whale.y + bobY;
      const tilt = Math.max(-0.16, Math.min(0.16, whale.vy * 0.004)) * (facing === 1 ? 1 : -1);

      // ===== 鲸位广播（与本体绘制同源：x 取 whale.x，y 取含起伏的 wy）=====
      whaleState.x = whale.x;
      whaleState.y = wy;
      whaleState.vx = whale.vx;
      whaleState.scale = scale;
      whaleState.active = true;

      // ===== 3) 幻影拖尾（每 6 帧存一点，最多 5 个低透残影）=====
      if (frameCount % 6 === 0) {
        if (trail.length > 4) trail.shift();
        trail.push({ x: whale.x, y: wy, dx: facing });
      }
      trail.forEach((g, i) => {
        drawWhale(ctx, g.x, g.y, now - (trail.length - i) * 260, {
          facing: g.dx,
          phase: 1.1,
          scale: scale * (0.82 + i * 0.02),
          alpha: 0.05 + i * 0.02,
        });
      });

      // ===== 4) 涟漪双环周期扩散 =====
      if (now - lastRipple > 720 && ripples.length < 14) {
        lastRipple = now;
        spawnRipple(now, whale.x - facing * 18, wy + 10);
      }

      // ===== 5) 尾部气泡流 =====
      if (now - lastBubble > 280 && bubbles.length < 26) {
        lastBubble = now;
        spawnBubble(now, whale.x - facing * 74 * scale + (rng() - 0.5) * 14, wy + (rng() - 0.5) * 10);
      }

      // ===== 绘制顺序：涟漪 → 气泡 → 本体 =====
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i];
        const age = (now - rp.born) / 2100;
        if (age >= 1) {
          ripples.splice(i, 1);
          continue;
        }
        const ease = 1 - (1 - age) ** 2;
        const rr = 26 + ease * 74;
        const a = (1 - age) * 0.32;
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = `rgba(${LILAC},${a})`;
        ctx.beginPath();
        ctx.ellipse(rp.x, rp.y, rr * 1.25, rr * 0.5, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = `rgba(${BRAND},${a * 0.65})`;
        ctx.beginPath();
        ctx.ellipse(rp.x, rp.y, rr * 0.78, rr * 0.3, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];
        b.x += (b.vx + Math.sin(t * 4 + b.seed) * 7) * dt;
        b.y += b.vy * dt;
        const age = (now - b.born) / 3400;
        if (age >= 1 || b.y < H * 0.12) {
          bubbles.splice(i, 1);
          continue;
        }
        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgba(255,255,255,${(1 - age) * 0.45})`;
        ctx.fillStyle = `rgba(${BRAND},${(1 - age) * 0.08})`;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // 高光点
        ctx.fillStyle = `rgba(255,255,255,${(1 - age) * 0.6})`;
        ctx.beginPath();
        ctx.arc(b.x - b.r * 0.32, b.y - b.r * 0.36, b.r * 0.22, 0, Math.PI * 2);
        ctx.fill();
      }

      // 本体：旋转上下文实现俯仰，drawWhale 以 (0,0) 为中心绘制
      ctx.save();
      ctx.translate(whale.x, wy);
      ctx.rotate(tilt);
      drawWhale(ctx, 0, 0, now, { facing, phase: 1.3, scale });
      ctx.restore();

      raf = requestAnimationFrame(frame);
    };

    // ===== reduced-motion：静态一帧（静浮 + 一圈涟漪），不启动动画循环 =====
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      const sx = W * 0.68;
      const sy = H * 0.6;
      // 静态鲸位同样广播一次（reduced-motion 下文字层据此一次性排定，不做动画）
      whaleState.x = sx;
      whaleState.y = sy;
      whaleState.scale = scale;
      whaleState.active = true;
      const renderStatic = () => {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = `rgba(${LILAC},0.22)`;
        ctx.beginPath();
        ctx.ellipse(sx, sy + 10, 120, 46, 0, 0, Math.PI * 2);
        ctx.stroke();
        drawWhale(ctx, sx, sy, 1600, { facing: 1, phase: 1.3, scale });
      };
      renderStatic();
      const onResizeStatic = () => {
        resize();
        renderStatic();
      };
      window.addEventListener("resize", onResizeStatic);
      return () => window.removeEventListener("resize", onResizeStatic);
    }

    pickTarget();
    raf = requestAnimationFrame(frame);

    // 标签页隐藏暂停 / 可见恢复（省电，也避免后台堆积时间步）
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", resize);
      // 卸载后让文字层回退静态排版
      whaleState.active = false;
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-0 select-none" />;
}
