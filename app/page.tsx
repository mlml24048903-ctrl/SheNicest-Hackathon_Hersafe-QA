"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, CircleAlert, Clock3, Image as ImageIcon, ListChecks, MoreHorizontal, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { Badge, Button, Card, EmptyState, Skeleton } from "@/components/ui";
import CreateProjectWizard from "@/components/CreateProjectWizard";

interface ProjectItem {
  id: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
  counts: { artifacts: number; todos: number; findings: number };
}

const STATUS_LABEL: Record<string, string> = { created: "等待材料", analyzing: "正在分析", analyzed: "可继续审查" };
const STATUS_TONE: Record<string, string> = { created: "neutral", analyzing: "blue", analyzed: "green" };

export default function Home() {
  const [projects, setProjects] = useState<ProjectItem[] | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [menuProjectId, setMenuProjectId] = useState<string | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<ProjectItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const deleteCloseRef = useRef<HTMLButtonElement>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const load = useCallback(async () => {
    const res = await fetch("/api/projects");
    const data = await res.json();
    setProjects(data.projects ?? []);
  }, []);
  useEffect(() => {
    // 初始数据请求在异步响应后才更新页面状态。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  useEffect(() => {
    const openWizard = () => setWizardOpen(true);
    const closeWizard = () => setWizardOpen(false);
    window.addEventListener("hersafe:open-create-project", openWizard);
    window.addEventListener("hersafe:close-create-project", closeWizard);
    return () => {
      window.removeEventListener("hersafe:open-create-project", openWizard);
      window.removeEventListener("hersafe:close-create-project", closeWizard);
    };
  }, []);

  const closeDeleteDialog = useCallback(() => {
    setProjectToDelete(null);
    window.requestAnimationFrame(() => deleteTriggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!projectToDelete || !deleteDialogRef.current) return;
    if (!deleteDialogRef.current.open) deleteDialogRef.current.showModal();
    window.requestAnimationFrame(() => deleteCloseRef.current?.focus());
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !deleting) {
        event.preventDefault();
        closeDeleteDialog();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [closeDeleteDialog, deleting, projectToDelete]);

  const deleteProject = async () => {
    if (!projectToDelete) return;
    setDeleting(true);
    setDeleteError("");
    const response = await fetch(`/api/projects/${projectToDelete.id}`, { method: "DELETE" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setDeleteError(body.error ?? "项目删除失败，请稍后重试。");
      setDeleting(false);
      return;
    }
    setProjects((current) => current?.filter((project) => project.id !== projectToDelete.id) ?? []);
    setProjectToDelete(null);
    setMenuProjectId(null);
    setDeleting(false);
  };

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <section className="flex flex-col justify-between gap-5 pb-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-[32px] font-semibold tracking-[-0.04em] text-neutral-950">项目</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">查看审查进度，继续处理材料、待办和风险结论。</p>
        </div>
        <Button className="h-11 shrink-0 px-5" data-tour="create-project" onClick={() => setWizardOpen(true)}><Plus className="h-4 w-4" />创建审查项目</Button>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section data-tour="project-list">
          <div className="mb-3 flex items-center justify-between"><div><h2 className="text-lg font-semibold">最近项目</h2><p className="mt-1 text-xs text-neutral-500">继续上次的材料审查和风险核对</p></div></div>
          {projects === null ? <div className="space-y-3"><Skeleton className="h-28 w-full" /><Skeleton className="h-28 w-full" /></div> : projects.length === 0 ? <Card className="p-10"><EmptyState illustration={<Image src="/illustrations/koboyo/check-file.svg" alt="" width={80} height={80} />} title="还没有审查项目" description="创建项目后，从上传产品材料开始审查。" /></Card> : (
            <ul className="space-y-3">
              {projects.map((p) => <li key={p.id} className="relative"><Card interactive className="relative overflow-visible"><Link href={`/projects/${p.id}?step=${p.status === "created" ? "materials" : "analysis"}`} className="group block rounded-[22px] p-5 pr-16 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 sm:p-6 sm:pr-16"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-base font-semibold text-neutral-950">{p.name}</h3><Badge color={STATUS_TONE[p.status] ?? "neutral"}>{STATUS_LABEL[p.status] ?? p.status}</Badge></div>{p.description && <p className="mt-1.5 truncate text-sm text-neutral-500">{p.description}</p>}<p className="mt-3 flex flex-wrap items-center gap-4 text-xs tabular-nums text-neutral-400"><span className="inline-flex items-center gap-1.5"><ImageIcon className="h-3.5 w-3.5" />{p.counts.artifacts} 份材料</span><span className="inline-flex items-center gap-1.5"><CircleAlert className="h-3.5 w-3.5" />{p.counts.findings} 项结论</span><span className="inline-flex items-center gap-1.5"><ListChecks className="h-3.5 w-3.5" />{p.counts.todos} 个待办</span><span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />{new Date(p.createdAt).toLocaleDateString("zh-CN")}</span></p></div><span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-brand-600">继续审查<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></span></div></Link><button type="button" aria-label={`管理项目：${p.name}`} aria-expanded={menuProjectId === p.id} onClick={(event) => { deleteTriggerRef.current = event.currentTarget; setMenuProjectId((current) => current === p.id ? null : p.id); }} className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-xl text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><MoreHorizontal className="h-5 w-5" aria-hidden /></button>{menuProjectId === p.id ? <div className="absolute right-4 top-14 z-20 w-44 animate-fade-in rounded-2xl border border-neutral-200 bg-white p-1.5 shadow-raised"><button type="button" onClick={() => { setProjectToDelete(p); setDeleteError(""); setMenuProjectId(null); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"><Trash2 className="h-4 w-4" aria-hidden />删除项目</button></div> : null}</Card></li>)}
            </ul>
          )}
        </section>

        <aside className="space-y-4">
          <Card className="p-6"><p className="text-xs font-semibold text-brand-600">审查流程</p><ol className="mt-5 space-y-5 text-sm">{["上传材料", "初步分析", "待办核查", "风险报告"].map((label, index) => <li key={label} className="flex items-center gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-neutral-100 text-xs font-semibold text-neutral-700">{index + 1}</span><span className="font-medium">{label}</span></li>)}</ol></Card>
          <Card className="p-6"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" /><h3 className="text-sm font-semibold">审查边界</h3></div><p className="mt-2 text-xs leading-5 text-neutral-500">她测提供基于材料与规则的辅助判断，不替代真实用户研究、法律意见或专业安全认证。</p></Card>
        </aside>
      </div>
      <CreateProjectWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
      {projectToDelete ? <dialog ref={deleteDialogRef} onCancel={(event) => { event.preventDefault(); if (!deleting) closeDeleteDialog(); }} aria-labelledby="delete-project-title" aria-describedby="delete-project-description" className="m-auto w-11/12 max-w-md overflow-visible rounded-[26px] border-0 bg-white p-6 shadow-raised backdrop:bg-neutral-950/25 backdrop:backdrop-blur-[2px]"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold text-red-600">不可撤销</p><h2 id="delete-project-title" className="mt-1 text-xl font-semibold tracking-tight text-neutral-950">删除“{projectToDelete.name}”？</h2></div><button ref={deleteCloseRef} type="button" aria-label="关闭删除确认" onClick={closeDeleteDialog} disabled={deleting} className="grid h-10 w-10 place-items-center rounded-xl text-neutral-500 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><X className="h-4 w-4" aria-hidden /></button></div><p id="delete-project-description" className="mt-4 text-sm leading-6 text-neutral-600">项目中的 {projectToDelete.counts.artifacts} 份材料、{projectToDelete.counts.todos} 个待办和 {projectToDelete.counts.findings} 项结论会一并删除，之后无法恢复。</p>{deleteError ? <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{deleteError}</p> : null}<div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={closeDeleteDialog} disabled={deleting}>保留项目</Button><Button variant="danger" onClick={deleteProject} disabled={deleting}>{deleting ? "正在删除" : "删除项目"}</Button></div></dialog> : null}
    </div>
  );
}
