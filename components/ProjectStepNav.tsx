"use client";

import Link from "next/link";
import { Check } from "lucide-react";

export type ProjectStep = "materials" | "analysis" | "todos" | "report";

const STEPS = [
  { id: "materials", label: "上传材料" },
  { id: "analysis", label: "初步分析" },
  { id: "todos", label: "待办核查" },
  { id: "report", label: "风险报告" },
] as const;

export default function ProjectStepNav({ projectId, current, completedThrough }: { projectId: string; current: ProjectStep; completedThrough: number }) {
  return (
    <nav className="apple-surface p-1.5" aria-label="项目步骤" data-tour="project-steps">
      <ol className="grid gap-1 md:grid-cols-4">
        {STEPS.map((step, index) => {
          const active = current === step.id;
          const complete = index < completedThrough;
          const href = step.id === "report" ? `/projects/${projectId}/report` : `/projects/${projectId}?step=${step.id}`;
          return (
            <li key={step.id}>
              <Link href={href} scroll={false} data-tour-step={step.id} aria-current={active ? "step" : undefined} className={`group flex min-h-10 items-center justify-center gap-2 rounded-[13px] px-3 py-1.5 transition-[background-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${active ? "bg-neutral-950 text-white shadow-sm" : "text-neutral-600 hover:bg-neutral-100"}`}>
                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${active ? "bg-white/15 text-white" : complete ? "bg-emerald-100 text-emerald-700" : "bg-neutral-200 text-neutral-600"}`}>
                  {complete ? <Check className="h-3 w-3" /> : index + 1}
                </span>
                <span className="whitespace-nowrap text-xs font-semibold">{step.label}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* Project workbench navigation · visual rules documented in design.md */
