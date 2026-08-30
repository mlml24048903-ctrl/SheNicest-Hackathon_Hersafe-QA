// 初始分析落库：网关结果 → 校验层 → 事务创建 待办 + 初始 Finding + GWT 用例
// 不变量：初始分析只产生 hypothesis/pending_verify Finding；证据不足只生成待办。
// 规则注入集由项目所选规则包（ProjectPack）决定；校验层剥离伪规则并回查引用键。

import { prisma } from "@/lib/db";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { analyzeProject, verifyHighRisk } from "@/lib/ai-gateway";
import { getRuleById, getAllRules, type RuleV1 } from "@/lib/rules";
import { validateAnalyzeResult } from "@/lib/services/gateway-validation";
import type { ControlCandidate, PackagePage, SourceRef } from "@/lib/types";
import type { ImagePart } from "@/lib/ai-gateway/provider";
import {
  PACK_META,
  PRODUCT_TYPE_LABELS,
  SENSITIVE_DATA_LABELS,
  type InitialAnalysis,
  type ProjectProfile,
  type RulePackCode,
} from "@/lib/types";

/** 构建发送给模型的证据摘要（确定性拼接，含产品画像与规则包说明） */
function buildEvidenceSummaryText(args: {
  profile?: Partial<ProjectProfile> | null;
  packCodes?: RulePackCode[];
  pkg?: {
    pages: unknown;
    docRules: unknown;
    userTasks: unknown;
    controls: unknown;
    sourceIndex?: unknown;
    coverage?: { covered?: unknown; uncovered?: unknown };
  } | null;
  codeAnalyses?: Array<Record<string, unknown>>;
}): string {
  const parts: string[] = [];

  if (args.profile) {
    const p = args.profile;
    parts.push(
      [
        "【产品画像】",
        p.productType ? `类型：${PRODUCT_TYPE_LABELS[p.productType]}` : "",
        p.targetAudience?.length ? `目标人群：${p.targetAudience.join("、")}` : "",
        p.coreTasks?.length ? `核心任务：${p.coreTasks.join("、")}` : "",
        p.healthClaims?.length ? `健康主张：${p.healthClaims.join("、")}` : "",
        p.sensitiveData?.length
          ? `敏感数据：${p.sensitiveData.map((s) => SENSITIVE_DATA_LABELS[s] ?? s).join("、")}`
          : "",
      ]
        .filter(Boolean)
        .join("；"),
    );
  }
  if (args.packCodes?.length) {
    parts.push(`【适用规则包】${args.packCodes.map((c) => PACK_META[c]?.label ?? c).join("、")}`);
  }

  if (args.pkg) {
    const pages = (args.pkg.pages as Array<{ title: string; purpose: string }>) ?? [];
    const docRules = (args.pkg.docRules as Array<{ keyword: string; snippet: string }>) ?? [];
    const controls = (args.pkg.controls as ControlCandidate[]) ?? [];
    const sources = (args.pkg.sourceIndex as SourceRef[]) ?? [];
    const kindCount: Record<string, number> = {};
    controls.forEach((c) => (kindCount[c.kind] = (kindCount[c.kind] ?? 0) + 1));

    parts.push(
      [
        `【材料构成】网站 ${pages.filter((p) => p.purpose.includes("网站")).length} 页、截图 ${pages.filter((p) => p.purpose.includes("截图")).length} 张、文档 ${pages.filter((p) => p.purpose.includes("文档")).length} 份。`,
        `【页面】${pages.map((p) => p.title).join("；") || "无"}`,
        `【页面明细】${JSON.stringify(args.pkg.pages ?? [])}`,
        `【文档规则节选】${
          docRules
            .slice(0, 15)
            .map((r) => `[${r.keyword}] ${r.snippet}`)
            .join(" | ") || "无"
        }`,
        `【候选图层】共 ${controls.length} 个：${
          Object.entries(kindCount)
            .map(([k, v]) => `${k}×${v}`)
            .join("、") || "无"
        }`,
        `【来源索引】${JSON.stringify(sources.slice(0, 120))}`,
        `【交互覆盖】未覆盖 ${((args.pkg.coverage?.uncovered as string[]) ?? []).length} 项（button/input 点击后状态未知）`,
      ].join("\n"),
    );
  }
  if (args.codeAnalyses?.length) {
    const codeSources = (((args.pkg?.sourceIndex as SourceRef[] | undefined) ?? []).filter((source) => source.locator.kind === "code"));
    const allRiskSignals: Array<Record<string, unknown>> = [];
    const codeBlocks = args.codeAnalyses.slice(0, 3).map((analysis) => {
      const routes = (analysis.routes as Array<Record<string, unknown>> | undefined) ?? [];
      const uiElements = (analysis.uiElements as Array<Record<string, unknown>> | undefined) ?? [];
      const interactions = (analysis.interactions as Array<Record<string, unknown>> | undefined) ?? [];
      const backendEndpoints = (analysis.backendEndpoints as Array<Record<string, unknown>> | undefined) ?? [];
      const features = (analysis.features as Array<Record<string, unknown>> | undefined) ?? [];
      const flows = (analysis.flows as Array<Record<string, unknown>> | undefined) ?? [];
      const riskSignals = (analysis.riskSignals as Array<Record<string, unknown>> | undefined) ?? [];
      const coverage = (analysis.coverage as Record<string, unknown> | undefined) ?? {};
      riskSignals.forEach((signal) => {
        const evidence = (signal.evidence as Record<string, unknown> | undefined) ?? {};
        const source = codeSources.find((item) => item.locator.filePath === evidence.filePath && item.locator.startLine === evidence.startLine);
        allRiskSignals.push({ type: signal.type, title: signal.title, description: signal.description, source_key: source?.key ?? null, file_path: evidence.filePath, start_line: evidence.startLine });
      });
      return [
        `代码材料：${String(analysis.sourceName ?? "未命名代码包")}`,
        `框架：${((analysis.framework as string[] | undefined) ?? []).join("、") || "未识别"}`,
        `界面元素：${uiElements.slice(0, 120).map((element) => `${String(element.kind)}“${String(element.label)}”｜${String((element.evidence as Record<string, unknown> | undefined)?.filePath)}:${String((element.evidence as Record<string, unknown> | undefined)?.startLine)}`).join("；") || "未识别"}`,
        `解析覆盖：发现 ${String(coverage.discoveredElements ?? uiElements.length)} 个界面元素、${String(coverage.interactiveElements ?? 0)} 个可交互入口、追踪到 ${String(coverage.tracedInteractions ?? interactions.length)} 条操作路径、${String(coverage.unresolvedInteractiveElements ?? 0)} 个入口仍需确认`,
        `产品功能：${features.slice(0, 30).map((feature) => `${String(feature.title)}（${String(feature.summary)}）`).join("；") || "未识别"}`,
        `操作路径：${flows.slice(0, 20).map((flow) => `${String(flow.title)}：${JSON.stringify(flow.steps ?? [])}`).join("；") || "未识别"}`,
        `服务端接口：${backendEndpoints.slice(0, 60).map((endpoint) => `${String(endpoint.method)} ${String(endpoint.path)}｜${String(endpoint.effect)}｜${String((endpoint.evidence as Record<string, unknown> | undefined)?.filePath)}:${String((endpoint.evidence as Record<string, unknown> | undefined)?.startLine)}`).join("；") || "未识别"}`,
        `路由：${routes.slice(0, 30).map((route) => `${String(route.path)}（${String(route.filePath)}）`).join("；") || "未识别"}`,
        `交互证据：${interactions.slice(0, 60).map((item) => {
          const evidence = (item.evidence as Record<string, unknown> | undefined) ?? {};
          return `${String(item.title)}｜${String(item.trigger)}｜${String(item.action)}｜${String(evidence.filePath)}:${String(evidence.startLine)}`;
        }).join("；") || "未识别"}`,
      ].join("\n");
    });
    parts.push(`【代码静态分析】以下内容来自源码结构和文本，不代表已经运行验证。\n${codeBlocks.join("\n\n")}\n\n【代码风险线索】${JSON.stringify(allRiskSignals)}`);
  }
  return parts.join("\n\n");
}

