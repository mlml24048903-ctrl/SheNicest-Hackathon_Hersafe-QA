export default function Loading() {
  return (
    <div className="mx-auto max-w-[1680px] px-5 py-5" role="status" aria-label="正在打开页面">
      <div className="h-[3px] overflow-hidden rounded-full bg-brand-100"><span className="block h-full w-1/3 animate-[route-progress_900ms_ease-in-out_infinite] bg-brand-400" /></div>
    </div>
  );
}
