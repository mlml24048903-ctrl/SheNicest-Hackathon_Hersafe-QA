// 服务端原生依赖健康检查（回归：newidea.md 两个 Bug 的环境根因守护）
// Bug① 截图上传失败：sharp 原生模块不可用 → saveAndParseImage 全链路崩
// Bug② 网站抓取失败：playwright Chromium 浏览器二进制缺失 → chromium.launch() 报“缺少依赖”
// 这两项在任何机器上安装依赖后必须可用，否则上传/抓取功能整体不可用（非代码层缺陷）。
import { describe, expect, it } from "vitest";
import { existsSync } from "fs";
import path from "path";
import os from "os";

describe("截图上传链路：sharp 原生依赖可用", () => {
  it("sharp 可加载并完成 压缩→JPEG 编码 全流程", async () => {
    const { default: sharp } = await import("sharp");
    // 1×1 红色 PNG（最小合法输入）
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const out = await sharp(png).flatten({ background: "#ffffff" }).jpeg({ quality: 82 }).toBuffer();
    expect(out.length).toBeGreaterThan(0);
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("jpeg");
  });
});

describe("网站抓取链路：playwright Chromium 可用", () => {
  it("Chromium 浏览器二进制已安装（缺失时执行：pnpm exec playwright install chromium）", async () => {
    const { chromium } = await import("playwright");
    const exe = chromium.executablePath();
    // executablePath() 在浏览器未安装时仍返回预期路径，必须实际检查文件存在
    const ok = existsSync(exe);
    if (!ok) {
      throw new Error(
        `Chromium 未安装（预期路径 ${exe}）：请执行 pnpm exec playwright install chromium 后重试。` +
          `${os.EOL}根因：pnpm 11 不再读取 package.json 的 pnpm.onlyBuiltDependencies，` +
          `playwright 安装脚本被拦截，浏览器不会随 pnpm install 自动下载。`,
      );
    }
    expect(path.isAbsolute(exe)).toBe(true);
  });
});
