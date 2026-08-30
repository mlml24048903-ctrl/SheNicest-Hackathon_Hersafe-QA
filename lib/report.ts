// 风险报告构建与 Markdown 导出（六类结论版 / tace.md §6.2 §8）
// 报告编号、排序、排版全部确定性程序，不调用 AI。
// 每条 Finding 展示：规则编号+版本+来源等级、观察/确认/推断三类事实、
// 置信度（证据充分程度）、不适用依据——完整回答「为什么判断、还缺什么、怎么改、怎么验证」。

import { prisma } from "@/lib/db";
import {
  CONFIDENCE_LABELS,
  DIMENSION_LABELS,
  FINDING_TYPE_LABELS,
  SEVERITY_LABELS,
  TODO_STATUS_LABELS,
  type Confidence,
  type FindingType,
  type TodoStatus,
  type SourceRef,
} from "@/lib/types";
import { getRuleById } from "@/lib/rules";

export interface ReportFinding {
  id: string;
  title: string;
  type: FindingType;
  typeLabel: string;
  severity: string;
  severityLabel: string;
  dimension: string | null;
  dimensionLabel: string;
  ruleId: string | null;
  ruleVersion: string | null;
  ruleSource: string;
  sources: string[];
  sourceDetails: Array<{ key: string; label: string; type: string; location: string; reliability: string }>;
  observedFacts: string[];
  confirmedFacts: string[];
  modelInference: string;
  suggestion: string;
  confidence: Confidence | null;
  confidenceLabel: string | null;
  naBasis: string | null;
  status: string;
  testCases: Array<{ given: string; whenText: string; thenText: string }>;
}

export interface ProjectReport {
  project: { id: string; name: string; createdAt: Date; status: string };
  generatedAt: string;
  findings: ReportFinding[];
  todoSummary: Array<{ status: TodoStatus; count: number }>;
  stats: Record<FindingType, number>;
  /** 规则库版本快照 */
  rulesetVersion: string;
  /** 兼容旧导出字段；用户项目不再允许生成新的离线分析。 */
  offlineMode: boolean;
  modelStatus: "live" | "test" | "unknown";
  modelName: string | null;
}

/** 汇总构建报告数据 */
export async function buildReport(projectId: string): Promise<ProjectReport> {
  const project = await prisma.auditProject.findUnique({
    where: { id: projectId },
    include: {
      findings: { include: { testCases: true } },
      todos: true,
      packs: true,
      evidencePackage: true,
    },
  });
  if (!project) throw new Error("项目不存在");

  // 只读取当前项目的初始分析记录，避免其他项目影响本报告的模型状态。
  const lastInvocation = await prisma.modelInvocation.findFirst({
    where: { projectId, functionName: "analyzeProject" },
    orderBy: { createdAt: "desc" },
  });

  const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const sourceIndex = ((project.evidencePackage?.sourceIndex as SourceRef[] | undefined) ?? []);
  const sourceMap = new Map(sourceIndex.map((source) => [source.key, source]));
  const findings: ReportFinding[] = [...project.findings]
    .sort(
      (a, b) =>
        (order[a.severity] ?? 3) - (order[b.severity] ?? 3) || a.createdAt.getTime() - b.createdAt.getTime(),
    )
    .map((f) => {
      const rule = f.ruleId ? getRuleById(f.ruleId) : undefined;
      const topSource = rule
        ? [...rule.sources].sort((a, b) => a.level.localeCompare(b.level))[0]
        : undefined;
      const conf = (f.confidence as Confidence) ?? null;
      const sourceKeys = (f.sources as string[]) ?? [];
      const sourceDetails = sourceKeys.map((key) => {
        const source = sourceMap.get(key);
        if (!source) return { key, label: key, type: "用户补充或外部来源", location: "待办对话", reliability: "用户确认后采用" };
        const locator = source.locator;
        if (locator.kind === "code") return { key, label: source.label, type: "代码证据", location: `${locator.filePath ?? "未知文件"}${locator.startLine ? `:${locator.startLine}${locator.endLine && locator.endLine !== locator.startLine ? `–${locator.endLine}` : ""}` : ""}`, reliability: "静态源码事实，未运行验证" };
        if (locator.kind === "coords") return { key, label: source.label, type: "界面证据", location: `截图坐标 ${locator.coords ? `${locator.coords.x},${locator.coords.y},${locator.coords.w}×${locator.coords.h}` : "-"}`, reliability: "可视证据，行为结果仍需确认" };
        if (locator.kind === "url") return { key, label: source.label, type: "网页证据", location: locator.url ?? "-", reliability: "抓取时页面事实" };
        return { key, label: source.label, type: "文档或页面证据", location: `第 ${locator.page ?? 1} 页`, reliability: "材料原文证据" };
      });
      return {
        id: f.id,
        title: f.title,
        type: f.type as FindingType,
        typeLabel: FINDING_TYPE_LABELS[f.type as FindingType] ?? f.type,
        severity: f.severity,
        severityLabel: SEVERITY_LABELS[f.severity as keyof typeof SEVERITY_LABELS] ?? f.severity,
        dimension: f.dimension,
        dimensionLabel: f.dimension ? (DIMENSION_LABELS[f.dimension] ?? f.dimension) : "-",
        ruleId: f.ruleId,
        ruleVersion: f.ruleVersion ?? rule?.version ?? null,
        ruleSource: topSource ? `【${topSource.level}】${topSource.ref}` : "-",
        sources: sourceKeys,
        sourceDetails,
        observedFacts: (f.observedFacts as string[]) ?? [],
        confirmedFacts: (f.confirmedFacts as string[]) ?? [],
        modelInference: f.modelInference ?? "",
        suggestion: f.suggestion ?? "",
        confidence: conf,
        confidenceLabel: conf ? (CONFIDENCE_LABELS[conf] ?? conf) : null,
        naBasis: f.naBasis ?? null,
        status: f.status,
        testCases: f.testCases.map((t) => ({ given: t.given, whenText: t.whenText, thenText: t.thenText })),
      };
    });

  const todoCounts = new Map<TodoStatus, number>();
  for (const t of project.todos) {
    const s = t.status as TodoStatus;
    todoCounts.set(s, (todoCounts.get(s) ?? 0) + 1);
  }

  const stats: Record<FindingType, number> = {
    confirmed_risk: 0,
    unverified_risk: 0,
    requirement_gap: 0,
    protected: 0,
    not_applicable: 0,
    baseline_issue: 0,
  };
  findings.forEach((f) => (stats[f.type] += 1));

  return {
    project: { id: project.id, name: project.name, createdAt: project.createdAt, status: project.status },
    generatedAt: new Date().toISOString(),
    findings,
    todoSummary: [...todoCounts.entries()].map(([status, count]) => ({ status, count })),
    stats,
    // 所选规则包的绑定版本快照
    rulesetVersion: project.packs.find((p) => p.selectedByUser)?.ruleSetVersion ?? "",
    offlineMode: lastInvocation?.model === "mock",
    modelStatus: !lastInvocation ? "unknown" : lastInvocation.model === "mock" ? "test" : "live",
    modelName: lastInvocation?.model ?? null,
  };
}