/** 从规则 gwt_template 确定性生成 Given-When-Then 测试用例 */
export function buildGwtFromRule(ruleId: string | null): {
  given: string;
  whenText: string;
  thenText: string;
} {
  const rule = ruleId ? getRuleById(ruleId) : undefined;
  if (!rule) {
    return {
      given: "用户处于对应女性健康审查维度的风险情境",
      whenText: "操作与「产品行为符合女性健康保护要求」相关的功能",
      thenText: "产品行为满足对应安全规则要求",
    };
  }
  return {
    given: rule.gwt_template.given,
    whenText: rule.gwt_template.when,
    thenText: `${rule.gwt_template.then}（依据规则 ${rule.rule_id} v${rule.version.replace(/^v/, "")}）`,
  };
}

export interface InitialAnalysisOutcome {
  mode: "live" | "mock";
  cached: boolean;
  invocationId: string;
  todoIds: string[];
  findingIds: string[];
  /** 业务后校验剥离的警告（供前端展示降级原因） */
  warnings: string[];
}

function sourceIndexKeys(sourceIndex: unknown): Set<string> {
  return new Set(((sourceIndex as SourceRef[]) ?? []).map((s) => s.key));
}

/**
 * 采集最近上传的已解析截图作为多模态输入（≤2 张、单张 ≤420KB，读失败静默跳过）。
 * storagePath 兼容两种落盘形态：「uploads/xxx.jpg」相对 data/ 与直接相对仓库根。
 */
