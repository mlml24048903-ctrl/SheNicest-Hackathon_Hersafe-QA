// 文档解析：PDF 拆页 / DOCX / MD / TXT（PRD F1.4，确定性程序，不调用 AI）
import mammoth from "mammoth";
import { LIMITS } from "@/lib/config";

export interface ParsedDoc {
  /** 拆页结果（PDF 按页，DOCX/MD/TXT 整体为一"页"） */
  pages: Array<{ index: number; text: string }>;
  pageCount: number;
  /** 解析告警（如超页数截断），用于明确提示而非静默失败 */
  warnings: string[];
}

/** PDF 拆页 + 文本提取（pdfjs-dist legacy 构建，Node 环境可用） */
export async function parsePdf(bytes: Buffer): Promise<ParsedDoc> {
  const warnings: string[] = [];
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false }).promise;
  const total = doc.numPages;
  const limit = Math.min(total, LIMITS.maxPdfPages);
  if (total > limit) {
    warnings.push(`PDF 共 ${total} 页，超过上限 ${LIMITS.maxPdfPages} 页，仅解析前 ${limit} 页`);
  }
  const pages: Array<{ index: number; text: string }> = [];
  for (let i = 1; i <= limit; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((it: { str?: string }) => it.str ?? "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push({ index: i, text });
  }
  return { pages, pageCount: total, warnings };
}

/** DOCX → 纯文本（mammoth） */
export async function parseDocx(bytes: Buffer): Promise<ParsedDoc> {
  const { value } = await mammoth.extractRawText({ buffer: bytes });
  const text = value.replace(/\s+\n/g, "\n").trim();
  return {
    pages: [{ index: 1, text }],
    pageCount: 1,
    warnings: [],
  };
}

/** Markdown / TXT 原生读取 */
export function parsePlain(_fileName: string, content: string): ParsedDoc {
  const text = content.replace(/\r\n/g, "\n").trim();
  return {
    pages: [{ index: 1, text }],
    pageCount: 1,
    warnings: [],
  };
}

/**
 * 从文档文本确定性提取“文档规则”条目（安全相关关键句，供证据包 docRules 使用）。
 * 纯关键词扫描，不调用 AI。
 */
const RULE_KEYWORDS = [
  "隐私",
  "通知",
  "位置",
  "定位",
  "行程",
  "拉黑",
  "屏蔽",
  "举报",
  "骚扰",
  "注销",
  "删除",
  "设备",
  "登录",
  "密码",
  "授权",
  "分享",
  "可见",
  "陌生人",
  "导出",
  "证据",
];

export function extractDocRules(pages: Array<{ index: number; text: string }>): Array<{
  docRuleId: string;
  keyword: string;
  snippet: string;
  page: number;
}> {
  const rules: Array<{ docRuleId: string; keyword: string; snippet: string; page: number }> = [];
  let id = 0;
  for (const page of pages) {
    // 按句切分（中文句号/问号/感叹号/分号）
    const sentences = page.text
      .split(/[。！？；!?\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const sentence of sentences) {
      const hit = RULE_KEYWORDS.find((k) => sentence.includes(k));
      if (hit && sentence.length >= 6 && sentence.length <= 200) {
        rules.push({
          docRuleId: `DR-${String(++id).padStart(2, "0")}`,
          keyword: hit,
          snippet: sentence,
          page: page.index,
        });
        if (rules.length >= 40) return rules; // 上限保护
      }
    }
  }
  return rules;
}

/** 将 pdf/doc 的拆页文本拼为对话用摘录（确定性程序，不调用 AI）。
 *  总量预算默认 4000 字（todoContext 注入额度内），逐文件配额 min(2000, 剩余预算)，
 *  截断明确标注；预算耗尽后剩余文件只列名不列文。纯文本函数，可单测。 */
export function buildDocExcerpt(
  entries: Array<{ name: string; pageCount: number; pages: Array<{ index: number; text: string }> }>,
  budget = 4000,
): string {
  if (!entries.length) return "";
  const lines: string[] = ["【用户本轮补充材料摘录】"];
  let remaining = budget;
  for (const entry of entries) {
    const full = entry.pages
      .map((p) => p.text.trim())
      .filter(Boolean)
      .join("\n");
    if (!full) {
      lines.push(`《${entry.name}》（共 ${entry.pageCount} 页，未提取到文本）`);
      continue;
    }
    const quota = Math.min(2000, remaining);
    if (quota < 100) {
      // 预算耗尽：只列名，保证 AI 至少知道有哪些材料
      lines.push(`《${entry.name}》（共 ${entry.pageCount} 页，因篇幅限制未摘录）`);
      continue;
    }
    if (full.length <= quota) {
      lines.push(`《${entry.name}》（共 ${entry.pageCount} 页，全文 ${full.length} 字）：\n${full}`);
      remaining -= full.length;
    } else {
      lines.push(
        `《${entry.name}》（共 ${entry.pageCount} 页，节选）：\n${full.slice(0, quota)}……（已截断）`,
      );
      remaining -= quota;
    }
  }
  return lines.join("\n");
}
