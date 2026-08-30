// 上传解析管线编排（M1 核心）：限制校验 → 各类型解析 → pHash 去重 → 建档 → 重建证据包
// 全部确定性程序（PRD F1.4：解析管线不调用 AI）；超限/失败给明确提示而非静默失败（F1.6）。

import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { LIMITS } from "@/lib/config";
import { saveAndParseImage } from "@/lib/parsers/image";
import { parsePdf, parseDocx, parsePlain } from "@/lib/parsers/docs";
import { parseUrl, UrlParseError } from "@/lib/parsers/url";
import { parseCodePackage } from "@/lib/parsers/code";
import { buildEvidencePackage, type MaterialForPackage } from "@/lib/evidence-package";
import { UPLOAD_DIR } from "@/lib/config";
import type { ControlCandidate } from "@/lib/types";
import type { InputArtifact } from "@prisma/client";

export interface IngestInput {
  images?: Array<{ name: string; bytes: Buffer }>;
  pdf?: { name: string; bytes: Buffer };
  docs?: Array<{ name: string; bytes?: Buffer; text?: string; type: "docx" | "md" | "txt" }>;
  url?: string;
  codeFiles?: Array<{ name: string; bytes: Buffer }>;
}

export interface IngestWarning {
  artifactRef: string;
  message: string;
}

export interface IngestResult {
  created: Array<{ id: string; type: string; sourceRef: string; status: string }>;
  deduped: string[];
  warnings: IngestWarning[];
}

/** 汉明距离（hex pHash） */
function hammingHex(a: string, b: string): number {
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      dist += x & 1;
      x >>= 1;
    }
  }
  return dist;
}

