// 报告导出：Markdown（恒可用）/ PDF（Playwright 打印，浏览器缺失时明确报错，PRD F4.6）
import { NextRequest, NextResponse } from "next/server";
import { buildReport, renderReportMarkdown } from "@/lib/report";

export const runtime = "nodejs";
export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const format = req.nextUrl.searchParams.get("format") ?? "md";

  const report = await buildReport(id);
  const md = renderReportMarkdown(report);

  if (format === "md") {
    return new NextResponse(md, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="hersafe-report-${id.slice(-8)}.md"`,
      },
    });
  }

  if (format === "pdf") {
    // 简易 HTML 包裹后经 Playwright 打印（确定性排版，不调用 AI）
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><style>
      body{font-family:"PingFang SC","Microsoft YaHei",sans-serif;margin:32px;line-height:1.7;color:#171717}
      pre{white-space:pre-wrap;word-wrap:break-word;font-family:inherit;font-size:13px}
    </style></head><body><pre>${esc(md)}</pre></body></html>`;
    try {
      const { chromium } = await import("playwright");
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "domcontentloaded" });
        const pdf = await page.pdf({ format: "A4", printBackground: true });
        return new NextResponse(new Uint8Array(pdf), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="hersafe-report-${id.slice(-8)}.pdf"`,
          },
        });
      } finally {
        await browser.close();
      }
    } catch {
      return NextResponse.json(
        {
          error: "PDF 导出需要 Chromium：请先执行 npx playwright install chromium，或改用 Markdown 导出",
        },
        { status: 501 },
      );
    }
  }

  return NextResponse.json({ error: "不支持的格式（md | pdf）" }, { status: 400 });
}
