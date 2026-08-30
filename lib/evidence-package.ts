// 证据包结构化（PRD F1.5）：将全部已解析材料统一整理为 EvidencePackage + 来源索引
// 全部确定性程序：图层来自 detectControls，docRules 来自关键词提取，不调用 AI。

import type { ControlCandidate, PackagePage, SourceRef } from "@/lib/types";
import { detectControls } from "@/lib/layers/detect";
import { readImageRaw } from "@/lib/parsers/image";
import { extractDocRules } from "@/lib/parsers/docs";
import type { CodeProjectAnalysis } from "@/lib/parsers/code";

/** 输入：已解析材料的统一形态（来自各 parser 的产物） */
export interface MaterialForPackage {
  artifactId: string;
  type: "url" | "image" | "pdf" | "docx" | "md" | "txt" | "code";
  sourceRef: string;
  /** url/image：截图存储路径 */
  storagePath?: string;
  title?: string;
  text?: string;
  /** pdf/docx 拆页结果 */
  pages?: Array<{ index: number; text: string }>;
  width?: number;
  height?: number;
  codeAnalysis?: CodeProjectAnalysis;
}

export interface BuiltPackage {
  pages: PackagePage[];
  controls: ControlCandidate[];
  userTasks: string[];
  pageRelations: Array<{ from: string; to: string; relation: string }>;
  docRules: Array<{
    docRuleId: string;
    keyword: string;
    snippet: string;
    page: number;
    artifactId: string;
  }>;
  sourceIndex: SourceRef[];
  coverage: { covered: string[]; uncovered: string[]; controlMapping: Record<string, string> };
}

/**
 * 构建证据包。幂等：传入全量材料集合重建；
 * 增量场景（补充截图）由调用方传入全量材料后整体重建，保持来源索引连续。
 */