/** 单次上传编排入口 */
export async function ingestArtifacts(projectId: string, input: IngestInput): Promise<IngestResult> {
  const warnings: IngestWarning[] = [];
  const created: IngestResult["created"] = [];
  const deduped: string[] = [];

  const project = await prisma.auditProject.findUnique({ where: { id: projectId } });
  if (!project) throw new Error("项目不存在");

  const existing = await prisma.inputArtifact.findMany({ where: { projectId } });
  const existingImages = existing.filter((a) => a.type === "image" && a.pHash);

  // ===== 数量限制（明确报错，不静默截断）=====
  const incomingImages = input.images ?? [];
  if (existingImages.length + incomingImages.length > LIMITS.maxImages) {
    throw new Error(
      `截图数量超限：已有 ${existingImages.length} 张 + 本次 ${incomingImages.length} 张 > 上限 ${LIMITS.maxImages} 张`,
    );
  }
  const existingUrls = existing.filter((a) => a.type === "url");
  if (input.url && existingUrls.length >= LIMITS.maxUrls) {
    throw new Error(`网站数量超限：每项目最多 ${LIMITS.maxUrls} 个网站`);
  }
  const existingCode = existing.filter((a) => a.type === "code" && a.status === "parsed");
  if (existingCode.length + (input.codeFiles?.length ?? 0) > LIMITS.maxCodeFiles) {
    throw new Error(`代码材料数量超限：每个项目最多 ${LIMITS.maxCodeFiles} 个代码包或源码文件`);
  }

  // ===== 图片：压缩 + pHash 去重 =====
  for (const img of incomingImages) {
    if (img.bytes.byteLength > LIMITS.maxImgMB * 1024 * 1024) {
      warnings.push({ artifactRef: img.name, message: `图片超过 ${LIMITS.maxImgMB}MB 上限，已跳过` });
      continue;
    }
    try {
      const parsed = await saveAndParseImage(img.name, img.bytes);
      // 去重：与项目内已有图片比较（PRD F1.6：pHash 命中不重复计入证据包）
      // 阈值 ≤6/64bit：同一截图重传/轻微压缩差异通常距离 0-4；收紧以降低不同截图的误判
      const dup = existingImages.find((a) => a.pHash && hammingHex(a.pHash, parsed.pHash) <= 6);
      if (dup) {
        deduped.push(img.name);
        await prisma.inputArtifact.create({
          data: {
            projectId,
            type: "image",
            sourceRef: img.name,
            pHash: parsed.pHash,
            status: "deduped",
            parseOutput: { duplicateOf: dup.id },
          },
        });
        continue;
      }
      const artifact = await prisma.inputArtifact.create({
        data: {
          projectId,
          type: "image",
          sourceRef: img.name,
          storagePath: parsed.storagePath,
          pHash: parsed.pHash,
          status: "parsed",
          parseOutput: { width: parsed.width, height: parsed.height, pHash: parsed.pHash },
        },
      });
      created.push({ id: artifact.id, type: "image", sourceRef: img.name, status: "parsed" });
      // 纳入去重池（同批重复上传检测）
      existingImages.push({
        id: artifact.id,
        pHash: parsed.pHash,
      } as InputArtifact);
    } catch (err) {
      warnings.push({
        artifactRef: img.name,
        message: `图片解析失败：${err instanceof Error ? err.message : err}`,
      });
    }
  }

  // ===== URL：Playwright 安全截图 + 文本 =====
  if (input.url) {
    try {
      const parsed = await parseUrl(input.url);
      const artifact = await prisma.inputArtifact.create({
        data: {
          projectId,
          type: "url",
          sourceRef: parsed.url,
          storagePath: parsed.storagePath,
          status: "parsed",
          parseOutput: { title: parsed.title, text: parsed.text },
        },
      });
      created.push({ id: artifact.id, type: "url", sourceRef: parsed.url, status: "parsed" });
    } catch (err) {
      const msg = err instanceof UrlParseError ? `${err.code}: ${err.message}` : String(err);
      warnings.push({ artifactRef: input.url, message: `网站解析失败（${msg}）` });
      // 记录失败材料，允许稍后继续（PRD §7.3）
      await prisma.inputArtifact.create({
        data: {
          projectId,
          type: "url",
          sourceRef: input.url,
          status: "failed",
          parseOutput: { error: msg },
        },
      });
    }
  }

  // ===== PDF：拆页 =====
  if (input.pdf) {
    if (input.pdf.bytes.byteLength > LIMITS.maxPdfMB * 1024 * 1024) {
      warnings.push({ artifactRef: input.pdf.name, message: `PDF 超过 ${LIMITS.maxPdfMB}MB 上限，已跳过` });
    } else {
      try {
        const parsed = await parsePdf(input.pdf.bytes);
        parsed.warnings.forEach((w) => warnings.push({ artifactRef: input.pdf!.name, message: w }));
        const artifact = await prisma.inputArtifact.create({
          data: {
            projectId,
            type: "pdf",
            sourceRef: input.pdf.name,
            status: "parsed",
            parseOutput: { pages: parsed.pages, pageCount: parsed.pageCount },
          },
        });
        created.push({ id: artifact.id, type: "pdf", sourceRef: input.pdf.name, status: "parsed" });
      } catch (err) {
        warnings.push({
          artifactRef: input.pdf.name,
          message: `PDF 解析失败：${err instanceof Error ? err.message : err}`,
        });
        await prisma.inputArtifact.create({
          data: {
            projectId,
            type: "pdf",
            sourceRef: input.pdf.name,
            status: "failed",
            parseOutput: { error: String(err) },
          },
        });
      }
    }
  }

  // ===== DOCX / MD / TXT =====
  for (const doc of input.docs ?? []) {
    try {
      if (doc.bytes && doc.bytes.byteLength > LIMITS.maxDocMB * 1024 * 1024) {
        warnings.push({ artifactRef: doc.name, message: `文档超过 ${LIMITS.maxDocMB}MB 上限，已跳过` });
        continue;
      }
      let parsed;
      if (doc.type === "docx" && doc.bytes) {
        parsed = await parseDocx(doc.bytes);
      } else {
        parsed = parsePlain(doc.name, doc.text ?? "");
      }
      const artifact = await prisma.inputArtifact.create({
        data: {
          projectId,
          type: doc.type,
          sourceRef: doc.name,
          status: "parsed",
          parseOutput: { pages: parsed.pages, pageCount: parsed.pageCount },
        },
      });
      created.push({ id: artifact.id, type: doc.type, sourceRef: doc.name, status: "parsed" });
    } catch (err) {
      warnings.push({
        artifactRef: doc.name,
        message: `文档解析失败：${err instanceof Error ? err.message : err}`,
      });
    }
  }

  // ===== 代码包 / 源码文件：只读静态解析，不安装依赖、不执行代码 =====
  for (const code of input.codeFiles ?? []) {
    if (code.bytes.byteLength > LIMITS.maxCodeMB * 1024 * 1024) {
      warnings.push({ artifactRef: code.name, message: `代码包超过 ${LIMITS.maxCodeMB}MB 上限，已跳过` });
      continue;
    }
    try {
      const parsed = parseCodePackage(code.name, code.bytes);
      await fs.mkdir(UPLOAD_DIR, { recursive: true });
      const safeExt = path.extname(code.name).toLowerCase().replace(/[^a-z0-9.]/g, "") || ".txt";
      const storagePath = path.join("data", "uploads", `${randomUUID()}${safeExt}`).replace(/\\/g, "/");
      await fs.writeFile(path.join(process.cwd(), storagePath), code.bytes);
      const artifact = await prisma.inputArtifact.create({
        data: {
          projectId,
          type: "code",
          sourceRef: code.name,
          storagePath,
          status: "parsed",
          parseOutput: parsed as never,
        },
      });
      created.push({ id: artifact.id, type: "code", sourceRef: code.name, status: "parsed" });
      parsed.warnings.forEach((message) => warnings.push({ artifactRef: code.name, message }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      warnings.push({ artifactRef: code.name, message: `代码解析失败：${message}` });
      await prisma.inputArtifact.create({
        data: { projectId, type: "code", sourceRef: code.name, status: "failed", parseOutput: { error: message } },
      });
    }
  }

  // ===== 重建证据包（含人工修正保留）=====
  await rebuildEvidencePackage(projectId);

  return { created, deduped, warnings };
}

/** 重建证据包：保留人工框选与已确认状态（PRD F2.3/F2.7 状态同步不回退） */
export async function rebuildEvidencePackage(projectId: string): Promise<void> {
  const artifacts = await prisma.inputArtifact.findMany({
    where: { projectId, status: "parsed" },
    orderBy: { createdAt: "asc" },
  });

  const materials: MaterialForPackage[] = artifacts.map((a) => {
    const po = (a.parseOutput ?? {}) as Record<string, unknown>;
    return {
      artifactId: a.id,
      type: a.type as MaterialForPackage["type"],
      sourceRef: a.sourceRef,
      storagePath: a.storagePath ?? undefined,
      title: typeof po.title === "string" ? po.title : undefined,
      text: typeof po.text === "string" ? po.text : undefined,
      pages: Array.isArray(po.pages) ? (po.pages as Array<{ index: number; text: string }>) : undefined,
      codeAnalysis: a.type === "code" && po.kind === "static_code_analysis" ? (po as unknown as MaterialForPackage["codeAnalysis"]) : undefined,
    };
  });

  const built = await buildEvidencePackage(materials);

  // 保留旧包中的人工图层与确认状态（人工新增/修正不被自动重建覆盖）
  const old = await prisma.evidencePackage.findUnique({ where: { projectId } });
  if (old) {
    const oldControls = (old.controls as ControlCandidate[]) ?? [];
    const keep = oldControls.filter(
      (c) => c.origin === "manual" || c.confirmation !== null || c.todoId !== null || c.ruleId !== null,
    );
    const keepIds = new Set(keep.map((c) => c.id));
    built.controls = [...built.controls.filter((c) => !keepIds.has(c.id)), ...keep];
  }

  await prisma.evidencePackage.upsert({
    where: { projectId },
    create: {
      projectId,
      pages: built.pages,
      controls: built.controls,
      userTasks: built.userTasks,
      pageRelations: built.pageRelations,
      docRules: built.docRules,
      sourceIndex: built.sourceIndex,
      coverage: {
        create: {
          covered: built.coverage.covered,
          uncovered: built.coverage.uncovered,
          controlMapping: built.coverage.controlMapping,
        },
      },
    },
    update: {
      pages: built.pages,
      controls: built.controls,
      userTasks: built.userTasks,
      pageRelations: built.pageRelations,
      docRules: built.docRules,
      sourceIndex: built.sourceIndex,
      updatedAt: new Date(),
      coverage: {
        upsert: {
          create: {
            covered: built.coverage.covered,
            uncovered: built.coverage.uncovered,
            controlMapping: built.coverage.controlMapping,
          },
          update: {
            covered: built.coverage.covered,
            uncovered: built.coverage.uncovered,
            controlMapping: built.coverage.controlMapping,
            updatedAt: new Date(),
          },
        },
      },
    },
  });
}

/** 删除项目时联动清理上传文件（PRD §7.2） */
export async function cleanupProjectFiles(projectId: string, knownPaths?: string[]): Promise<void> {
  const storagePaths = knownPaths ?? (await prisma.inputArtifact.findMany({ where: { projectId }, select: { storagePath: true } })).flatMap((artifact) => artifact.storagePath ? [artifact.storagePath] : []);
  for (const storagePath of storagePaths) {
    if (storagePath) {
      const abs = path.join(process.cwd(), storagePath);
      await fs.rm(abs, { force: true }).catch(() => undefined);
    }
  }
}
