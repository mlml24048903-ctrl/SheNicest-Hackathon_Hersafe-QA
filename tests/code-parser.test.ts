import AdmZip from "adm-zip";
import { describe, expect, it } from "vitest";
import { parseCodePackage } from "@/lib/parsers/code";

function zipOf(files: Record<string, string>): Buffer {
  const zip = new AdmZip();
  Object.entries(files).forEach(([name, text]) => zip.addFile(name, Buffer.from(text)));
  return zip.toBuffer();
}

describe("代码包静态解析", () => {
  it("从真实源码识别框架、路由和交互证据", () => {
    const result = parseCodePackage("demo.zip", zipOf({
      "package.json": JSON.stringify({ dependencies: { react: "19", next: "15" } }),
      "app/page.tsx": `export default function Home() {
  const saveRecord = () => { localStorage.setItem("period-record", "2026-08-01"); };
  return <button onClick={saveRecord}>保存经期记录</button>;
}`,
      "app/history/page.tsx": `export default function History(){ return <main>历史记录</main> }`,
    }));
    expect(result.framework).toContain("Next.js");
    expect(result.routes.map((route) => route.path)).toEqual(expect.arrayContaining(["/", "/history"]));
    expect(result.interactions.some((item) => item.evidence.filePath === "app/page.tsx")).toBe(true);
    expect(result.interactions.some((item) => item.stateChange.some((state) => state.includes("period-record")))).toBe(true);
    expect(result.features.length).toBeGreaterThan(0);
    expect(result.flows.some((flow) => flow.steps.length > 0)).toBe(true);
    expect(result.riskSignals.some((signal) => signal.type === "local_storage")).toBe(true);
  });

  it("忽略依赖目录和敏感配置", () => {
    const result = parseCodePackage("demo.zip", zipOf({
      "src/main.js": `document.querySelector("button").addEventListener("click", () => fetch("/api/save"));`,
      "node_modules/pkg/index.js": "throw new Error('不应读取')",
      ".env": "SECRET=do-not-read",
    }));
    expect(result.analyzedFileCount).toBe(1);
    expect(result.ignoredFileCount).toBe(2);
    expect(result.interactions[0].apiCalls).toContain("/api/save");
  });

  it("拒绝越界路径", () => {
    expect(() => parseCodePackage("../escape.js", Buffer.from("alert(1)"))).toThrow(/越界路径/);
  });

  it("单个 HTML 文件可作为真实页面证据", () => {
    const result = parseCodePackage("index.html", Buffer.from('<button id="save">保存</button>'));
    expect(result.routes[0]).toMatchObject({ path: "/", framework: "静态 HTML" });
  });

  it("用页面文字命名操作，并识别通知、分享与服务端数据路径", () => {
    const result = parseCodePackage("fullstack.zip", zipOf({
      "index.html": `<button id="share-summary">分享周期摘要</button><button id="preview-notification">预览浏览器通知</button>`,
      "app.js": `const shareButton = document.querySelector("#share-summary");
const notificationButton = document.querySelector("#preview-notification");
async function shareSummary(){ const state = await fetch("/api/records"); await navigator.share({ text: await state.text() }); }
function showNotice(){ new Notification("经期提醒"); }
shareButton.addEventListener("click", shareSummary);
notificationButton.addEventListener("click", showNotice);`,
    }));
    expect(result.interactions.map((item) => item.title)).toEqual(expect.arrayContaining(["分享周期摘要", "预览浏览器通知"]));
    expect(result.riskSignals.map((item) => item.type)).toEqual(expect.arrayContaining(["share", "notification", "network"]));
  });

  it("完整列出页面入口，并沿真实调用链追踪到服务端处理", () => {
    const result = parseCodePackage("period-tool.zip", zipOf({
      "index.html": `<section class="summary-card"><p>下次预计开始</p></section>
<form id="period-form"><input id="start-date" type="date"><input id="duration" type="number"><input id="cycle-length" type="number"><button type="submit">保存这次记录</button></form>
<button id="share-summary">分享周期摘要</button><a href="/api/export">导出全部记录</a>`,
      "app.js": `const form=document.querySelector("#period-form"); const share=document.querySelector("#share-summary");
async function request(path, options){ return fetch(path, options); }
form.addEventListener("submit", async () => { const result=await request("/api/records", {method:"POST"}); render(result); });
share.addEventListener("click", async () => { await navigator.share({text:"周期摘要"}); });`,
      "server/index.js": `async function handle(request,response,url){
if (url.pathname === "/api/records" && request.method === "POST") { await writeState(await readJson(request)); return sendJson(response,201,{}); }
if (url.pathname === "/api/export" && request.method === "GET") { return sendJson(response,200,await readState()); }
}`,
    }));
    expect(result.uiElements.map((item) => item.label)).toEqual(expect.arrayContaining(["下次预计开始", "保存这次记录", "开始日期", "持续天数", "周期长度", "分享周期摘要", "导出全部记录"]));
    expect(result.backendEndpoints).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: "POST", path: "/api/records" }),
      expect.objectContaining({ method: "GET", path: "/api/export" }),
    ]));
    const save = result.interactions.find((item) => item.title === "保存这次记录");
    expect(save?.apiCalls).toContain("/api/records");
    expect(save?.handlerChain).toContain("request");
    expect(save?.dataFlow.some((step) => step.includes("服务端"))).toBe(true);
    expect(result.coverage.discoveredElements).toBeGreaterThanOrEqual(7);
  });

  it("忽略 ZIP 中的符号链接", () => {
    const zip = new AdmZip();
    zip.addFile("src/app.js", Buffer.from('document.addEventListener("click", () => {})'));
    zip.addFile("src/link.js", Buffer.from("../outside.js"));
    const link = zip.getEntry("src/link.js");
    if (!link) throw new Error("测试 ZIP 建立失败");
    link.header.attr = (0o120777 << 16) >>> 0;
    const result = parseCodePackage("links.zip", zip.toBuffer());
    expect(result.warnings.some((warning) => warning.includes("符号链接"))).toBe(true);
  });

  it("拒绝异常压缩比文件", () => {
    const zip = new AdmZip();
    zip.addFile("src/repeated.js", Buffer.from("a".repeat(400_000)));
    expect(() => parseCodePackage("bomb.zip", zip.toBuffer())).toThrow(/压缩比异常/);
  });

  it("拒绝文件数量超限的代码包", () => {
    const zip = new AdmZip();
    for (let index = 0; index < 3001; index += 1) zip.addFile(`src/f${index}.js`, Buffer.from("export default 1"));
    expect(() => parseCodePackage("many.zip", zip.toBuffer())).toThrow(/文件数超过/);
  });

  it("中型项目可在限额内形成稳定索引", () => {
    const files: Record<string, string> = { "index.html": "<main>中型项目</main>" };
    for (let index = 0; index < 120; index += 1) files[`src/feature-${index}.js`] = `export function feature${index}(){ return ${index}; }`;
    const result = parseCodePackage("medium.zip", zipOf(files));
    expect(result.analyzedFileCount).toBe(121);
    expect(result.routes[0].path).toBe("/");
  });
});
