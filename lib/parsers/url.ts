// URL 解析：服务端 Playwright 安全截图与文本提取（PRD F1.4 / ROADMAP T1.3）
// 安全约束（PRD §7.2）：只读取页面，不执行任何点击/支付/发布/举报等高影响动作。
// v0 范围：公开 URL 的单页读取（自动深度爬取延后，PRD §8.2 范围说明）。

import { promises as fs } from "fs";
import path from "path";
import { UPLOAD_DIR } from "@/lib/config";

export interface ParsedUrl {
  storagePath: string; // 截图落盘路径
  title: string;
  text: string; // 页面可见文本（截断 8000 字符）
  url: string;
}

export class UrlParseError extends Error {
  constructor(
    public readonly code: "INVALID_URL" | "BROWSER_UNAVAILABLE" | "NAVIGATION_TIMEOUT" | "NAVIGATION_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "UrlParseError";
  }
}

/** 校验公开 URL（仅 http/https，拒绝内网地址的基本防护） */
export function validatePublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UrlParseError("INVALID_URL", "URL 格式无效");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UrlParseError("INVALID_URL", "仅支持 http/https 协议");
  }
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)
  ) {
    throw new UrlParseError("INVALID_URL", "拒绝访问内网/本机地址（安全限制）");
  }
  return url;
}

/** Playwright 截图 + 文本提取（动态加载，浏览器未安装时明确报错） */
export async function parseUrl(rawUrl: string): Promise<ParsedUrl> {
  const url = validatePublicUrl(rawUrl);

  let chromium: import("playwright").BrowserType<import("playwright").Browser>;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw new UrlParseError("BROWSER_UNAVAILABLE", "Playwright 未安装");
  }

  let browser: import("playwright").Browser;
  try {
    // 代理显式化：PROXY_URL 环境变量优先；否则强制直连 direct://，
    // 阻断继承系统注册表残留代理（死代理会导致 ERR_PROXY_CONNECTION_FAILED，实测 direct:// 可解）
    browser = process.env.PROXY_URL
      ? await chromium.launch({ headless: true, proxy: { server: process.env.PROXY_URL } })
      : await chromium.launch({ headless: true, args: ["--proxy-server=direct://"] });
  } catch {
    throw new UrlParseError(
      "BROWSER_UNAVAILABLE",
      "Chromium 未安装，请先执行 pnpm exec playwright install chromium（或 npx playwright install chromium）",
    );
  }

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    // 安全探索：只读取，不点击、不输入、不提交
    await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(1200); // 等待首屏渲染稳定

    const title = (await page.title()).trim() || url.hostname;
    const text = (await page.evaluate(() => document.body?.innerText ?? ""))
      .replace(/\s+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, 8000);

    const outName = `url-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const outPath = path.join(UPLOAD_DIR, outName);
    await page.screenshot({ path: outPath, fullPage: false, type: "jpeg", quality: 85 });

    return {
      storagePath: path.relative(process.cwd(), outPath).replace(/\\/g, "/"),
      title,
      text,
      url: url.toString(),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Timeout") || msg.includes("timeout")) {
      throw new UrlParseError("NAVIGATION_TIMEOUT", `页面加载超时：${msg}`);
    }
    throw new UrlParseError("NAVIGATION_FAILED", `页面加载失败：${msg}`);
  } finally {
    await browser.close().catch(() => undefined);
  }
}
