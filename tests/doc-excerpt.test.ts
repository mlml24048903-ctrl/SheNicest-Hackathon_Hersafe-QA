// buildDocExcerpt 单测：对话附件的文档摘录拼接（预算截断 / 多文件分摊 / 边界兜底）
import { describe, expect, it } from "vitest";
import { buildDocExcerpt } from "@/lib/parsers/docs";

const entry = (name: string, texts: string[], pageCount = texts.length) => ({
  name,
  pageCount,
  pages: texts.map((text, i) => ({ index: i + 1, text })),
});

describe("buildDocExcerpt", () => {
  it("空入参返回空串", () => {
    expect(buildDocExcerpt([])).toBe("");
  });

  it("短文档全文收录并标注字数", () => {
    const out = buildDocExcerpt([entry("反馈模板.docx", ["注销流程说明"])]);
    expect(out).toContain("【用户本轮补充材料摘录】");
    expect(out).toContain("《反馈模板.docx》（共 1 页，全文 6 字）：");
    expect(out).toContain("注销流程说明");
  });

  it("超配额文档截断并明确标注", () => {
    const long = "证".repeat(3000);
    const out = buildDocExcerpt([entry("隐私政策.pdf", [long], 8)]);
    expect(out).toContain("《隐私政策.pdf》（共 8 页，节选）：");
    expect(out).toContain("……（已截断）");
    // 单文件配额 2000：正文 + 截断标注，不吞整份
    expect(out.length).toBeGreaterThan(2000);
    expect(out.length).toBeLessThan(2200);
  });

  it("多文件按顺序分摊预算，恰好等于配额走全文分支", () => {
    const a = "甲".repeat(2000);
    const b = "乙".repeat(1500);
    const c = "丙".repeat(100);
    const out = buildDocExcerpt([entry("a.pdf", [a]), entry("b.md", [b]), entry("c.txt", [c])]);
    // a 恰好等于单文件配额 2000 → 全文收录（<= 判定），剩 2000：b 全文 1500，剩 500 仍够 c 的 100 字
    expect(out).toContain("《a.pdf》（共 1 页，全文 2000 字）：");
    expect(out).toContain("《b.md》（共 1 页，全文 1500 字）：");
    expect(out).toContain("丙");
  });

  it("预算耗尽时后续文件只列名不列文", () => {
    const a = "甲".repeat(2000);
    const b = "乙".repeat(2000);
    const c = "丙".repeat(2000);
    const out = buildDocExcerpt([entry("a.pdf", [a]), entry("b.pdf", [b]), entry("c.pdf", [c])]);
    expect(out).toContain("《a.pdf》（共 1 页，全文 2000 字）：");
    expect(out).toContain("《b.pdf》（共 1 页，全文 2000 字）：");
    expect(out).toContain("《c.pdf》（共 1 页，因篇幅限制未摘录）");
    expect(out).not.toContain("丙丙");
  });

  it("空文本页文档标注未提取到文本", () => {
    const out = buildDocExcerpt([entry("扫描件.pdf", ["", "   "], 2)]);
    expect(out).toContain("《扫描件.pdf》（共 2 页，未提取到文本）");
  });
});
