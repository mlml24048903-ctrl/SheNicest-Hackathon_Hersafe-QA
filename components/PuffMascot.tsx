import Image from "next/image";

interface PuffMascotProps {
  className?: string;
  title?: string;
}

/**
 * 泡芙助手的正式卡通形象。透明 PNG 只负责角色本体，
 * 游动与轻微摆动由外层 CSS 控制，避免把动画写死在素材里。
 */
export default function PuffMascot({ className, title }: PuffMascotProps) {
  return (
    <Image
      src="/brand/puff-mascot-v2.png"
      width={1427}
      height={1102}
      alt={title ?? ""}
      title={title}
      draggable={false}
      className={`puff-mascot-image select-none object-contain ${className ?? ""}`}
      priority={false}
    />
  );
}