async function collectImageParts(projectId: string): Promise<ImagePart[]> {
  try {
    const arts = await prisma.inputArtifact.findMany({
      where: { projectId, type: "image", status: "parsed", NOT: { storagePath: null } },
      orderBy: { createdAt: "desc" },
      take: 2,
    });
    const parts: ImagePart[] = [];
    for (const a of arts) {
      if (!a.storagePath) continue;
      const candidates = [
        path.join(process.cwd(), "data", a.storagePath),
        path.join(process.cwd(), "data", "uploads", a.storagePath),
        path.join(process.cwd(), a.storagePath),
      ];
      for (const fp of candidates) {
        try {
          const buf = await readFile(fp);
          if (buf.length > 420_000) break; // 超限跳过该张（防上下文膨胀）
          parts.push({
            base64: buf.toString("base64"),
            mimeType: /\.png$/i.test(a.storagePath) ? "image/png" : "image/jpeg",
          });
          break;
        } catch {
          /* 尝试下一候选路径 */
        }
      }
    }
    return parts;
  } catch {
    return []; // 多模态注入失败不阻断文本分析
  }
}

function parseProfile(project: {
  productType: string | null;
  targetAudience: unknown;
  coreTasks: unknown;
  healthClaims: unknown;
  sensitiveData: unknown;
  userRoles: unknown;
}): Partial<ProjectProfile> | null {
  const hasAny =
    project.productType ||
    project.targetAudience ||
    project.coreTasks ||
    project.healthClaims ||
    project.sensitiveData;
  if (!hasAny) return null;
  return {
    productType: (project.productType as ProjectProfile["productType"]) ?? undefined,
    targetAudience: (project.targetAudience as string[]) ?? undefined,
    coreTasks: (project.coreTasks as string[]) ?? undefined,
    healthClaims: (project.healthClaims as string[]) ?? undefined,
    sensitiveData: (project.sensitiveData as ProjectProfile["sensitiveData"]) ?? undefined,
    userRoles: (project.userRoles as ProjectProfile["userRoles"]) ?? undefined,
  };
}

