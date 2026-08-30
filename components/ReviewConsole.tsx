"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import NextImage from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, CircleCheck, FileArchive, FileText, FileType2, Globe, ImagePlus, Link2, ScanSearch, ShieldCheck } from "lucide-react";
import { Banner, Button, Card, EmptyState, FileField, Input, SegmentedControl, Skeleton } from "@/components/ui";
import DotMatrixLoader from "@/components/DotMatrixLoader";
import ProjectStepNav, { type ProjectStep } from "@/components/ProjectStepNav";
import LayerCanvas from "@/components/LayerCanvas";
import TodoPanel from "@/components/TodoPanel";
import CodeEvidencePanel, { type CodeEvidenceArtifact } from "@/components/CodeEvidencePanel";
import { runWithNotice, type Notice } from "@/components/notice";
import { useReviewStore } from "@/lib/store";
import type { ControlCandidate, PackagePage, SourceRef } from "@/lib/types";
import type { CodeProjectAnalysis } from "@/lib/parsers/code";

interface Artifact {
  id: string;
  type: string;
  sourceRef: string;
  storagePath: string | null;
  status: string;
  parseOutput: Record<string, unknown> | null;
}

interface TodoItem {
  id: string;
  title: string;
  priority: string;
  reason: string;
  status: string;
  ruleId: string | null;
  findingId: string | null;
  evidenceRefs: string[];
}

interface ProjectData {
  id: string;
  name: string;
  status: string;
  artifacts: Artifact[];
  evidencePackage: {
    pages: PackagePage[];
    controls: ControlCandidate[];
    userTasks: string[];
    docRules: Array<{ docRuleId: string; keyword: string; snippet: string }>;
    sourceIndex: SourceRef[];
    coverage: { covered: string[]; uncovered: string[] } | null;
  } | null;
  todos: TodoItem[];
  findings: Array<{ id: string; title: string; type: string; severity: string }>;
}

const STEP_META: Record<Exclude<ProjectStep, "report">, { eyebrow: string; title: string; description: string }> = {
  materials: { eyebrow: "第一步", title: "上传材料", description: "添加代码包、截图、网址或产品文档，系统会按材料类型整理证据。" },
  analysis: { eyebrow: "第二步", title: "初步分析", description: "按截图或代码查看产品交互，并与需要确认的待办联动。" },
  todos: { eyebrow: "第三步", title: "待办核查", description: "逐项补充事实，查看规则解释并确认风险判断。" },
};

