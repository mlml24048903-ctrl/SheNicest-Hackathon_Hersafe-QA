// 风险报告页（PRD §10 页面 3）：四类结论 + 三类事实区分 + GWT 用例 + 导出
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Banner,
  Button,
  Card,
  EmptyState,
  SeverityBadge,
  Spinner,
  TypeBadge,
} from "@/components/ui";
import type { FindingType } from "@/lib/types";
import type { ProjectReport } from "@/lib/report";
import { getRuleById } from "@/lib/rules";
import ProjectStepNav from "@/components/ProjectStepNav";
// Rive 鲸鱼（无 .riv 资产时自动降级 SVG 浮鲸）
import {
  Check,
  BookOpen,
  CircleHelp,
  CircleSlash,
  ClipboardList,
  Copy,
  FileSearch,
  OctagonAlert,
  ShieldCheck,
} from "lucide-react";

// 六类结论 → 图标与配色（统计卡与分组标题共用同一映射，消灭 emoji 前缀）
const TYPE_ICON: Record<FindingType, typeof OctagonAlert> = {
  confirmed_risk: OctagonAlert,
  unverified_risk: CircleHelp,
  requirement_gap: ClipboardList,
  protected: ShieldCheck,
  not_applicable: CircleSlash,
  baseline_issue: BookOpen,
};
const TYPE_ICON_TONE: Record<FindingType, string> = {
  confirmed_risk: "text-red-600",
  unverified_risk: "text-amber-600",
  requirement_gap: "text-blue-600",
  protected: "text-green-600",
  not_applicable: "text-neutral-500",
  baseline_issue: "text-sky-600",
};

/** 统一渲染某结论类型的图标 */
function TypeIcon({ type, className }: { type: FindingType; className?: string }) {
  const Icon = TYPE_ICON[type];
  return <Icon className={className} aria-hidden />;
}