export async function buildEvidencePackage(materials: MaterialForPackage[]): Promise<BuiltPackage> {
  const pages: PackagePage[] = [];
  const sourceIndex: SourceRef[] = [];
  const docRules: BuiltPackage["docRules"] = [];
  let srcSeq = 0;
  const nextKey = () => `S${++srcSeq}`;

  for (const m of materials) {
    if (m.type === "url") {
      const key = nextKey();
      pages.push({
        page_id: `P${pages.length + 1}`,
        title: m.title ?? m.sourceRef,
        artifact_id: m.artifactId,
        purpose: "网站页面（只读抓取）",
      });
      sourceIndex.push({
        key,
        artifactId: m.artifactId,
        locator: { kind: "url", url: m.sourceRef, page: null, coords: null },
        label: `网站页面：${m.title ?? m.sourceRef}`,
      });
      if (m.text) {
        // URL 文本同样做确定性关键词提取，并入 docRules
        for (const r of extractDocRules([{ index: 1, text: m.text }])) {
          docRules.push({ ...r, artifactId: m.artifactId });
        }
      }
    } else if (m.type === "image") {
      const key = nextKey();
      pages.push({
        page_id: `P${pages.length + 1}`,
        title: m.sourceRef,
        artifact_id: m.artifactId,
        purpose: "产品截图",
      });
      sourceIndex.push({
        key,
        artifactId: m.artifactId,
        locator: { kind: "page", url: null, page: 1, coords: null },
        label: `截图：${m.sourceRef}`,
      });
    } else if (m.type === "code" && m.codeAnalysis) {
      const analysis = m.codeAnalysis;
      const routes = analysis.routes.length ? analysis.routes : [{
        id: "route-summary",
        path: "代码结构",
        title: `${analysis.framework.join(" / ")} 项目`,
        filePath: analysis.entryFiles[0] ?? analysis.sourceName,
        framework: analysis.framework.join(" / "),
        evidence: { filePath: analysis.entryFiles[0] ?? analysis.sourceName, startLine: 1, endLine: 1, excerpt: "由静态文件结构识别；未运行代码。" },
      }];
      for (const route of routes) {
        pages.push({
          page_id: `P${pages.length + 1}`,
          title: route.title,
          artifact_id: m.artifactId,
          purpose: `代码页面 / 路由：${route.path}`,
        });
        sourceIndex.push({
          key: nextKey(),
          artifactId: m.artifactId,
          locator: { kind: "code", url: null, page: null, coords: null, filePath: route.evidence.filePath, startLine: route.evidence.startLine, endLine: route.evidence.endLine, symbol: route.evidence.symbol ?? null },
          label: `代码页面：${route.path} · ${route.evidence.filePath}:${route.evidence.startLine}`,
        });
      }
      for (const interaction of analysis.interactions) {
        sourceIndex.push({
          key: nextKey(),
          artifactId: m.artifactId,
          locator: { kind: "code", url: null, page: null, coords: null, filePath: interaction.evidence.filePath, startLine: interaction.evidence.startLine, endLine: interaction.evidence.endLine, symbol: interaction.evidence.symbol ?? null },
          label: `代码交互：${interaction.title} · ${interaction.evidence.filePath}:${interaction.evidence.startLine}`,
        });
      }
    } else {
      // pdf/docx/md/txt → 文档规则
      const key = nextKey();
      pages.push({
        page_id: `P${pages.length + 1}`,
        title: m.sourceRef,
        artifact_id: m.artifactId,
        purpose: `文档材料（${m.type.toUpperCase()}）`,
      });
      sourceIndex.push({
        key,
        artifactId: m.artifactId,
        locator: { kind: "page", url: null, page: 1, coords: null },
        label: `文档：${m.sourceRef}`,
      });
      const docPages = m.pages ?? (m.text ? [{ index: 1, text: m.text }] : []);
      for (const r of extractDocRules(docPages)) {
        docRules.push({ ...r, artifactId: m.artifactId });
      }
    }
  }

  // 图层检测（仅截图类材料；确定性算法，零模型费用）
  const controls: ControlCandidate[] = [];
  for (const m of materials) {
    if ((m.type === "image" || m.type === "url") && m.storagePath) {
      try {
        const raw = await readImageRaw(m.storagePath);
        const detected = detectControls(raw);
        detected.forEach((d, i) => {
          const key = nextKey();
          controls.push({
            id: `${m.artifactId}:C${i + 1}`,
            artifactId: m.artifactId,
            pageIndex: 0,
            rect: { x: d.x, y: d.y, w: d.w, h: d.h },
            kind: d.kind,
            origin: "auto",
            status: "unconfirmed",
            confirmation: null,
            ruleId: null,
            todoId: null,
            supplementArtifactId: null,
          });
          sourceIndex.push({
            key,
            artifactId: m.artifactId,
            locator: {
              kind: "coords",
              url: null,
              page: null,
              coords: { x: d.x, y: d.y, w: d.w, h: d.h },
            },
            label: `图层 ${d.kind} @ ${m.sourceRef} (${d.x},${d.y},${d.w}×${d.h})`,
          });
        });
      } catch {
        // 单图失败不阻断证据包构建（PRD 降级矩阵：个别页面失败输出部分结果并标明缺失）
        sourceIndex.push({
          key: nextKey(),
          artifactId: m.artifactId,
          locator: { kind: "page", url: null, page: 1, coords: null },
          label: `图层检测失败：${m.sourceRef}`,
        });
      }
    }
  }

  // 用户任务（v0 确定性提取：URL 文本中的导航类动词短语，无则空）
  const userTasks: string[] = [];
  const urlMaterial = materials.find((m) => m.type === "url" && m.text);
  if (urlMaterial?.text) {
    for (const verb of ["登录", "注册", "搜索", "发布", "分享", "评论", "私信", "设置", "举报", "拉黑"]) {
      if (urlMaterial.text!.includes(verb)) userTasks.push(`用户可以${verb}`);
    }
  }
  for (const material of materials.filter((item) => item.type === "code" && item.codeAnalysis)) {
    for (const interaction of material.codeAnalysis!.interactions) {
      const summary = `${interaction.trigger}，${interaction.action}`;
      if (!userTasks.includes(summary)) userTasks.push(summary);
      if (userTasks.length >= 40) break;
    }
  }

  // 页面关系（v0：文档材料 → 首页的"描述"关系）
  const pageRelations = materials
    .map((m, idx) => ({ type: m.type, idx }))
    .filter(({ type }) => ["pdf", "docx", "md", "txt", "code"].includes(type))
    .map(({ idx }) => ({
      from: `P${idx + 1}`,
      to: "P1",
      relation: "文档描述页面行为",
    }));

  // 交互覆盖（确定性规则：URL 抓取到的任务动词 = 已覆盖；检测出的 button/input 图层 = 待核实交互）
  const covered = userTasks;
  const uncovered = controls
    .filter((c) => c.kind === "button" || c.kind === "input")
    .map((c) => `图层 ${c.id}（${c.kind}）点击后的状态未知`);
  const controlMapping: Record<string, string> = {};
  controls.forEach((c) => {
    controlMapping[c.id] = c.kind === "button" || c.kind === "input" ? "未覆盖（点击后状态未知）" : "已定位";
  });

  return {
    pages,
    controls,
    userTasks,
    pageRelations,
    docRules,
    sourceIndex,
    coverage: { covered, uncovered, controlMapping },
  };
}