export default function ReviewConsole({ projectId }: { projectId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<ProjectData | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<{ images: File[]; pdf: File[]; docs: File[]; code: File[] }>({ images: [], pdf: [], docs: [], code: [] });
  const [analyzing, setAnalyzing] = useState(false);
  const [routePending, startRouteTransition] = useTransition();
  const [pendingTodoId, setPendingTodoId] = useState<string | null>(null);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [evidenceMode, setEvidenceMode] = useState<"visual" | "code" | "documents" | "relations">("visual");
  const urlInputRef = useRef<HTMLInputElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const selectedFileCount = selectedFiles.images.length + selectedFiles.pdf.length + selectedFiles.docs.length + selectedFiles.code.length;
  const setStoreControls = useReviewStore((state) => state.setControls);

  const load = useCallback(async () => {
    const response = await fetch(`/api/projects/${projectId}`);
    if (!response.ok) return setError("无法加载项目。请返回项目列表后重试。");
    const body = await response.json();
    setData(body.project);
    setStoreControls(body.project.evidencePackage?.controls ?? []);
  }, [projectId, setStoreControls]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const requestedStep = searchParams.get("step") as ProjectStep | null;
  const step: Exclude<ProjectStep, "report"> = requestedStep === "analysis" || requestedStep === "todos" ? requestedStep : "materials";
  const selectedTodoId = searchParams.get("todo") ?? pendingTodoId;

  useEffect(() => {
    const todoFromUrl = searchParams.get("todo");
    if (todoFromUrl && todoFromUrl === pendingTodoId) queueMicrotask(() => setPendingTodoId(null));
  }, [pendingTodoId, searchParams]);

  const screenshotArtifacts = useMemo(() => (data?.artifacts ?? []).filter((item) => item.type === "image" && item.status === "parsed" && item.storagePath), [data]);
  const urlArtifact = useMemo(() => (data?.artifacts ?? []).find((item) => item.type === "url" && item.storagePath), [data]);
  const codeArtifacts = useMemo<CodeEvidenceArtifact[]>(() => (data?.artifacts ?? []).filter((item) => item.type === "code" && item.status === "parsed" && item.parseOutput?.kind === "static_code_analysis").map((item) => ({ artifactId: item.id, sourceRef: item.sourceRef, analysis: item.parseOutput as unknown as CodeProjectAnalysis })), [data]);
  const documentArtifacts = useMemo(() => (data?.artifacts ?? []).filter((item) => ["pdf", "docx", "md", "txt"].includes(item.type) && item.status === "parsed"), [data]);
  const hasVisualEvidence = screenshotArtifacts.length > 0 || Boolean(urlArtifact);
  const currentArtifact = useMemo(() => {
    const visualArtifacts = [...screenshotArtifacts, ...(urlArtifact ? [urlArtifact] : [])];
    return visualArtifacts.find((item) => item.id === selectedArtifactId) ?? screenshotArtifacts[0] ?? urlArtifact ?? null;
  }, [screenshotArtifacts, selectedArtifactId, urlArtifact]);
  const currentControls = useMemo(() => (data?.evidencePackage?.controls ?? []).filter((control) => control.artifactId === currentArtifact?.id), [currentArtifact, data]);

  const artifactImageUrl = (artifact: Artifact | null | undefined) => artifact?.storagePath ? `/api/uploads/${artifact.storagePath.split("/").pop()}` : "";
  const pageForArtifact = useCallback((artifactId: string | null | undefined) => data?.evidencePackage?.pages.find((page) => page.artifact_id === artifactId), [data]);
  const sourceForTodo = useCallback((todo: TodoItem | null | undefined) => {
    if (!todo || !data?.evidencePackage) return null;
    return data.evidencePackage.sourceIndex.find((source) => todo.evidenceRefs?.includes(source.key)) ?? null;
  }, [data]);
  const artifactForTodo = useCallback((todo: TodoItem | null | undefined) => {
    const source = sourceForTodo(todo);
    if (source) return data?.artifacts.find((artifact) => artifact.id === source.artifactId) ?? null;
    return data?.artifacts.find((artifact) => todo?.evidenceRefs?.includes(artifact.sourceRef)) ?? null;
  }, [data, sourceForTodo]);
  const selectedTodo = useMemo(() => data?.todos.find((todo) => todo.id === selectedTodoId) ?? null, [data, selectedTodoId]);
  const selectedTodoCodeSource = useMemo(() => selectedTodo && data?.evidencePackage ? data.evidencePackage.sourceIndex.find((source) => selectedTodo.evidenceRefs.includes(source.key) && source.locator.kind === "code") ?? null : null, [data, selectedTodo]);
  const selectedTodoArtifact = useMemo(() => artifactForTodo(selectedTodo), [artifactForTodo, selectedTodo]);
  const selectedTodoControls = useMemo(() => {
    if (!selectedTodo || !data?.evidencePackage) return [];
    const directlyLinked = data.evidencePackage.controls.filter((control) => control.todoId === selectedTodo.id);
    if (directlyLinked.length) return directlyLinked;
    const source = sourceForTodo(selectedTodo);
    if (!source?.locator.coords) return [];
    const coords = source.locator.coords;
    return data.evidencePackage.controls.filter((control) => control.artifactId === source.artifactId && control.rect.x === coords.x && control.rect.y === coords.y && control.rect.w === coords.w && control.rect.h === coords.h);
  }, [data, selectedTodo, sourceForTodo]);

  useEffect(() => {
    if (selectedTodoArtifact && (selectedTodoArtifact.type === "image" || selectedTodoArtifact.type === "url") && selectedTodoArtifact.storagePath && selectedArtifactId !== selectedTodoArtifact.id) {
      queueMicrotask(() => setSelectedArtifactId(selectedTodoArtifact.id));
    }
  }, [selectedArtifactId, selectedTodoArtifact]);

  useEffect(() => {
    if (selectedTodoArtifact?.type === "code") queueMicrotask(() => setEvidenceMode("code"));
    if (selectedTodoArtifact && ["pdf", "docx", "md", "txt"].includes(selectedTodoArtifact.type)) queueMicrotask(() => setEvidenceMode("documents"));
  }, [selectedTodoArtifact]);
  useEffect(() => {
    if (!hasVisualEvidence && codeArtifacts.length && evidenceMode === "visual") queueMicrotask(() => setEvidenceMode("code"));
    else if (!hasVisualEvidence && !codeArtifacts.length && documentArtifacts.length && evidenceMode === "visual") queueMicrotask(() => setEvidenceMode("documents"));
  }, [codeArtifacts.length, documentArtifacts.length, evidenceMode, hasVisualEvidence]);

  const goToStep = (next: Exclude<ProjectStep, "report">) => startRouteTransition(() => router.push(`/projects/${projectId}?step=${next}`, { scroll: false }));
  const replaceWithoutPageScroll = (url: string) => {
    const pageY = window.scrollY;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    router.replace(url, { scroll: false });
    const restore = () => window.scrollTo(0, pageY);
    window.requestAnimationFrame(() => window.requestAnimationFrame(restore));
    window.setTimeout(restore, 120);
    window.setTimeout(restore, 360);
  };
  const selectAnalysisTodo = (id: string | null) => {
    const todo = data?.todos.find((item) => item.id === id);
    const artifact = artifactForTodo(todo);
    if (artifact) setSelectedArtifactId(artifact.id);
    if (id) {
      setPendingTodoId(id);
      startRouteTransition(() => router.push(`/projects/${projectId}?step=todos&todo=${id}`, { scroll: false }));
    }
  };

  const upload = async (mode: "url" | "files") => {
    setUploading(true);
    setNotice(null);
    await runWithNotice(setNotice, async () => {
      let response: Response;
      if (mode === "url") {
        const url = urlInputRef.current?.value.trim();
        if (!url) throw new Error("请输入公开网页地址");
        response = await fetch(`/api/projects/${projectId}/artifacts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
      } else {
        const form = new FormData();
        selectedFiles.images.forEach((file) => form.append("images", file));
        if (selectedFiles.pdf[0]) form.append("pdf", selectedFiles.pdf[0]);
        selectedFiles.docs.forEach((file) => form.append("docs", file));
        selectedFiles.code.forEach((file) => form.append("code", file));
        if (![...form.keys()].length) throw new Error("请选择需要上传的文件");
        response = await fetch(`/api/projects/${projectId}/artifacts`, { method: "POST", body: form });
      }
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "无法添加材料，请检查文件后重试");
      await load();
      if (mode === "files") setSelectedFiles({ images: [], pdf: [], docs: [], code: [] });
      return `已添加 ${body.created?.length ?? 0} 份材料`;
    }, "无法添加材料，请稍后重试");
    setUploading(false);
  };

  const analyze = async () => {
    setAnalyzing(true);
    setNotice(null);
    await runWithNotice(setNotice, async () => {
      const response = await fetch(`/api/projects/${projectId}/analysis`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "无法完成初步分析");
      await load();
      return `初步分析完成：生成 ${body.todoIds.length} 个待办和 ${body.findingIds.length} 条待核查结论`;
    }, "无法完成初步分析，请稍后重试");
    setAnalyzing(false);
  };

  if (error) return <div className="mx-auto max-w-5xl p-8"><Banner kind="error">{error}</Banner></div>;
  if (!data) return <div className="mx-auto max-w-[1500px] p-8"><Skeleton className="h-10 w-72" /><Skeleton className="mt-6 h-24 w-full" /><Skeleton className="mt-5 h-[520px] w-full" /></div>;

  const meta = STEP_META[step];
  const hasMaterials = data.artifacts.some((item) => item.status === "parsed");
  const completedThrough = data.status === "analyzed" ? 2 : hasMaterials ? 1 : 0;

  return (
    <div className="relative mx-auto max-w-[1680px] px-3 py-3 sm:px-5 xl:flex xl:h-[calc(100dvh-4rem)] xl:flex-col xl:overflow-hidden" aria-busy={routePending}>
      {routePending ? <div className="pointer-events-none absolute inset-x-3 top-0 z-20 h-[3px] overflow-hidden rounded-full bg-brand-100 sm:inset-x-5" role="status" aria-label="正在打开下一页"><span className="block h-full w-1/3 animate-[route-progress_900ms_ease-in-out_infinite] bg-brand-400" /></div> : null}
      <div className="flex shrink-0 flex-col gap-2.5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" aria-label="返回项目列表" className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] border border-neutral-200 bg-white text-neutral-700 shadow-sm hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><ArrowLeft className="h-4 w-4" /></Link>
            <div className="min-w-0"><p className="text-[11px] font-medium text-neutral-400">审查项目</p><h1 className="truncate text-xl font-semibold tracking-[-0.025em] text-neutral-950">{data.name}</h1></div>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-2 text-xs font-medium text-neutral-600 shadow-sm"><span className={`h-2 w-2 rounded-full ${data.status === "analyzed" ? "bg-emerald-500" : data.status === "analyzing" ? "bg-blue-500" : "bg-neutral-300"}`} />{data.status === "analyzed" ? "初步分析已完成" : data.status === "analyzing" ? "正在分析" : "等待材料"}</span>
        </div>
        <ProjectStepNav projectId={projectId} current={step} completedThrough={completedThrough} />
      </div>

      {notice && <div className="mt-2 shrink-0"><Banner kind={notice.kind}>{notice.text}</Banner></div>}

      <header className="my-3 flex shrink-0 items-baseline gap-3 px-1">
        <p className="text-[11px] font-semibold text-brand-600">{meta.eyebrow}</p>
        <h2 className="text-base font-semibold tracking-[-0.02em] text-neutral-950">{meta.title}</h2>
        <p className="hidden truncate text-xs text-neutral-500 md:block">{meta.description}</p>
      </header>

      {step === "materials" && (
        <section className="grid min-h-0 gap-4 xl:flex-1 xl:grid-cols-[minmax(0,1fr)_280px] xl:overflow-hidden">
          <Card className="min-h-0 overflow-y-auto p-4 sm:p-5">
            <div className="grid gap-3 lg:grid-cols-2">
              <section data-tour="upload-code" className="rounded-[22px] bg-blue-50/70 p-4 ring-1 ring-blue-100 lg:col-span-2 lg:grid lg:grid-cols-[minmax(220px,0.72fr)_minmax(360px,1.28fr)] lg:items-center lg:gap-5">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-950"><FileArchive className="h-4 w-4 text-blue-600" />上传代码包</h3>
                  <p className="mt-1.5 text-xs leading-5 text-neutral-500">优先选择 ZIP。系统只读识别页面、按钮、路由、状态变化和接口调用，不安装依赖，也不执行项目。</p>
                </div>
                <div className="mt-3 lg:mt-0"><FileField inputRef={codeInputRef} label="选择 ZIP 或源码文件" hint="支持 ZIP、JS、TS、TSX、Vue、Svelte、HTML；ZIP 不超过 30MB" accept=".zip,.js,.jsx,.ts,.tsx,.vue,.svelte,.html,.css,.scss,.less,.json,.yaml,.yml" multiple icon={<NextImage className="h-6 w-6" src="/illustrations/koboyo/file-uploading.svg" alt="" width={24} height={24} />} selectedFiles={selectedFiles.code} onFilesChange={(files) => setSelectedFiles((current) => ({ ...current, code: files }))} /></div>
              </section>

              <section className="flex min-h-[172px] flex-col rounded-[20px] bg-neutral-50 p-4 ring-1 ring-neutral-200/80">
                <h3 className="flex items-center gap-2 text-sm font-semibold"><Globe className="h-4 w-4 text-brand-600" />公开网页</h3>
                <p className="mt-1.5 text-xs leading-5 text-neutral-500">抓取公开页面，不执行点击、支付或发布操作。</p>
                <label className="mt-auto block pt-3 text-xs font-medium text-neutral-700" htmlFor="project-url">网页地址</label>
                <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2"><Input id="project-url" ref={urlInputRef} placeholder="https://example.com" /><Button onClick={() => upload("url")} disabled={uploading}>抓取网页</Button></div>
              </section>

              <section className="flex min-h-[172px] flex-col rounded-[20px] bg-neutral-50 p-4 ring-1 ring-neutral-200/80">
                <h3 className="flex items-center gap-2 text-sm font-semibold"><ImagePlus className="h-4 w-4 text-brand-600" />产品截图</h3>
                <p className="mt-1.5 text-xs leading-5 text-neutral-500">用于页面识别、图层标注和证据定位，最多 12 张。</p>
                <div className="mt-auto pt-3"><FileField inputRef={imgInputRef} label="选择产品截图" hint="PNG 或 JPEG" accept="image/png,image/jpeg" multiple icon={<ImagePlus className="h-5 w-5" />} selectedFiles={selectedFiles.images} onFilesChange={(files) => setSelectedFiles((current) => ({ ...current, images: files }))} /></div>
              </section>

              <section className="flex min-h-[154px] flex-col rounded-[20px] bg-neutral-50 p-4 ring-1 ring-neutral-200/80">
                <h3 className="flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4 text-brand-600" />PDF</h3>
                <p className="mt-1.5 text-xs leading-5 text-neutral-500">适合补充需求说明或研究材料，最多 20 页。</p>
                <div className="mt-auto pt-3"><FileField inputRef={pdfInputRef} label="选择 PDF" hint="文件不超过 50MB" accept=".pdf" icon={<FileText className="h-5 w-5" />} selectedFiles={selectedFiles.pdf} onFilesChange={(files) => setSelectedFiles((current) => ({ ...current, pdf: files.slice(0, 1) }))} /></div>
              </section>

              <section className="flex min-h-[154px] flex-col rounded-[20px] bg-neutral-50 p-4 ring-1 ring-neutral-200/80">
                <h3 className="flex items-center gap-2 text-sm font-semibold"><FileType2 className="h-4 w-4 text-brand-600" />产品文档</h3>
                <p className="mt-1.5 text-xs leading-5 text-neutral-500">补充产品规则、交互说明或测试记录。</p>
                <div className="mt-auto pt-3"><FileField inputRef={docInputRef} label="选择产品文档" hint="DOCX、Markdown 或 TXT" accept=".docx,.md,.txt" multiple icon={<FileType2 className="h-5 w-5" />} selectedFiles={selectedFiles.docs} onFilesChange={(files) => setSelectedFiles((current) => ({ ...current, docs: files }))} /></div>
              </section>
            </div>
            <div className="sticky bottom-0 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[20px] bg-white/95 p-3 shadow-[0_-10px_24px_rgb(15_23_42/0.05)] ring-1 ring-neutral-200 backdrop-blur-xl"><p className="max-w-2xl text-xs leading-5 text-neutral-500">{selectedFileCount ? `已选择 ${selectedFileCount} 个文件。上传后，系统会按材料类型分别解析。` : "选择上方任一种材料。只上传代码包也可以开始分析。"}</p><Button onClick={() => upload("files")} disabled={uploading || selectedFileCount === 0}>{uploading ? <DotMatrixLoader compact label="正在上传并解析" /> : `上传所选材料${selectedFileCount ? `（${selectedFileCount}）` : ""}`}</Button></div>
          </Card>
          <Card className="flex min-h-0 flex-col p-4"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">已添加材料</h3><span className="text-sm tabular-nums text-neutral-400">{data.artifacts.length}</span></div>{data.artifacts.length ? <ul className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain">{data.artifacts.map((item) => <li key={item.id} className="flex items-center gap-3 rounded-2xl bg-neutral-50 p-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-neutral-500 shadow-sm">{item.type === "image" ? <ImagePlus className="h-4 w-4" /> : item.type === "url" ? <Globe className="h-4 w-4" /> : item.type === "code" ? <FileArchive className="h-4 w-4 text-blue-600" /> : <FileText className="h-4 w-4" />}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{item.sourceRef}</span><span className="mt-0.5 block text-[11px] text-neutral-400">{item.status === "parsed" ? item.type === "code" ? "静态解析完成" : "解析完成" : item.status}</span></span>{item.status === "parsed" && <CircleCheck className="h-4 w-4 text-emerald-500" />}</li>)}</ul> : <EmptyState icon={<FileText className="h-5 w-5" />} title="还没有材料" description="从左侧选择一种方式添加材料。" />}<Button className="mt-4 w-full" onClick={() => goToStep("analysis")} disabled={!hasMaterials}>进入初步分析<ArrowRight className="h-4 w-4" /></Button></Card>
        </section>
      )}

      {step === "analysis" && (
        <section className="min-h-0 xl:flex xl:flex-1 xl:flex-col xl:overflow-hidden">
          {!hasMaterials ? <Card className="p-10"><EmptyState icon={<ScanSearch className="h-6 w-6" />} title="先添加审查材料" description="初步分析需要至少一份已解析材料。" /><div className="mt-5 flex justify-center"><Button onClick={() => goToStep("materials")}>返回上传材料</Button></div></Card> : (
            <>
               <div data-tour="analysis-actions" className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-[18px] bg-white px-3 py-2.5 shadow-card"><div className="min-w-0"><p className="truncate text-xs font-semibold">{data.status === "analyzed" ? "产品结构与待办已经整理完成" : "材料已经准备好"}</p><p className="mt-0.5 hidden truncate text-[11px] text-neutral-500 sm:block">{data.status === "analyzed" ? "左侧查看产品功能和交互路径；右侧选择待办后进入第三步处理。" : "系统会区分源码事实、静态推断与仍需运行验证的行为。"}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => goToStep("materials")}><ArrowLeft className="h-4 w-4" />添加或替换材料</Button><Button size="sm" onClick={analyze} disabled={analyzing || data.status === "analyzed" || !data.evidencePackage}>{analyzing ? <DotMatrixLoader compact label="正在分析产品结构" /> : data.status === "analyzed" ? <><ShieldCheck className="h-4 w-4" />分析完成</> : "开始初步分析"}</Button></div></div>
               <div className="review-workbench grid min-h-[680px] gap-3 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(620px,1fr)_320px] xl:overflow-hidden">
                <Card className="flex min-h-0 min-w-0 flex-col overflow-hidden">
                  <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-neutral-100 px-3 py-2.5">
                    <SegmentedControl size="sm" value={evidenceMode} onChange={setEvidenceMode} options={[
                      ...(hasVisualEvidence ? [{ value: "visual" as const, label: `界面证据 ${screenshotArtifacts.length + (urlArtifact ? 1 : 0)}` }] : []),
                      ...(codeArtifacts.length ? [{ value: "code" as const, label: `代码证据 ${codeArtifacts.length}` }] : []),
                      ...(documentArtifacts.length ? [{ value: "documents" as const, label: `文档证据 ${documentArtifacts.length}` }] : []),
                      ...((Number(hasVisualEvidence) + Number(codeArtifacts.length > 0) + Number(documentArtifacts.length > 0)) > 1 ? [{ value: "relations" as const, label: "关联关系" }] : []),
                    ]} />
                    {evidenceMode === "visual" && hasVisualEvidence && <select aria-label="选择截图或网页" value={currentArtifact?.id ?? ""} onChange={(event) => { setSelectedArtifactId(event.target.value); }} className="h-9 max-w-[320px] rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-xs font-medium text-neutral-700 outline-none focus:ring-2 focus:ring-brand-500">{urlArtifact && <option value={urlArtifact.id}>{pageForArtifact(urlArtifact.id)?.title ?? urlArtifact.sourceRef}</option>}{screenshotArtifacts.map((item, index) => <option key={item.id} value={item.id}>{index + 1}. {pageForArtifact(item.id)?.title ?? item.sourceRef}</option>)}</select>}
                  </div>
                  <div className="min-h-0 flex-1 overflow-hidden p-3">
                    {evidenceMode === "visual" && (currentArtifact?.storagePath ? <LayerCanvas projectId={projectId} artifactId={currentArtifact.id} imageUrl={artifactImageUrl(currentArtifact)} controls={currentControls} onChanged={load} onSelectControl={(control) => control.todoId ? selectAnalysisTodo(control.todoId) : setNotice({ kind: "info", text: "这个识别区域暂时没有需要确认的待办。" })} /> : <EmptyState icon={<ScanSearch className="h-6 w-6" />} title="没有界面证据" description="只有代码时，系统会自动切换到代码交互视图。" />)}
                    {evidenceMode === "code" && <CodeEvidencePanel artifacts={codeArtifacts} sourceIndex={data.evidencePackage?.sourceIndex ?? []} todos={data.todos} selectedTodoId={selectedTodoId} onSelectTodo={selectAnalysisTodo} onUnlinkedEvidence={() => setNotice({ kind: "info", text: "这条代码证据目前没有生成待办，仅用于理解产品交互。" })} />}
                    {evidenceMode === "documents" && <div className="h-full overflow-y-auto overscroll-contain p-1"><div className="grid gap-3 lg:grid-cols-2">{documentArtifacts.map((artifact) => { const pages = Array.isArray(artifact.parseOutput?.pages) ? artifact.parseOutput.pages as Array<{ index?: number; text?: string }> : []; const source = data.evidencePackage?.sourceIndex.find((item) => item.artifactId === artifact.id); const todo = source ? data.todos.find((item) => item.evidenceRefs.includes(source.key)) : null; return <button key={artifact.id} type="button" onClick={() => todo ? selectAnalysisTodo(todo.id) : setNotice({ kind: "info", text: "这份文档目前没有生成待办，仅作为产品事实材料。" })} className="min-h-[180px] rounded-[20px] border border-neutral-200 bg-white p-5 text-left shadow-sm hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><div className="flex items-start justify-between gap-3"><span className="grid h-10 w-10 place-items-center rounded-[14px] bg-violet-50 text-violet-600"><FileText className="h-4 w-4" /></span>{todo ? <span className="rounded-full bg-neutral-950 px-2 py-1 text-[10px] font-semibold text-white">有待办</span> : <span className="rounded-full bg-neutral-100 px-2 py-1 text-[10px] text-neutral-500">产品事实</span>}</div><h3 className="mt-4 truncate text-sm font-semibold">{artifact.sourceRef}</h3><p className="mt-2 line-clamp-4 text-xs leading-5 text-neutral-600">{pages.map((page) => page.text ?? "").join(" ").slice(0, 420) || "文档已解析，但没有可展示的文本节选。"}</p><p className="mt-3 text-[11px] text-neutral-400">{pages.length || 1} 页 · 材料原文证据</p></button>; })}</div></div>}
                    {evidenceMode === "relations" && <div className="h-full overflow-y-auto overscroll-contain p-2"><div className="mx-auto max-w-3xl"><div className="rounded-[20px] bg-neutral-50 p-5"><h3 className="flex items-center gap-2 text-sm font-semibold"><Link2 className="h-4 w-4 text-blue-600" />界面与代码如何关联</h3><p className="mt-2 text-xs leading-6 text-neutral-600">同一待办如果同时引用截图坐标和代码文件行号，会在两种证据之间形成明确关联。当前有 {data.todos.filter((todo) => { const kinds = new Set(todo.evidenceRefs.map((key) => data.evidencePackage?.sourceIndex.find((source) => source.key === key)?.locator.kind)); return kinds.has("coords") && kinds.has("code"); }).length} 个待办具备双向证据。</p></div><div className="mt-3 grid gap-2">{data.todos.map((todo) => { const refs = todo.evidenceRefs.map((key) => data.evidencePackage?.sourceIndex.find((source) => source.key === key)).filter(Boolean) as SourceRef[]; if (!refs.length) return null; return <button key={todo.id} onClick={() => selectAnalysisTodo(todo.id)} className="flex items-center justify-between gap-4 rounded-[18px] border border-neutral-200 bg-white p-4 text-left shadow-sm hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><span className="min-w-0"><span className="block truncate text-sm font-semibold">{todo.title}</span><span className="mt-1 block truncate text-[11px] text-neutral-500">{refs.map((ref) => ref.locator.kind === "code" ? `代码 ${ref.locator.filePath}:${ref.locator.startLine}` : ref.locator.kind === "coords" ? "截图框选" : ref.label).join(" ↔ ")}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-neutral-400" /></button>; })}</div></div></div>}
                  </div>
                </Card>
                <div className="min-h-0 overflow-hidden"><TodoPanel projectId={projectId} todos={data.todos} onChanged={load} onSelectTodo={selectAnalysisTodo} variant="list" /></div>
              </div>
            </>
          )}
        </section>
      )}

      {step === "todos" && <div data-tour="todo-workbench" className="min-h-0 xl:flex-1 xl:overflow-hidden"><TodoPanel projectId={projectId} todos={data.todos} onChanged={load} selectedTodoId={selectedTodoId} onSelectTodo={(id) => replaceWithoutPageScroll(`/projects/${projectId}?step=todos${id ? `&todo=${id}` : ""}`)} evidence={selectedTodo && selectedTodoArtifact && (selectedTodoArtifact.type === "image" || selectedTodoArtifact.type === "url") && selectedTodoArtifact.storagePath ? { title: pageForArtifact(selectedTodoArtifact.id)?.title ?? selectedTodoArtifact.sourceRef, imageUrl: artifactImageUrl(selectedTodoArtifact), controls: selectedTodoControls } : null} codeEvidence={selectedTodoCodeSource?.locator.filePath ? { label: selectedTodoCodeSource.label, filePath: selectedTodoCodeSource.locator.filePath, startLine: selectedTodoCodeSource.locator.startLine ?? null, endLine: selectedTodoCodeSource.locator.endLine ?? null, symbol: selectedTodoCodeSource.locator.symbol } : null} /></div>}
    </div>
  );
}

/* Product workbench · visual rules documented in design.md */