/** 触发项目级初始分析并落库（事务，失败不产生半完成状态） */
export async function runInitialAnalysis(projectId: string): Promise<InitialAnalysisOutcome> {
  const project = await prisma.auditProject.findUnique({
    where: { id: projectId },
    include: { evidencePackage: { include: { coverage: true } }, packs: true, artifacts: true },
  });
  if (!project) throw new Error("项目不存在");
  if (project.status === "analyzing") throw new Error("初始分析正在进行中");
  if (project.status === "analyzed") throw new Error("项目已完成初始分析（每项目原则上一次）");

  const pkg = project.evidencePackage;
  if (!pkg) throw new Error("证据包尚未构建，请先上传材料");

  await prisma.auditProject.update({ where: { id: projectId }, data: { status: "analyzing" } });

  const packCodes = project.packs.filter((p) => p.selectedByUser).map((p) => p.packCode as RulePackCode);

  let gatewayResult;
  try {
    // §11.1 多模态闭环：截图以真实图像一并送入初始分析（读盘失败自动退化为纯文本）
    const images = await collectImageParts(projectId);
    gatewayResult = await analyzeProject({
      projectId,
      evidenceSummary: buildEvidenceSummaryText({
        profile: parseProfile(project),
        packCodes,
        pkg: pkg
          ? {
              pages: pkg.pages,
              docRules: pkg.docRules,
              userTasks: pkg.userTasks,
              controls: pkg.controls,
              sourceIndex: pkg.sourceIndex,
              coverage: pkg.coverage
                ? { covered: pkg.coverage.covered, uncovered: pkg.coverage.uncovered }
                : undefined,
            }
          : null,
        codeAnalyses: project.artifacts
          .filter((artifact) => artifact.type === "code" && artifact.status === "parsed")
          .map((artifact) => (artifact.parseOutput ?? {}) as Record<string, unknown>),
      }),
      packs: packCodes,
      profile: parseProfile(project) ?? undefined,
      images,
    });
  } catch (err) {
    // 失败回滚状态：保留预处理产物，允许稍后继续
    await prisma.auditProject.update({ where: { id: projectId }, data: { status: "created" } });
    throw err;
  }

  // ===== 业务后校验：伪规则剥离 + 引用键回查 =====
  // 合法集取全量规则 id（校验目标是「不得编造」，超集安全）
  const allowedRuleIds = new Set(getAllRules().map((r) => r.rule_id));
  const { result: analysis, warnings } = validateAnalyzeResult(gatewayResult.result as InitialAnalysis, {
    allowedRuleIds,
    sourceKeys: sourceIndexKeys(pkg.sourceIndex),
  });
  const findingKeys = new Set(analysis.initial_findings.map((finding) => finding.rule_id ?? "__general__"));
  const missingFindingKeys = [...new Set(analysis.todos.map((todo) => todo.rule_id ?? "__general__"))]
    .filter((key) => !findingKeys.has(key));
  if (missingFindingKeys.length) {
    await prisma.auditProject.update({ where: { id: projectId }, data: { status: "created" } });
    throw new Error("模型已经尝试自动补齐结果，但仍有待办缺少对应的风险结论。本次结果没有保存，请重新开始初步分析。");
  }

  // 落库（事务）
  const { todoIds, findingIds } = await prisma.$transaction(async (tx) => {
    const findingIds: string[] = [];
    const todoIds: string[] = [];
    const sourceIndex = (pkg.sourceIndex as SourceRef[]) ?? [];
    const linkedControls = ((pkg.controls as ControlCandidate[]) ?? []).map((control) => ({ ...control }));
    const currentPages = (pkg.pages as PackagePage[]) ?? [];
    const knownArtifacts = new Set(currentPages.map((page) => page.artifact_id));
    const modelPages = new Map(
      analysis.pages
        .filter((page) => knownArtifacts.has(page.artifact_id))
        .map((page) => [page.artifact_id, page]),
    );
    const summarizedPages = currentPages.map((page) => {
      const modelPage = modelPages.get(page.artifact_id);
      return modelPage
        ? {
            ...page,
            title: modelPage.title.trim() || page.title,
            purpose: modelPage.purpose.trim() || page.purpose,
          }
        : page;
    });

    // 1) 初始 Finding（二次防御：只允许 unverified_risk / requirement_gap）
    for (const f of analysis.initial_findings) {
      const safeType = f.type === "requirement_gap" ? "requirement_gap" : "unverified_risk";
      const rule: RuleV1 | undefined = f.rule_id ? getRuleById(f.rule_id) : undefined;
      const created = await tx.finding.create({
        data: {
          projectId,
          title: f.title,
          type: safeType,
          severity: f.severity,
          dimension: f.dimension,
          ruleId: f.rule_id,
          ruleVersion: rule?.version ?? null,
          sources: f.sources,
          observedFacts: [...f.observed, ...(f.risk_basis ? [`检查点：${f.risk_basis}`] : [])],
          confirmedFacts: [],
          modelInference: f.inference,
          suggestion: f.suggestion,
          status: f.status === "pending_verify" ? "pending_verify" : "hypothesis",
          testCases: { create: buildGwtFromRule(f.rule_id) },
        },
      });
      findingIds.push(created.id);
    }

    // 2) 待办（≤5）+ 独立对话线程（含初始问题与规则追问模板——打开待办零模型调用）
    for (const t of analysis.todos) {
      const gap = analysis.evidence_gaps.find((g) => g.related_rule_ids.includes(t.rule_id ?? ""));
      const gapText = gap?.description?.replace(/还需核对[：:]\s*/g, "").replace(/\s+/g, " ").trim();
      const todo = await tx.reviewTodo.create({
        data: {
          projectId,
          title: t.title,
          priority: t.priority,
          reason: t.reason,
          evidenceRefs: t.evidence_refs,
          ruleId: t.rule_id,
          status: "pending",
          conversation: {
            create: {
              messages: [
                {
                  role: "assistant",
                  content: [
                    gapText ? `还需核对：${gapText}` : "还需核对：这项功能在实际运行时的表现，以及用户是否能够控制相关结果。",
                    "引导问题：请说明实际触发后页面显示什么，以及相关数据是否会保存、发送、保留或删除。",
                    "可以直接回答，也可以补充对应截图或说明。",
                  ]
                    .filter(Boolean)
                    .join("\n\n"),
                  round: 0,
                  kind: "question",
                  createdAt: new Date().toISOString(),
                  attachments: [],
                },
              ],
            },
          },
        },
      });
      // 关联同规则 Finding（建立链接，供增量更新定位）
      const matchIdx = analysis.initial_findings.findIndex((f) => f.rule_id === t.rule_id);
      if (matchIdx >= 0 && findingIds[matchIdx]) {
        await tx.reviewTodo.update({
          where: { id: todo.id },
          data: { findingId: findingIds[matchIdx] },
        });
      }
      todoIds.push(todo.id);

      // 把模型引用的坐标来源回连到现有图层。新分析可由“框选 → 待办 → 对话”直接跳转。
      for (const refKey of t.evidence_refs) {
        const source = sourceIndex.find((item) => item.key === refKey);
        const coords = source?.locator.coords;
        if (!source || !coords) continue;
        const control = linkedControls.find(
          (item) =>
            item.artifactId === source.artifactId &&
            item.rect.x === coords.x &&
            item.rect.y === coords.y &&
            item.rect.w === coords.w &&
            item.rect.h === coords.h,
        );
        if (!control || control.todoId) continue;
        control.todoId = todo.id;
        control.ruleId = t.rule_id;
        control.status = "needs_evidence";
      }
    }

    await tx.evidencePackage.update({
      where: { projectId },
      data: { pages: summarizedPages, controls: linkedControls },
    });

    await tx.auditProject.update({ where: { id: projectId }, data: { status: "analyzed" } });
    return { todoIds, findingIds };
  });

  // 3) 高风险 Finding 100% 走独立复核
  const highRiskFindings = await prisma.finding.findMany({
    where: { projectId, severity: "high", status: { in: ["hypothesis", "pending_verify"] } },
  });
  for (const f of highRiskFindings) {
    try {
      const v = await verifyHighRisk({
        projectId,
        finding: {
          id: f.id,
          title: f.title,
          type: f.type,
          severity: f.severity,
          sources: (f.sources as string[]) ?? [],
          dimension: f.dimension,
          ruleId: f.ruleId,
        },
        evidenceSummary: buildEvidenceSummaryText({
          pkg: {
            pages: pkg.pages,
            docRules: pkg.docRules,
            userTasks: pkg.userTasks,
            controls: pkg.controls,
            sourceIndex: pkg.sourceIndex,
          },
          codeAnalyses: project.artifacts
            .filter((artifact) => artifact.type === "code" && artifact.status === "parsed")
            .map((artifact) => (artifact.parseOutput ?? {}) as Record<string, unknown>),
        }),
      });
      if (!v.result.consistent) {
        await prisma.finding.update({
          where: { id: f.id },
          data: {
            type: v.result.corrected_type ?? f.type,
            severity: v.result.corrected_severity ?? f.severity,
            modelInference: `${f.modelInference ?? ""}\n[复核] ${v.result.reason}`.trim(),
          },
        });
      }
    } catch {
      // 复核失败不阻断主流程（保留产物稍后继续）
    }
  }

  return {
    mode: gatewayResult.mode,
    cached: gatewayResult.cached,
    invocationId: gatewayResult.invocationId,
    todoIds,
    findingIds,
    warnings,
  };
}
