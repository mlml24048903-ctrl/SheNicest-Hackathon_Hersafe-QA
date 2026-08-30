// 交互节奏参考 Dot Matrix 的 Row Sweep；使用项目自身色彩与 CSS 重写。
export default function DotMatrixLoader({ label = "处理中", compact = false }: { label?: string; compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2" role="status" aria-live="polite">
      <span className={`dot-matrix-loader ${compact ? "dot-matrix-loader--compact" : ""}`} aria-hidden="true">
        {Array.from({ length: 9 }, (_, index) => <span key={index} style={{ animationDelay: `${(index % 3) * 90 + Math.floor(index / 3) * 120}ms` }} />)}
      </span>
      <span>{label}</span>
    </span>
  );
}
