interface PixelFishProps {
  className?: string;
  title?: string;
  variant?: "swimmer" | "inspector";
}

/**
 * 她测品牌小鱼「泡芙」。热带鱼式高背短身，使用更细的 2px 像素节奏；
 * inspector 版本带放大镜，表示“寻找证据”，不使用鲸鱼或盾牌轮廓。
 */
export default function PixelFish({ className, title, variant = "swimmer" }: PixelFishProps) {
  return (
    <svg
      viewBox="0 0 96 56"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      shapeRendering="crispEdges"
    >
      <g className="puff-tail">
        <path d="M6 10h8v4h6v8h6v12h-6v8h-6v4H6l8-18L6 10Z" fill="var(--color-brand-coral)" />
        <path d="M10 17h6v7h6v8h-6v7h-6l5-11-5-11Z" fill="var(--color-brand-coral-dark)" />
        <path d="M12 25h12v6H12Z" fill="var(--color-surface)" opacity=".86" />
      </g>

      <g className="puff-body">
        <path d="M22 22h4v-8h8V8h12V4h14v4h10v6h8v8h8v12h-8v8H68v6H56v4H42v-4H32v-6h-6v-8h-4Z" fill="var(--color-brand-lime)" />
        <path d="M28 18h8v-6h10v36H36v-6h-8Z" fill="var(--color-brand-green-mid)" />
        <path d="M46 8h8v40h-8Z" fill="var(--color-surface)" opacity=".94" />
        <path d="M56 8h8v40h-8Z" fill="var(--color-brand-coral)" />
        <path d="M64 12h6v32h-6Z" fill="var(--color-surface)" opacity=".9" />
        <path d="M72 18h8v20h-8Z" fill="var(--color-brand-lime-soft)" opacity=".86" />
        <path d="M78 20h8v12h-4v6h-4Z" fill="var(--color-brand-lime-soft)" />
        <path d="M76 17h8v8h-8Z" fill="var(--color-ink)" />
        <path d="M78 18h3v3h-3Z" fill="var(--color-surface)" />
        <path d="M84 29h6v4h-6Z" fill="var(--color-brand-coral)" />
        <path d="M36 23h5v5h-5ZM68 32h4v4h-4Z" fill="var(--color-brand-green-ink)" opacity=".7" />
      </g>

      <g className="puff-fin-top">
        <path d="M38 9h6V4h8V0h10v8h-8v5H42Z" fill="var(--color-brand-coral)" />
        <path d="M44 7h6V3h6v5h-6v3h-6Z" fill="var(--color-brand-coral-dark)" />
      </g>
      <g className="puff-fin-bottom">
        <path d="M54 45h8v5h8v6H56v-4h-6Z" fill="var(--color-brand-coral)" />
      </g>

      {variant === "inspector" ? (
        <g className="puff-lens" fill="none" stroke="var(--color-ink)" strokeLinecap="square">
          <circle cx="82" cy="33" r="10" strokeWidth="3" fill="var(--color-surface)" fillOpacity=".8" />
          <path d="m75 40-9 10" strokeWidth="4" />
          <path d="M64 48h5v5h-5Z" fill="var(--color-brand-coral)" stroke="none" />
        </g>
      ) : null}
    </svg>
  );
}