export default function ReportPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [report, setReport] = useState<ProjectReport | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    fetch(`/api/projects/${projectId}/report`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "报告加载失败");
        return res.json();
      })
      .then(setReport)
      .catch((e: Error) => setError(e.message));
  }, [projectId]);

  const copyCase = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      /* 剪贴板不可用时静默 */
    }
  };

  if (error)
    return (
      <main className="mx-auto max-w-4xl p-8">
        <Banner kind="error">{error}</Banner>
        <Link href={`/projects/${projectId}`} className="mt-4 inline-flex min-h-10 items-center rounded-xl border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50">
          ← 返回审查台
        </Link>
      </main>
    );
  if (!report)
    return (
      <main className="p-8">
        <Spinner label="构建报告…" />
      </main>
    );

  const groups: Array<[FindingType, string]> = [
    ["confirmed_risk", "已确认风险"],
    ["unverified_risk", "需要确认的风险线索"],
    ["requirement_gap", "需求缺口"],
    ["baseline_issue", "通用基础问题"],
    ["protected", "已有保护"],
    ["not_applicable", "不适用"],
  ];

  return (
    <main data-tour="report-summary" className="mx-auto h-[calc(100dvh-4rem)] max-w-6xl overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 lg:px-8">
      {/* 头部 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/projects/${projectId}?step=todos`} className="mb-3 inline-flex min-h-10 items-center rounded-xl border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50">
            ← 返回待办核查
          </Link>
          <h1 className="text-2xl font-semibold tracking-[-0.025em] text-neutral-950">风险审查报告</h1>
          <p className="mt-1 text-sm text-neutral-500">{report.project.name}</p>
          <p className="mt-1 text-xs text-neutral-500">
            {/* 铭牌细节：编号用品牌深色 + tabular-nums，成为版式锚点 */}
            报告编号{" "}
            <span className="font-medium tabular-nums tracking-tight text-brand-700">
              RPT-{report.project.id.slice(-8).toUpperCase()}
            </span>{" "}
            · 生成时间 {new Date(report.generatedAt).toLocaleString("zh-CN")}
          </p>
        </div>
        <div className="flex gap-2">
          <a href={`/api/projects/${projectId}/report/export?format=md`}>
            <Button variant="outline" size="sm">
              导出 Markdown
            </Button>
          </a>
          <a href={`/api/projects/${projectId}/report/export?format=pdf`}>
            <Button variant="outline" size="sm">
              导出 PDF
            </Button>
          </a>
        </div>
      </div>

      <div className="mt-6"><ProjectStepNav projectId={projectId} current="report" completedThrough={3} /></div>

      {report.modelStatus !== "live" && (
        <div className="mt-4">
          <Banner kind="warn" title="这份旧报告不能作为正式结论">
            {report.modelStatus === "test"
              ? "这份报告来自早期测试数据，没有调用实时模型。请重新分析项目后再使用报告。"
              : "系统没有找到这份报告对应的模型调用记录。请重新分析项目后再使用报告。"}
          </Banner>
        </div>
      )}

      {report.modelStatus === "live" && (
        <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          已使用实时模型分析{report.modelName ? ` · ${report.modelName}` : ""}
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3 rounded-[20px] bg-white px-5 py-4 shadow-card">
        {groups.map(([type, label]) => (
          <div key={type} className="flex min-w-[128px] items-center gap-2.5">
            <TypeIcon type={type} className={`h-4 w-4 ${TYPE_ICON_TONE[type]}`} />
            <span className="text-xl font-semibold tabular-nums text-neutral-950">{report.stats[type] ?? 0}</span>
            <span className="text-sm text-neutral-500">{label}</span>
          </div>
        ))}
      </div>

      {/* 分组结论 */}
      {groups.map(([type, label]) => {
        const items = report.findings.filter((f) => f.type === type);
        if (!items.length) return null;
        return (
          <section key={type} className="mt-8">
            <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-neutral-900">
              <TypeIcon type={type} className={`h-5 w-5 ${TYPE_ICON_TONE[type]}`} />
              {label}
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium tabular-nums text-neutral-500">
                {items.length}
              </span>
            </h2>
            <div className="mt-3 space-y-3">
              {items.map((f) => {
                const fullRule = f.ruleId ? getRuleById(f.ruleId) : undefined;
                return (
                  <Card
                    key={f.id}
                    className="p-5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <TypeIcon type={f.type} className={`h-4 w-4 shrink-0 ${TYPE_ICON_TONE[f.type]}`} />
                      <span className="min-w-0 flex-1 text-sm font-semibold leading-6 text-neutral-950">{f.title}</span>
                      <TypeBadge type={f.type} />
                      <SeverityBadge severity={f.severity as "high" | "medium" | "low"} />
                      <span className="rounded-md bg-stone-100 px-2 py-0.5 text-xs text-neutral-500">
                        {f.dimensionLabel}
                      </span>
                      {f.ruleId && (
                        <span className="rounded-md bg-stone-100 px-2 py-0.5 text-xs text-neutral-500">
                          {f.ruleId}
                        </span>
                      )}
                    </div>
                    <div className="mt-3 space-y-1.5 text-xs leading-relaxed">
                      {f.sourceDetails?.length ? <div className="pt-1"><p className="font-semibold text-neutral-700">材料来源</p><ul className="mt-1.5 grid gap-1.5">{f.sourceDetails.map((source) => <li key={`${f.id}-${source.key}`} className="rounded-xl bg-neutral-50 px-3 py-2 text-xs leading-5 text-neutral-600"><span className="font-semibold text-neutral-800">{source.type}</span> · {source.label || source.location}<span className="ml-2 text-neutral-500">{source.location}</span><span className="ml-2 text-neutral-400">{source.reliability}</span></li>)}</ul></div> : <p className="text-neutral-500"><span className="font-semibold text-neutral-600">材料来源：</span>还需要补充证据；目前不能据此确认问题存在。</p>}
                      <p className="text-neutral-500">
                        <span className="font-semibold text-neutral-600">研究依据：</span>
                        {f.ruleSource}
                        {f.confidenceLabel ? (
                          <span>
                            {"　"}
                            <span className="font-semibold text-neutral-600">置信度：</span>
                            {f.confidenceLabel}
                            {f.naBasis ? (
                              <span>
                                　·　<span className="font-semibold">不适用依据：</span>
                                {f.naBasis}
                              </span>
                            ) : null}
                          </span>
                        ) : null}
                      </p>
                      {f.observedFacts.length > 0 && (
                        <p className="text-neutral-500">
                          <span className="font-semibold text-neutral-600">观察事实：</span>
                          {f.observedFacts.join("；")}
                        </p>
                      )}
                      {f.confirmedFacts.length > 0 && (
                        <p className="text-green-800">
                          <span className="font-semibold">用户确认事实：</span>
                          {f.confirmedFacts.join("；")}
                        </p>
                      )}
                      {f.modelInference && (
                        <p className="text-neutral-500">
                          <span className="font-semibold text-neutral-600">模型推断：</span>
                          {f.modelInference.replace(/\n/g, " ")}
                        </p>
                      )}
                      {f.suggestion && (
                        <p className="text-blue-800">
                          <span className="font-semibold">修改建议：</span>
                          {f.suggestion}
                        </p>
                      )}
                    </div>
                    {fullRule && (
                      <details className="mt-4 rounded-2xl bg-neutral-50 p-4">
                        <summary className="cursor-pointer text-sm font-semibold text-neutral-700">查看规则解释与依据</summary>
                        <div className="mt-3 space-y-3 text-sm leading-6 text-neutral-600">
                          <p><b className="text-neutral-800">规则要求：</b>{fullRule.normative_requirement}</p>
                          <p><b className="text-neutral-800">为什么重要：</b>{fullRule.harm_path}</p>
                          <p><b className="text-neutral-800">需要的证据：</b>{fullRule.required_evidence.join("；")}</p>
                          <p className="text-xs"><b className="text-neutral-800">依据来源：</b>{fullRule.sources.map((source) => `${source.ref}${source.clause ? `（${source.clause}）` : ""}`).join("；")}</p>
                        </div>
                      </details>
                    )}
                    {f.testCases.map((tc, i) => (
                      <div
                        key={i}
                        className="mt-3 rounded-lg border border-dashed border-brand-200/70 bg-brand-50/30 p-3"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-neutral-600">场景验证步骤</p>
                          <button
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-brand-600 transition-all duration-200 hover:bg-brand-50 hover:text-brand-700 active:scale-95"
                            onClick={() =>
                              copyCase(
                                `${f.id}-${i}`,
                                `初始条件：${tc.given}\n用户操作：${tc.whenText}\n预期结果：${tc.thenText}`,
                              )
                            }
                          >
                            {copied === `${f.id}-${i}` ? (
                              <span key="copied" className="inline-flex animate-scale-in items-center gap-1">
                                <Check className="h-3.5 w-3.5 text-green-600" />
                                已复制
                              </span>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5" />
                                复制
                              </>
                            )}
                          </button>
                        </div>
                        <ul className="mt-1.5 space-y-0.5 text-xs leading-relaxed text-neutral-700">
                          {/* ▸ 扫描锚点：品牌色引导 Given/When/Then 三段结构 */}
                          <li>
                            <span aria-hidden className="text-brand-500">
                              ▸{" "}
                            </span>
                            <b>初始条件</b>：{tc.given}
                          </li>
                          <li>
                            <span aria-hidden className="text-brand-500">
                              ▸{" "}
                            </span>
                            <b>用户操作</b>：{tc.whenText}
                          </li>
                          <li>
                            <span aria-hidden className="text-brand-500">
                              ▸{" "}
                            </span>
                            <b>预期结果</b>：{tc.thenText}
                          </li>
                        </ul>
                      </div>
                    ))}
                  </Card>
                );
              })}
            </div>
          </section>
        );
      })}

      {report.findings.length === 0 && (
        <Card className="mt-6">
          <EmptyState
            icon={<FileSearch className="h-6 w-6" />}
            title="暂无结论"
            description="完成初始分析与待办确认后生成"
          />
        </Card>
      )}

      <p className="mt-6 text-center text-[11px] text-neutral-400">
        本报告不构成法律意见、安全认证，也不替代真实女性用户研究和专业安全评审。
      </p>
    </main>
  );
}
