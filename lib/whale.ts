// 共享鲸鱼剪影绘制（FloatingWhale 全屏巡游层复用）
// 剪影几何：吻端(95,0) → 背线 → 尾柄 → 随 tail 摆动的尾鳍 → 腹线回吻端；极光丁香→玫瑰渐变 + 柔光
// 注：v4 的 drawParticleWhale 粒子点云已随「换回最原始鲸鱼」一并移除
export const WHALE_SLOGAN = "她测 · 守护每一次探索";

export function drawWhale(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  now: number,
  opts: {
    facing: 1 | -1;
    phase: number;
    scale?: number;
    alpha?: number;
    slogan?: boolean;
    sloganWidth?: number | null;
  },
) {
  const { facing, phase, scale = 1, alpha = 1, slogan = false, sloganWidth = null } = opts;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing * scale, scale);
  ctx.globalAlpha = alpha;
  const tail = Math.sin(now / 300 + phase) * 0.24;
  const grad = ctx.createLinearGradient(-90, -30, 95, 30);
  grad.addColorStop(0, "rgba(154,114,233,0.38)"); // aurora.lilac-500
  grad.addColorStop(1, "rgba(227,74,137,0.36)"); // brand-500
  ctx.fillStyle = grad;
  ctx.shadowColor = "rgba(154,114,233,0.45)";
  ctx.shadowBlur = 30;
  ctx.beginPath();
  ctx.moveTo(95, 0);
  ctx.bezierCurveTo(70, -26, 10, -30, -30, -12);
  ctx.bezierCurveTo(-52, -5, -62, -3, -74, -8);
  ctx.lineTo(-74 + 26 * Math.cos(tail), -12 + 26 * Math.sin(tail));
  ctx.quadraticCurveTo(-66, 0, -74 + 26 * Math.cos(tail), 12 + 26 * Math.sin(tail));
  ctx.bezierCurveTo(-60, 5, -46, 6, -28, 12);
  ctx.bezierCurveTo(16, 28, 72, 24, 95, 0);
  ctx.closePath();
  ctx.fill();
  // 背鳍
  ctx.beginPath();
  ctx.moveTo(-6, -26);
  ctx.quadraticCurveTo(6, -44, 24, -25);
  ctx.closePath();
  ctx.fill();
  // 眼：留白高光
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.beginPath();
  ctx.arc(72, -5, 2.2, 0, Math.PI * 2);
  ctx.fill();
  // 鲸背 slogan（宽度由调用方用 pretext 测量后传入，居中）
  if (slogan && sloganWidth) {
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = `500 13px "Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif`;
    ctx.textBaseline = "middle";
    ctx.fillText(WHALE_SLOGAN, -sloganWidth / 2, -40);
  }
  ctx.restore();
}
