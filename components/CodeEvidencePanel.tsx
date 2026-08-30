"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, Braces, CircleCheck, FileCode2, GitBranch, MousePointerClick, Network, ShieldAlert } from "lucide-react";
import { Badge, EmptyState, SegmentedControl } from "@/components/ui";
import type { CodeInteraction, CodeProjectAnalysis, CodeRoute } from "@/lib/parsers/code";
import type { SourceRef } from "@/lib/types";

interface TodoRef {
  id: string;
  title: string;
  priority: string;
  evidenceRefs: string[];
}

export interface CodeEvidenceArtifact {
  artifactId: string;
  sourceRef: string;
  analysis: CodeProjectAnalysis;
}

function EvidenceLocation({ filePath, startLine, endLine }: { filePath: string; startLine: number; endLine: number }) {
  return <span className="inline-flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-neutral-500"><FileCode2 className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{filePath}:{startLine}{endLine !== startLine ? `–${endLine}` : ""}</span></span>;
}

export default function CodeEvidencePanel({
  artifacts,
  sourceIndex,
  todos,
  selectedTodoId,
  onSelectTodo,
  onUnlinkedEvidence,
}: {
  artifacts: CodeEvidenceArtifact[];
  sourceIndex: SourceRef[];
  todos: TodoRef[];
  selectedTodoId?: string | null;
  onSelectTodo: (id: string) => void;
  onUnlinkedEvidence?: () => void;
}) {
  const [view, setView] = useState<"flows" | "features" | "evidence">("flows");
  const [artifactId, setArtifactId] = useState(artifacts[0]?.artifactId ?? "");
  const current = artifacts.find((item) => item.artifactId === artifactId) ?? artifacts[0];
  const selectedRefs = useMemo(() => new Set(todos.find((todo) => todo.id === selectedTodoId)?.evidenceRefs ?? []), [selectedTodoId, todos]);

  const sourceFor = (evidence: CodeInteraction["evidence"] | CodeRoute["evidence"]) => sourceIndex.find((source) =>
    source.artifactId === current?.artifactId && source.locator.kind === "code" && source.locator.filePath === evidence.filePath && source.locator.startLine === evidence.startLine,
  );
  const todoFor = (source: SourceRef | undefined) => source ? todos.find((todo) => todo.evidenceRefs.includes(source.key)) : undefined;

  if (!current) return <EmptyState icon={<Braces className="h-6 w-6" />} title="没有代码证据" description="上传 ZIP 或源码文件后，系统会在这里展示静态解析结果。" />;
  const features = current.analysis.features ?? [];
  const flows = current.analysis.flows ?? [];
  const riskSignals = current.analysis.riskSignals ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-neutral-950">{current.sourceRef}</h3>
            {current.analysis.framework.map((framework) => <Badge key={framework} color="blue">{framework}</Badge>)}
          </div>
          <p className="mt-1 text-xs text-neutral-500">读取 {current.analysis.analyzedFileCount} 个文本文件 · 识别 {current.analysis.coverage?.discoveredElements ?? 0} 个界面元素 · 追踪 {current.analysis.coverage?.tracedInteractions ?? current.analysis.interactions.length} 条真实操作路径</p>
        </div>
        <div className="flex items-center gap-2">
          {artifacts.length > 1 && <select aria-label="选择代码材料" value={current.artifactId} onChange={(event) => setArtifactId(event.target.value)} className="h-9 max-w-52 rounded-xl border border-neutral-200 bg-white px-3 text-xs font-medium outline-none focus:ring-2 focus:ring-brand-500"><option value={current.artifactId}>{current.sourceRef}</option>{artifacts.filter((item) => item.artifactId !== current.artifactId).map((item) => <option key={item.artifactId} value={item.artifactId}>{item.sourceRef}</option>)}</select>}
          <SegmentedControl size="sm" value={view} onChange={setView} options={[{ value: "flows", label: `交互流程 ${flows.length}` }, { value: "features", label: `界面清单 ${features.length}` }, { value: "evidence", label: "源码索引" }]} />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        <div className={`mb-3 flex items-start gap-3 rounded-[18px] px-4 py-3 ${riskSignals.length ? "bg-amber-50 text-amber-950" : "bg-emerald-50 text-emerald-950"}`}>
          {riskSignals.length ? <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> : <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" />}
          <div><p className="text-sm font-semibold">{riskSignals.length ? `发现 ${riskSignals.length} 类需要进一步确认的代码能力` : "当前代码中没有发现明确的数据外传或敏感信息展示"}</p><p className="mt-1 text-xs leading-5 opacity-80">{riskSignals.length ? riskSignals.map((item) => item.title).join("、") : "这只说明已读取的源码中没有发现相关路径，不代表运行环境和第三方服务已经完成审查。"}</p></div>
        </div>

        {view === "flows" && (!flows.length ? <EmptyState icon={<GitBranch className="h-6 w-6" />} title="没有识别到完整操作路径" description="静态代码中没有定位到常见事件写法；可以在“源码索引”查看已识别事实。" /> : (
          <div className="space-y-4">
            {flows.map((flow) => (
              <section key={flow.id}>
                <div className="flex items-center justify-between gap-3 px-1"><div className="flex items-center gap-2"><GitBranch className="h-4 w-4 text-blue-600" /><h4 className="text-sm font-semibold">{flow.title}</h4></div><Badge color="neutral">页面 {flow.routePath ?? "代码入口"}</Badge></div>
                <div className="mt-2 space-y-2">
                  {flow.steps.map((step) => {
                    const source = sourceFor(step.evidence);
                    const todo = todoFor(source);
                    const active = source ? selectedRefs.has(source.key) : false;
                    return (
                      <button key={`${flow.id}-${step.interactionId}`} type="button" onClick={() => todo ? onSelectTodo(todo.id) : onUnlinkedEvidence?.()} className={`w-full rounded-[18px] p-4 text-left transition-[background-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${active ? "bg-blue-50 shadow-[0_0_0_1px_rgb(147_197_253)]" : "bg-neutral-50 hover:bg-white hover:shadow-sm"}`}>
                        <span className="flex items-center justify-between gap-3"><span className="text-sm font-semibold text-neutral-950">{step.action}</span>{todo && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-neutral-950 px-2.5 py-1 text-xs font-semibold text-white">处理待办<ArrowUpRight className="h-3 w-3" /></span>}</span>
                        <span className="mt-3 flex min-w-0 gap-2 overflow-x-auto pb-1">
                          {(step.details ?? [step.outcome]).map((detail, index) => <span key={`${step.interactionId}-${index}`} className="flex min-w-0 shrink-0 items-center gap-2"><span className="max-w-[260px] rounded-xl bg-white px-3 py-2 text-xs leading-5 text-neutral-700 shadow-[0_1px_2px_rgb(0_0_0/0.05)]">{detail}</span>{index < (step.details ?? [step.outcome]).length - 1 && <span className="text-neutral-300">→</span>}</span>)}
                        </span>
                        <span className="mt-2 block"><EvidenceLocation {...step.evidence} /></span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ))}

        {view === "features" && (!features.length ? <EmptyState icon={<MousePointerClick className="h-6 w-6" />} title="没有识别到产品功能" description="代码中没有定位到常见的页面操作入口。" /> : <div className="grid gap-2 lg:grid-cols-2">{features.map((feature) => <div key={feature.id} className="rounded-[18px] bg-neutral-50 p-4 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]"><div className="flex items-center gap-2"><MousePointerClick className="h-4 w-4 text-blue-600" /><h4 className="text-sm font-semibold">{feature.title}</h4></div><p className="mt-2 text-xs leading-5 text-neutral-600">{feature.summary}</p><p className="mt-3 truncate font-mono text-[10px] text-neutral-400">{feature.filePath}</p></div>)}</div>)}

        {view === "evidence" && <div className="grid gap-2 lg:grid-cols-2">{[...current.analysis.routes, ...current.analysis.interactions].map((item) => { const interaction="trigger" in item ? item : null; const source=sourceFor(item.evidence); const todo=todoFor(source); return <button key={item.id} type="button" onClick={() => todo ? onSelectTodo(todo.id) : onUnlinkedEvidence?.()} className="rounded-[18px] bg-white p-4 text-left shadow-card transition-[box-shadow,transform] hover:shadow-lg active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><div className="flex items-start justify-between gap-3"><span className="flex items-center gap-2 text-sm font-semibold"><Network className="h-4 w-4 text-violet-600" />{item.title}</span>{todo && <Badge color="neutral">关联待办</Badge>}</div>{interaction && <p className="mt-2 text-xs leading-5 text-neutral-600">{interaction.action}；{interaction.result}</p>}<div className="mt-3"><EvidenceLocation {...item.evidence} /></div></button>; })}</div>}
      </div>
      <div className="border-t border-neutral-100 px-4 py-2.5 text-xs leading-5 text-neutral-500">这里的页面、按钮和流程都来自源码。选择“处理待办”可进入第三步；没有追踪到的结果会直接说明，不会补写模拟流程。</div>
    </div>
  );
}