/** 渲染 Markdown 报告 */
export function renderReportMarkdown(r: ProjectReport): string {
  const lines: string[] = [];
  lines.push(`# 她测 HerSafe QA · 女性健康产品风险审查报告`);
  lines.push("");
  lines.push(
    `> 她测不是替女性评价界面，也不是普通隐私扫描器。它依据可追溯规则审查真实产品证据；证据不足时生成补证待办，用户确认事实后才更新风险。`,
  );
  lines.push("");
  lines.push(
    `**项目**：${r.project.name}　**报告编号**：RPT-${r.project.id.slice(-8).toUpperCase()}　**生成时间**：${r.generatedAt}`,
  );
  if (r.rulesetVersion) lines.push(`**规则库版本**：${r.rulesetVersion}`);
  if (r.modelStatus !== "live") {
    lines.push("");
    lines.push(`> ⚠️ 这份旧报告没有可核对的实时模型调用记录，请重新分析后再用于正式判断。`);
  } else {
    lines.push(`**分析方式**：实时模型${r.modelName ? `（${r.modelName}）` : ""}`);
  }
  lines.push("");
  lines.push(`## 结论总览`);
  lines.push("");
  lines.push(`| 类型 | 数量 |`);
  lines.push(`|---|---|`);
  for (const [type, label] of Object.entries(FINDING_TYPE_LABELS)) {
    lines.push(`| ${label} | ${r.stats[type as FindingType] ?? 0} |`);
  }
  lines.push("");

  const groups: Array<[FindingType, string]> = [
    ["confirmed_risk", "已确认风险"],
    ["unverified_risk", "需要确认的风险线索"],
    ["requirement_gap", "需求缺口"],
    ["baseline_issue", "通用基础问题"],
    ["protected", "已有保护"],
    ["not_applicable", "不适用"],
  ];
  for (const [type, label] of groups) {
    const items = r.findings.filter((f) => f.type === type);
    if (!items.length) continue;
    lines.push(`## ${label}`);
    lines.push("");
    items.forEach((f, i) => {
      lines.push(`### ${i + 1}. ${f.title}`);
      lines.push("");
      lines.push(
        `- **严重程度**：${f.severityLabel}　**置信度**：${f.confidenceLabel ?? "-"}　**维度**：${f.dimensionLabel}`,
      );
      if (f.ruleId)
        lines.push(
          `- **规则**：${f.ruleId}${f.ruleVersion ? `（v${f.ruleVersion.replace(/^v/, "")}）` : ""}　**研究依据**：${f.ruleSource}`,
        );
      if (f.sourceDetails.length) {
        lines.push(`- **材料来源**：`);
        for (const source of f.sourceDetails) lines.push(`  - ${source.type}｜${source.label}｜${source.location}｜${source.reliability}`);
      } else {
        lines.push(`- **材料来源**：还需要补充证据；目前不能据此确认问题存在。`);
      }
      if (f.observedFacts.length) lines.push(`- **观察事实**：${f.observedFacts.join("；")}`);
      if (f.confirmedFacts.length) lines.push(`- **用户确认事实**：${f.confirmedFacts.join("；")}`);
      if (f.modelInference) lines.push(`- **模型推断**：${f.modelInference.replace(/\n/g, " ")}`);
      if (f.naBasis) lines.push(`- **不适用依据**：${f.naBasis}`);
      if (f.suggestion) lines.push(`- **修改建议**：${f.suggestion}`);
      for (const tc of f.testCases) {
        lines.push("");
        lines.push(`**验证场景**`);
        lines.push("");
        lines.push(`- 初始条件：${tc.given}`);
        lines.push(`- 用户操作：${tc.whenText}`);
        lines.push(`- 预期结果：${tc.thenText}`);
      }
      lines.push("");
    });
  }

  lines.push(`## 待办处理情况`);
  lines.push("");
  for (const t of r.todoSummary) {
    lines.push(`- ${TODO_STATUS_LABELS[t.status] ?? t.status}：${t.count} 项`);
  }
  lines.push("");
  lines.push(`---`);
  lines.push(
    `*本报告提供产品风险审查参考，不构成法律意见或安全认证，不替代医学专业复核；结论仅适用于被审查的产品版本与材料范围。*`,
  );
  return lines.join("\n");
}
