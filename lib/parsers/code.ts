import path from "path";
import AdmZip from "adm-zip";

function envLimit(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const MAX_ARCHIVE_BYTES = envLimit("MAX_CODE_MB", 30) * 1024 * 1024;
const MAX_EXPANDED_BYTES = envLimit("MAX_CODE_EXPANDED_MB", 150) * 1024 * 1024;
const MAX_FILE_BYTES = envLimit("MAX_CODE_TEXT_FILE_MB", 2) * 1024 * 1024;
const MAX_FILES = envLimit("MAX_CODE_FILES_IN_ARCHIVE", 3000);
const MAX_DEPTH = envLimit("MAX_CODE_PATH_DEPTH", 20);
const MAX_COMPRESSION_RATIO = envLimit("MAX_CODE_COMPRESSION_RATIO", 120);

const TEXT_EXTENSIONS = new Set([
  ".js", ".jsx", ".ts", ".tsx", ".vue", ".svelte", ".html", ".css", ".scss", ".less",
  ".json", ".yaml", ".yml", ".md", ".txt", ".mjs", ".cjs",
]);
const IGNORED_PARTS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "coverage", "vendor", ".cache", ".turbo",
]);
const SENSITIVE_FILE = /(^|\/)(\.env(?:\.|$)|.*\.(?:pem|key|p12|pfx|crt)$|id_rsa|credentials?(?:\.|$)|secrets?(?:\.|$))/i;

export interface CodeEvidenceLocation {
  filePath: string;
  startLine: number;
  endLine: number;
  excerpt: string;
  symbol?: string;
}

export interface CodeRoute {
  id: string;
  path: string;
  title: string;
  filePath: string;
  framework: string;
  evidence: CodeEvidenceLocation;
}

export interface CodeInteraction {
  id: string;
  title: string;
  trigger: string;
  action: string;
  result: string;
  stateChange: string[];
  apiCalls: string[];
  /** 从事件处理函数继续追踪到的真实函数调用链。 */
  handlerChain: string[];
  /** 按界面、前端、接口、服务端和反馈整理的静态数据流。 */
  dataFlow: string[];
  confidence: "high" | "medium";
  evidence: CodeEvidenceLocation;
}

export type CodeUiElementKind = "button" | "link" | "input" | "form" | "card" | "select" | "textarea";

export interface CodeUiElement {
  id: string;
  kind: CodeUiElementKind;
  label: string;
  selector: string | null;
  target: string | null;
  interactive: boolean;
  evidence: CodeEvidenceLocation;
}

export interface CodeBackendEndpoint {
  id: string;
  method: string;
  path: string;
  effect: string;
  evidence: CodeEvidenceLocation;
}

export type CodeRiskSignalType = "notification" | "share" | "network" | "export" | "deletion" | "local_storage";

export interface CodeRiskSignal {
  id: string;
  type: CodeRiskSignalType;
  title: string;
  description: string;
  evidence: CodeEvidenceLocation;
}

export interface CodeFeature {
  id: string;
  title: string;
  summary: string;
  filePath: string;
  interactionIds: string[];
}

export interface CodeFlow {
  id: string;
  title: string;
  routePath: string | null;
  steps: Array<{
    interactionId: string;
    action: string;
    outcome: string;
    details: string[];
    evidence: CodeEvidenceLocation;
  }>;
}

export interface CodeProjectAnalysis {
  kind: "static_code_analysis";
  sourceName: string;
  framework: string[];
  languages: string[];
  fileCount: number;
  analyzedFileCount: number;
  ignoredFileCount: number;
  entryFiles: string[];
  routes: CodeRoute[];
  uiElements: CodeUiElement[];
  interactions: CodeInteraction[];
  backendEndpoints: CodeBackendEndpoint[];
  features: CodeFeature[];
  flows: CodeFlow[];
  riskSignals: CodeRiskSignal[];
  coverage: {
    discoveredElements: number;
    interactiveElements: number;
    tracedInteractions: number;
    unresolvedInteractiveElements: number;
  };
  warnings: string[];
}

interface TextFile {
  name: string;
  text: string;
}

function normalizeEntryName(raw: string): string {
  const slash = raw.replace(/\\/g, "/");
  if (slash.startsWith("/") || /^[a-z]:\//i.test(slash)) throw new Error(`代码包包含绝对路径：${raw}`);
  const normalized = path.posix.normalize(slash).replace(/^\.\//, "");
  if (!normalized || normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`代码包包含越界路径：${raw}`);
  }
  if (normalized.split("/").length > MAX_DEPTH) throw new Error(`代码包目录层级超过 ${MAX_DEPTH} 层：${raw}`);
  return normalized;
}

function shouldIgnore(name: string): boolean {
  const parts = name.toLowerCase().split("/");
  return parts.some((part) => IGNORED_PARTS.has(part)) || SENSITIVE_FILE.test(name);
}

function isSupportedText(name: string): boolean {
  const base = path.posix.basename(name).toLowerCase();
  return TEXT_EXTENSIONS.has(path.posix.extname(base)) || [
    "package.json", "pnpm-lock.yaml", "yarn.lock", "package-lock.json", "vite.config.ts", "vite.config.js",
    "next.config.ts", "next.config.js", "README", "Dockerfile",
  ].includes(base);
}

function decodeText(buffer: Buffer): string {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  let zeroes = 0;
  for (const byte of sample) if (byte === 0) zeroes += 1;
  if (sample.length && zeroes / sample.length > 0.02) return "";
  return buffer.toString("utf8").replace(/^\uFEFF/, "");
}

function languageOf(name: string): string | null {
  const ext = path.posix.extname(name).toLowerCase();
  return ({
    ".ts": "TypeScript", ".tsx": "TypeScript + React", ".js": "JavaScript", ".jsx": "JavaScript + React",
    ".vue": "Vue", ".svelte": "Svelte", ".html": "HTML", ".css": "CSS", ".scss": "SCSS", ".less": "Less",
    ".json": "JSON", ".md": "Markdown", ".yaml": "YAML", ".yml": "YAML",
  } as Record<string, string>)[ext] ?? null;
}

function makeExcerpt(lines: string[], lineIndex: number): CodeEvidenceLocation {
  const start = Math.max(0, lineIndex - 2);
  const end = Math.min(lines.length, lineIndex + 4);
  return {
    filePath: "",
    startLine: start + 1,
    endLine: end,
    excerpt: lines.slice(start, end).join("\n").slice(0, 1200),
  };
}

function humanize(value: string): string {
  const words = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  const dictionary: Record<string, string> = {
    form: "表单", submit: "提交", click: "点击", button: "按钮", clear: "清空", all: "全部",
    remove: "删除", delete: "删除", save: "保存", record: "记录", history: "历史", add: "添加",
    input: "输入", change: "修改", next: "下一步", back: "返回", open: "打开", close: "关闭",
    start: "开始", date: "日期", duration: "持续天数", cycle: "周期", length: "长度", hide: "隐藏",
    notification: "通知", detail: "详情", summary: "摘要", preview: "预览", export: "导出",
  };
  return words.split(/\s+/).map((word) => dictionary[word.toLowerCase()] ?? word).join("");
}

function htmlLabels(files: TextFile[]): Map<string, string> {
  const labels = new Map<string, string>();
  for (const file of files.filter((item) => /\.html?$/i.test(item.name))) {
    for (const match of file.text.matchAll(/<([a-z][\w-]*)\b[^>]*\bid=["']([^"']+)["'][^>]*>([\s\S]*?)<\/\1>/gi)) {
      const text = match[3].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const primaryAction = match[1].toLowerCase() === "form" ? match[3].match(/<button\b[^>]*type=["']submit["'][^>]*>([\s\S]*?)<\/button>/i)?.[1].replace(/<[^>]+>/g, " ").trim() : null;
      const label = primaryAction || text;
      if (label && label.length <= 80) labels.set(match[2], label);
    }
  }
  return labels;
}

function lineIndexAt(text: string, offset: number): number {
  return text.slice(0, offset).split(/\r?\n/).length - 1;
}

function plainText(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\{[^{}]*\}/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function attributeOf(attributes: string, name: string): string | null {
  const match = attributes.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match?.[1]?.trim() || null;
}

/**
 * 只记录源码中真实声明的界面元素。这里不根据产品领域补功能，也不执行代码。
 * HTML/JSX/Vue/Svelte 中能静态看到的按钮、链接、表单、输入项和卡片都会进入清单。
 */
function extractUiElements(files: TextFile[]): CodeUiElement[] {
  const elements: CodeUiElement[] = [];
  const seen = new Set<string>();
  const textById = htmlLabels(files);
  const visibleLabels = new Map<string, string>();
  for (const file of files) {
    for (const match of file.text.matchAll(/<label\b[^>]*\bfor=["']([^"']+)["'][^>]*>([\s\S]*?)<\/label>/gi)) {
      const label = plainText(match[2]);
      if (label) visibleLabels.set(`${file.name}:${match[1]}`, label);
    }
  }
  const push = (file: TextFile, offset: number, tag: string, attributes: string, body: string) => {
    const normalizedTag = tag.toLowerCase();
    const className = attributeOf(attributes, "class") ?? attributeOf(attributes, "className") ?? "";
    const kind: CodeUiElementKind | null = normalizedTag === "a" || normalizedTag === "link"
      ? "link"
      : normalizedTag === "button"
        ? "button"
        : normalizedTag === "input"
          ? "input"
          : normalizedTag === "select"
            ? "select"
            : normalizedTag === "textarea"
              ? "textarea"
              : normalizedTag === "form"
                ? "form"
                : normalizedTag === "card" || ((normalizedTag === "section" || normalizedTag === "article" || normalizedTag === "div") && /(?:^|\s)(?:card|.*-card)(?:\s|$)/i.test(className))
                  ? "card"
                  : null;
    if (!kind) return;
    const selector = attributeOf(attributes, "id") ?? attributeOf(attributes, "name") ?? attributeOf(attributes, "data-testid");
    const target = attributeOf(attributes, "href") ?? attributeOf(attributes, "to") ?? null;
    const labelledBy = attributeOf(attributes, "aria-labelledby");
    const label = (labelledBy ? textById.get(labelledBy) : null)
      || (selector ? visibleLabels.get(`${file.name}:${selector}`) : null)
      || (kind === "form" && selector ? textById.get(selector) : null)
      || plainText(body).slice(0, 100)
      || attributeOf(attributes, "aria-label")
      || attributeOf(attributes, "placeholder")
      || (selector ? humanize(selector) : null)
      || ({ button: "未命名按钮", link: "未命名链接", input: "输入项", select: "选择项", textarea: "文本输入", form: "表单", card: "内容卡片" } as Record<CodeUiElementKind, string>)[kind];
    const lineIndex = lineIndexAt(file.text, offset);
    const evidence = makeExcerpt(file.text.split(/\r?\n/), lineIndex);
    evidence.filePath = file.name;
    const signature = `${file.name}:${lineIndex}:${kind}:${selector ?? label}`;
    if (seen.has(signature) || elements.length >= 400) return;
    seen.add(signature);
    elements.push({
      id: `ui-${elements.length + 1}`,
      kind,
      label,
      selector,
      target,
      interactive: kind !== "card",
      evidence,
    });
  };

  for (const file of files) {
    if (!/\.(?:html?|[tj]sx?|vue|svelte)$/i.test(file.name)) continue;
    let match: RegExpExecArray | null;
    for (const tag of ["button", "a", "form", "select", "textarea", "section", "article", "div", "Card"]) {
      const paired = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}>`, "gi");
      while ((match = paired.exec(file.text))) push(file, match.index, tag, match[1], match[2]);
    }
    const inputs = /<input\b([^>]*)\/?\s*>/gi;
    while ((match = inputs.exec(file.text))) push(file, match.index, "input", match[1], "");
  }
  return elements;
}

function endpointEffect(windowText: string, method: string, endpointPath: string): string {
  if (method === "DELETE") {
    if (/\$\{|:\w+|\[\w+\]/.test(endpointPath)) return "删除指定记录，并返回删除后的数据";
    return "清空这组记录，并返回清空后的数据";
  }
  if (method === "POST") return "保存新记录，并返回保存后的数据";
  if (method === "PUT" || method === "PATCH") return "更新已有记录，并返回更新后的数据";
  if (method === "GET" && /export|download/i.test(endpointPath)) return "读取现有记录并生成下载文件";
  if (method === "GET") return "读取现有数据并返回页面";
  const effects: string[] = [];
  if (/\.filter\s*\(|delete|remove|clear|清空|删除/i.test(windowText)) effects.push("删除或清空服务端记录");
  if (/writeState|writeFile|\.create\s*\(|\.update\s*\(|\.upsert\s*\(|\.save\s*\(/i.test(windowText)) effects.push("写入或更新服务端数据");
  if (/readState|readFile|\.findMany\s*\(|\.findUnique\s*\(/i.test(windowText)) effects.push("读取服务端数据");
  if (/sendJson|\.json\s*\(|response\.end/i.test(windowText)) effects.push("返回处理结果");
  return [...new Set(effects)].join("，") || "处理请求并返回结果";
}

function extractBackendEndpoints(files: TextFile[]): CodeBackendEndpoint[] {
  const endpoints: CodeBackendEndpoint[] = [];
  const seen = new Set<string>();
  const add = (file: TextFile, lineIndex: number, method: string, endpointPath: string, windowText: string) => {
    const signature = `${method}:${endpointPath}:${file.name}`;
    if (seen.has(signature) || endpoints.length >= 160) return;
    seen.add(signature);
    const evidence = makeExcerpt(file.text.split(/\r?\n/), lineIndex);
    evidence.filePath = file.name;
    endpoints.push({ id: `endpoint-${endpoints.length + 1}`, method, path: endpointPath, effect: endpointEffect(windowText, method, endpointPath), evidence });
  };
  for (const file of files) {
    const lines = file.text.split(/\r?\n/);
    lines.forEach((line, index) => {
      const node = line.match(/url\.pathname\s*===\s*["']([^"']+)["'][\s\S]*?request\.method\s*===\s*["']([A-Z]+)["']/i);
      if (node) {
        const nextBranch = lines.findIndex((candidate, candidateIndex) => candidateIndex > index && /^\s*if\s*\(url\.pathname\b/.test(candidate));
        const end = nextBranch > index ? nextBranch : Math.min(lines.length, index + 24);
        add(file, index, node[2].toUpperCase(), node[1], lines.slice(index, end).join("\n"));
      }
      const express = line.match(/\b(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*["']([^"']+)["']/i);
      if (express) add(file, index, express[1].toUpperCase(), express[2], lines.slice(index, index + 24).join("\n"));
      const matchedRoute = line.match(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*url\.pathname\.match\(\/\^(.+)\$\/\)/);
      if (matchedRoute) {
        const branch = lines.slice(index + 1, index + 8).find((candidate) => new RegExp(`\\b${matchedRoute[1]}\\b.*request\\.method\\s*===\\s*["']([A-Z]+)["']`, "i").test(candidate));
        const method = branch?.match(/request\.method\s*===\s*["']([A-Z]+)["']/i)?.[1];
        if (method) {
          const endpointPath = matchedRoute[2]
            .replace(/\\\//g, "/")
            .replace(/\(\[\^\/]\+\)/g, ":id")
            .replace(/\\([.\-])/g, "$1");
          add(file, index, method.toUpperCase(), endpointPath, lines.slice(index, index + 18).join("\n"));
        }
      }
    });
    const route = routeFromFile(file.name);
    if (route && /\/app\/.*\/route\.(?:t|j)s$/i.test(`/${file.name}`)) {
      for (const match of file.text.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)) {
        const lineIndex = lineIndexAt(file.text, match.index ?? 0);
        add(file, lineIndex, match[1], route.path, lines.slice(lineIndex, lineIndex + 30).join("\n"));
      }
    }
  }
  return endpoints;
}

function selectorVariables(text: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const match of text.matchAll(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*document\.(?:querySelector|getElementById)\s*\(\s*["']#?([^"']+)["']\s*\)/g)) {
    result.set(match[1], match[2].replace(/^#/, ""));
  }
  return result;
}

function functionBodies(text: string): Map<string, string> {
  const result = new Map<string, string>();
  const patterns = [/function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g, /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{/g];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      const start = text.indexOf("{", match.index);
      let depth = 0;
      let end = start;
      for (; end < text.length; end += 1) {
        if (text[end] === "{") depth += 1;
        if (text[end] === "}") depth -= 1;
        if (depth === 0) break;
      }
      result.set(match[1], text.slice(start, Math.min(text.length, end + 1)));
    }
  }
  return result;
}

function detectFrameworks(files: TextFile[]): string[] {
  const packageFile = files.find((file) => path.posix.basename(file.name).toLowerCase() === "package.json");
  const haystack = `${packageFile?.text ?? ""}\n${files.map((file) => file.name).join("\n")}`.toLowerCase();
  const found: string[] = [];
  if (/"next"\s*:|next\.config|\/app\/.*page\.(?:t|j)sx?$/.test(haystack)) found.push("Next.js");
  if (/"react"\s*:|\.jsx$|\.tsx$/m.test(haystack)) found.push("React");
  if (/"vue"\s*:|\.vue$/m.test(haystack)) found.push("Vue");
  if (/"svelte"\s*:|\.svelte$/m.test(haystack)) found.push("Svelte");
  if (/"@angular\/core"\s*:/.test(haystack)) found.push("Angular");
  if (/"express"\s*:/.test(haystack)) found.push("Express");
  if (/"vite"\s*:|vite\.config/.test(haystack)) found.push("Vite");
  return found.length ? [...new Set(found)] : ["通用 Web"];
}

function routeFromFile(name: string): { path: string; framework: string } | null {
  const normalized = `/${name}`;
  const appMatch = normalized.match(/\/app\/(.*?)\/(?:page|route)\.(?:t|j)sx?$/i) ?? normalized.match(/\/app\/(?:page|route)\.(?:t|j)sx?$/i);
  if (appMatch) {
    const segment = appMatch[1] ?? "";
    const route = `/${segment}`.replace(/\/\([^/]+\)/g, "").replace(/\[\.\.\.(.+?)\]/g, ":$1*").replace(/\[(.+?)\]/g, ":$1").replace(/\/+/g, "/");
    return { path: route, framework: "Next.js App Router" };
  }
  const pagesMatch = normalized.match(/\/pages\/(.*?)\.(?:t|j)sx?$/i);
  if (pagesMatch && !pagesMatch[1].startsWith("_") && !pagesMatch[1].startsWith("api/")) {
    const route = `/${pagesMatch[1]}`.replace(/\/index$/i, "/").replace(/\[\.\.\.(.+?)\]/g, ":$1*").replace(/\[(.+?)\]/g, ":$1").replace(/\/+/g, "/");
    return { path: route, framework: "Next.js Pages Router" };
  }
  if (/\.html?$/i.test(name)) {
    const base = name.replace(/\.html?$/i, "").replace(/(^|\/)index$/i, "");
    return { path: `/${base}`.replace(/\/+/g, "/"), framework: "静态 HTML" };
  }
  return null;
}

function extractRoutes(files: TextFile[]): CodeRoute[] {
  const routes: CodeRoute[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const fileRoute = routeFromFile(file.name);
    if (fileRoute && !seen.has(`${fileRoute.path}:${file.name}`)) {
      const lines = file.text.split(/\r?\n/);
      const index = lines.findIndex((line) => /export\s+default|function|const\s+\w+/.test(line));
      const evidence = makeExcerpt(lines, Math.max(0, index));
      evidence.filePath = file.name;
      routes.push({ id: `route-${routes.length + 1}`, path: fileRoute.path, title: fileRoute.path === "/" ? "首页" : fileRoute.path, filePath: file.name, framework: fileRoute.framework, evidence });
      seen.add(`${fileRoute.path}:${file.name}`);
    }
    const lines = file.text.split(/\r?\n/);
    lines.forEach((line, index) => {
      const patterns = [/<Route\b[^>]*\bpath\s*=\s*["'{`]([^"'`}]+)["'}`]/g, /\bpath\s*:\s*["'`]([^"'`]+)["'`]/g];
      for (const regex of patterns) {
        let match: RegExpExecArray | null;
        while ((match = regex.exec(line))) {
          const key = `${match[1]}:${file.name}`;
          if (seen.has(key)) continue;
          const evidence = makeExcerpt(lines, index);
          evidence.filePath = file.name;
          routes.push({ id: `route-${routes.length + 1}`, path: match[1], title: match[1] === "/" ? "首页" : match[1], filePath: file.name, framework: file.name.endsWith(".vue") ? "Vue Router" : "前端路由", evidence });
          seen.add(key);
        }
      }
    });
  }
  return routes.slice(0, 100);
}

function nearestSymbol(lines: string[], index: number): string | undefined {
  for (let i = index; i >= Math.max(0, index - 15); i -= 1) {
    const match = lines[i].match(/(?:function\s+|const\s+|let\s+)([A-Za-z_$][\w$]*)/);
    if (match) return match[1];
  }
  return undefined;
}

function extractInteractions(files: TextFile[], uiElements: CodeUiElement[], backendEndpoints: CodeBackendEndpoint[]): CodeInteraction[] {
  const results: CodeInteraction[] = [];
  const seen = new Set<string>();
  const labels = htmlLabels(files);
  const globalBodies = new Map<string, string>();
  for (const file of files) for (const [name, body] of functionBodies(file.text)) if (!globalBodies.has(name)) globalBodies.set(name, body);
  const expandCallChain = (names: string[]): { names: string[]; text: string } => {
    const expanded = new Set(names);
    const chunks: string[] = [];
    for (const name of names) {
      const body = globalBodies.get(name);
      if (!body) continue;
      chunks.push(body);
      for (const call of body.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) if (globalBodies.has(call[1])) expanded.add(call[1]);
    }
    return { names: [...expanded], text: chunks.join("\n") };
  };
  const eventPattern = /\b(onClick|onSubmit|onChange|onInput|onBlur|onKeyDown|addEventListener\s*\(\s*["']([^"']+)|@click|@submit|useEffect\s*\(|router\.push\s*\(|navigate\s*\()/;
  for (const file of files) {
    if (!/\.(?:t|j)sx?$|\.vue$|\.svelte$|\.html$/i.test(file.name)) continue;
    const lines = file.text.split(/\r?\n/);
    const selectors = selectorVariables(file.text);
    const bodies = functionBodies(file.text);
    const reactSetters = new Set([...file.text.matchAll(/\[\s*[A-Za-z_$][\w$]*\s*,\s*(set[A-Z][A-Za-z0-9_$]*)\s*\]\s*=\s*(?:React\.)?useState/g)].map((item) => item[1]));
    const declaredFunctions = new Set([
      ...[...file.text.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((item) => item[1]),
      ...[...file.text.matchAll(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g)].map((item) => item[1]),
    ]);
    lines.forEach((line, index) => {
      const match = line.match(eventPattern);
      if (!match) return;
      const symbol = nearestSymbol(lines, index);
      const eventTarget = line.match(/\b([A-Za-z_$][\w$]*)\.addEventListener/)?.[1];
      const signature = `${file.name}:${eventTarget ?? symbol ?? index}:${match[1]}`;
      if (seen.has(signature) || results.length >= 160) return;
      seen.add(signature);
      let windowEnd = Math.min(lines.length, index + (match[1].startsWith("addEventListener") ? 32 : 12));
      if (match[1].startsWith("addEventListener")) {
        if (/=>.*\);\s*$/.test(line)) windowEnd = index + 1;
        else {
          const closeIndex = lines.findIndex((candidate, candidateIndex) => candidateIndex > index && candidateIndex < index + 32 && /^\s*}\);\s*$/.test(candidate));
          if (closeIndex > index) windowEnd = closeIndex + 1;
        }
      }
      const localWindowText = lines.slice(Math.max(0, index - 5), windowEnd).join("\n");
      const handlerWindowText = lines.slice(index, windowEnd).join("\n");
      const directHandlerCandidate = line.match(/addEventListener\s*\([^,]+,\s*([A-Za-z_$][\w$]*)/)?.[1]
        ?? line.match(/\bon(?:Click|Submit|Change|Input|Blur|KeyDown)\s*=\s*\{\s*([A-Za-z_$][\w$]*)\s*\}/)?.[1];
      const directHandler = directHandlerCandidate && !["async", "function"].includes(directHandlerCandidate) ? directHandlerCandidate : undefined;
      const calledFromWindow = [...new Set([...handlerWindowText.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)].map((item) => item[1]).filter((name) => declaredFunctions.has(name)))];
      const initialHandlers = [...new Set([directHandler, ...calledFromWindow].filter((name): name is string => Boolean(name)))];
      const expanded = expandCallChain(initialHandlers);
      const expandedBodies = `${initialHandlers.map((name) => bodies.get(name) ?? "").join("\n")}\n${expanded.text}`;
      const windowText = `${handlerWindowText}\n${expandedBodies}`;
      const apiSearchText = `${handlerWindowText}\n${initialHandlers.map((name) => bodies.get(name) ?? globalBodies.get(name) ?? "").join("\n")}`;
      const apiCalls = [
        ...[...apiSearchText.matchAll(/(?:fetch\s*\(\s*|axios\.(?:get|post|put|patch|delete)\s*\(\s*)["'`]([^"'`]+)["'`]/g)].map((item) => item[1]),
        ...[...apiSearchText.matchAll(/\b[A-Za-z_$][\w$]*\s*\(\s*["'`]((?:\/api\/)[^"'`]*)["'`]/g)].map((item) => item[1]),
      ];
      const stateChanges = [
        ...[...windowText.matchAll(/\b(set[A-Z][A-Za-z0-9_$]*)\s*\(/g)].map((item) => item[1]).filter((setter) => reactSetters.has(setter)),
        ...[...windowText.matchAll(/localStorage\.(?:setItem|removeItem)\s*\(\s*["'`]([^"'`]+)/g)].map((item) => `本地数据：${item[1]}`),
      ];
      const destination = windowText.match(/(?:router\.push|navigate)\s*\(\s*["'`]([^"'`]+)/)?.[1];
      const calledFunctions = [...new Set([...handlerWindowText.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)].map((item) => item[1]).filter((name) => declaredFunctions.has(name)))];
      const event = match[1].startsWith("addEventListener") ? match[2] : match[1].replace(/^on/, "").replace(/^@/, "");
      const labelMatch = line.match(/>([^<>]{1,36})</) ?? (eventTarget ? localWindowText.match(new RegExp(`${eventTarget}\\.(?:ariaLabel|title|textContent)\\s*=\\s*["']([^"']+)`)) : null);
      const selectorLabel = eventTarget ? labels.get(selectors.get(eventTarget) ?? "") : undefined;
      const functionLabel = directHandler ? humanize(directHandler) : calledFunctions.length === 1 ? humanize(calledFunctions[0]) : undefined;
      const declaredUi = eventTarget ? uiElements.find((item) => item.selector === selectors.get(eventTarget)) : undefined;
      const label = selectorLabel || declaredUi?.label || labelMatch?.[1]?.trim() || functionLabel;
      const readableSymbol = symbol ? humanize(symbol) : "页面交互";
      const method = windowText.match(/method\s*:\s*["'](GET|POST|PUT|PATCH|DELETE)["']/i)?.[1]?.toUpperCase();
      const relatedEndpoints = [...new Set(apiCalls)].map((apiPath) => backendEndpoints.find((endpoint) => {
        const staticPrefix = apiPath.split("${")[0];
        const methodMatches = !method || endpoint.method === method;
        return methodMatches && (endpoint.path === apiPath || endpoint.path.startsWith(staticPrefix) || staticPrefix.startsWith(endpoint.path));
      })).filter((item): item is CodeBackendEndpoint => Boolean(item));
      const browserOutcome = /navigator\.share|clipboard\.writeText/i.test(windowText)
        ? "页面：确认后打开系统分享面板，或复制摘要"
        : /Notification|requestPermission/i.test(windowText)
          ? "页面：请求通知权限，并按当前设置显示通知预览"
          : null;
      const dataFlow = [
        label ? `界面操作：选择“${label}”` : `界面操作：${event}`,
        initialHandlers.length || expanded.names.length ? `前端处理：${[...new Set([...initialHandlers, ...expanded.names])].join(" → ")}` : "前端处理：执行当前控件中的处理逻辑",
        ...[...new Set(apiCalls)].map((apiPath) => `发送请求：${method ?? relatedEndpoints.find((item) => item.path === apiPath)?.method ?? "请求"} ${apiPath}`),
        ...relatedEndpoints.map((endpoint) => `服务端处理：${endpoint.effect}（代码位置 ${endpoint.evidence.filePath}:${endpoint.evidence.startLine}）`),
        browserOutcome ?? (destination ? `页面结果：进入 ${destination}` : apiCalls.length ? "页面结果：使用接口返回的数据刷新页面" : stateChanges.length ? "页面结果：更新当前显示" : "页面结果：静态代码中未追踪到明确反馈"),
      ];
      const evidence = makeExcerpt(lines, index);
      evidence.filePath = file.name;
      evidence.symbol = symbol;
      results.push({
        id: `interaction-${results.length + 1}`,
        title: label || (eventTarget ? humanize(eventTarget) : readableSymbol),
        trigger: event.toLowerCase().includes("submit") ? "提交" : event.toLowerCase().includes("change") || event.toLowerCase().includes("input") ? "修改" : event === "useEffect" ? "页面加载" : "选择",
        action: apiCalls.length ? `${method ? `${method} ` : "请求 "}${[...new Set(apiCalls)].join("、")}` : destination ? `跳转到 ${destination}` : stateChanges.length ? `更新 ${stateChanges.join("、")}` : calledFunctions.length ? `调用 ${calledFunctions.join("、")}` : `执行 ${readableSymbol}`,
        result: browserOutcome?.replace(/^页面：/, "") ?? (destination ? `进入 ${destination}` : relatedEndpoints.length ? relatedEndpoints.map((item) => item.effect).join("；") : apiCalls.length ? "根据接口结果更新页面" : stateChanges.length || calledFunctions.some((name) => /save|delete|remove|clear|set|update/i.test(name)) ? "页面或本地记录随之更新" : "结果需结合相邻代码继续确认"),
        stateChange: [...new Set(stateChanges)],
        apiCalls: [...new Set(apiCalls)],
        handlerChain: [...new Set([...initialHandlers, ...expanded.names])],
        dataFlow,
        confidence: symbol || label || apiCalls.length || destination ? "high" : "medium",
        evidence,
      });
    });
  }
  // 普通链接不一定绑定事件，但 href 本身就是可验证的交互路径，不能因没有 onClick 而漏掉。
  for (const element of uiElements.filter((item) => item.kind === "link" && item.target)) {
    const target = element.target!;
    if (results.some((item) => item.title === element.label && item.evidence.filePath === element.evidence.filePath)) continue;
    const endpoint = backendEndpoints.find((item) => item.path === target);
    results.push({
      id: `interaction-${results.length + 1}`,
      title: element.label,
      trigger: "用户选择链接",
      action: endpoint ? `${endpoint.method} ${target}` : `打开 ${target}`,
      result: endpoint?.effect ?? `进入或下载 ${target}`,
      stateChange: [],
      apiCalls: target.startsWith("/api/") ? [target] : [],
      handlerChain: [],
      dataFlow: [`界面操作：选择“${element.label}”`, endpoint ? `发送请求：${endpoint.method} ${target}` : `页面结果：进入 ${target}`, ...(endpoint ? [`服务端处理：${endpoint.effect}`] : [])],
      confidence: "high",
      evidence: element.evidence,
    });
  }
  return results;
}

function buildFeatures(interactions: CodeInteraction[], uiElements: CodeUiElement[]): CodeFeature[] {
  const features: CodeFeature[] = [];
  for (const element of uiElements) {
    const interaction = interactions.find((item) => item.title === element.label)
      ?? interactions.find((item) => item.evidence.filePath === element.evidence.filePath && item.evidence.startLine >= element.evidence.startLine && item.evidence.startLine <= element.evidence.endLine + 4);
    features.push({
      id: `feature-${features.length + 1}`,
      title: element.label,
      summary: interaction
        ? `${interaction.trigger}后，${interaction.action}；${interaction.result}`
        : element.kind === "card"
          ? "源码中声明的内容区域，用于组织页面信息。"
          : "源码中存在这个界面入口，但没有发现独立事件；它可能由表单统一提交或由运行时配置处理。",
      filePath: element.evidence.filePath,
      interactionIds: interaction ? [interaction.id] : [],
    });
    if (features.length >= 120) break;
  }
  for (const interaction of interactions) {
    if (features.some((item) => item.interactionIds.includes(interaction.id))) continue;
    features.push({ id: `feature-${features.length + 1}`, title: interaction.title, summary: `${interaction.trigger}后，${interaction.action}；${interaction.result}`, filePath: interaction.evidence.filePath, interactionIds: [interaction.id] });
  }
  return features;
}

function buildFlows(interactions: CodeInteraction[], routes: CodeRoute[]): CodeFlow[] {
  const grouped = new Map<string, CodeInteraction[]>();
  for (const interaction of interactions) {
    const directRoute = routes.find((item) => item.filePath === interaction.evidence.filePath);
    const route = directRoute ?? (routes.length === 1 ? routes[0] : routes.find((item) => item.path === "/")) ?? null;
    const groupKey = route?.path ?? interaction.evidence.filePath;
    const list = grouped.get(groupKey) ?? [];
    list.push(interaction);
    grouped.set(groupKey, list);
  }
  return [...grouped.entries()].slice(0, 30).map(([groupKey, items], index) => {
    const route = routes.find((item) => item.path === groupKey) ?? routes.find((item) => item.filePath === items[0].evidence.filePath) ?? null;
    return {
      id: `flow-${index + 1}`,
      title: route ? `${route.title}的操作流程` : `${items[0].title}流程`,
      routePath: route?.path ?? null,
      steps: items.map((item) => ({ interactionId: item.id, action: `${item.trigger}“${item.title}”`, outcome: item.result, evidence: item.evidence, details: item.dataFlow })),
    };
  });
}

function detectRiskSignals(interactions: CodeInteraction[]): CodeRiskSignal[] {
  const signals: CodeRiskSignal[] = [];
  const definitions: Array<{ type: CodeRiskSignalType; pattern: RegExp; title: string; description: string }> = [
    { type: "notification", pattern: /Notification|requestPermission|通知|提醒/i, title: "通知可能展示健康信息", description: "代码包含浏览器通知或提醒逻辑，需要核对锁屏与通知中心实际展示内容。" },
    { type: "share", pattern: /navigator\.share|clipboard|分享|共享/i, title: "健康摘要可离开当前产品", description: "代码包含分享或复制能力，需要确认分享前告知、范围选择和用户确认。" },
    { type: "export", pattern: /Blob|download|导出/i, title: "健康记录支持导出", description: "代码包含数据导出路径，需要确认导出范围完整且文件交付方式清楚。" },
    { type: "deletion", pattern: /method\s*:\s*["']DELETE|deleteRecord|clearAll|删除|清空/i, title: "健康记录支持删除", description: "代码包含删除或清空路径，需要确认后端数据、备份与派生数据是否同步处理。" },
    { type: "local_storage", pattern: /localStorage\.(?:setItem|removeItem)|本地数据/i, title: "健康记录保存在浏览器", description: "代码把记录写入浏览器存储，需要确认共享设备场景和清除入口。" },
    { type: "network", pattern: /fetch\s*\(|axios\.|请求 \/api|\/api\//i, title: "健康记录会发送到服务端", description: "代码包含服务端接口调用，需要确认处理目的、保存期限与删除闭环。" },
  ];
  for (const interaction of interactions) {
    const haystack = `${interaction.title}\n${interaction.action}\n${interaction.result}\n${interaction.stateChange.join("\n")}\n${interaction.evidence.excerpt}`;
    for (const definition of definitions) {
      if (!definition.pattern.test(haystack) || signals.some((item) => item.type === definition.type && item.evidence.filePath === interaction.evidence.filePath)) continue;
      signals.push({ id: `signal-${signals.length + 1}`, type: definition.type, title: definition.title, description: definition.description, evidence: interaction.evidence });
    }
  }
  return signals;
}

function analyzeFiles(sourceName: string, files: TextFile[], totalFiles: number, ignoredFileCount: number, warnings: string[]): CodeProjectAnalysis {
  const languages = [...new Set(files.map((file) => languageOf(file.name)).filter((item): item is string => Boolean(item)))];
  const entryFiles = files.map((file) => file.name).filter((name) => /(^|\/)(package\.json|index\.(?:html|tsx?|jsx?)|main\.(?:tsx?|jsx?)|app\.(?:tsx?|jsx?|vue|svelte)|page\.(?:tsx?|jsx?))$/i.test(name)).slice(0, 30);
  const routes = extractRoutes(files);
  const uiElements = extractUiElements(files);
  const backendEndpoints = extractBackendEndpoints(files);
  const interactions = extractInteractions(files, uiElements, backendEndpoints);
  const interactiveElements = uiElements.filter((item) => item.interactive);
  const tracedLabels = new Set(interactions.map((item) => item.title));
  const unresolvedInteractiveElements = interactiveElements.filter((item) => !tracedLabels.has(item.label) && !["input", "select", "textarea"].includes(item.kind)).length;
  return {
    kind: "static_code_analysis",
    sourceName,
    framework: detectFrameworks(files),
    languages,
    fileCount: totalFiles,
    analyzedFileCount: files.length,
    ignoredFileCount,
    entryFiles,
    routes,
    uiElements,
    interactions,
    backendEndpoints,
    features: buildFeatures(interactions, uiElements),
    flows: buildFlows(interactions, routes),
    riskSignals: detectRiskSignals(interactions),
    coverage: {
      discoveredElements: uiElements.length,
      interactiveElements: interactiveElements.length,
      tracedInteractions: interactions.length,
      unresolvedInteractiveElements,
    },
    warnings,
  };
}

export function parseCodePackage(name: string, bytes: Buffer): CodeProjectAnalysis {
  if (bytes.byteLength > MAX_ARCHIVE_BYTES) throw new Error(`代码包超过 ${MAX_ARCHIVE_BYTES / 1024 / 1024}MB 上限`);
  const lowerName = name.toLowerCase();
  if (!lowerName.endsWith(".zip")) {
    const safeName = normalizeEntryName(name);
    if (!isSupportedText(name)) throw new Error("暂不支持这种代码文件；请上传 ZIP 或常见 Web 源码文件");
    if (bytes.byteLength > MAX_FILE_BYTES) throw new Error(`单个源码文件超过 ${MAX_FILE_BYTES / 1024 / 1024}MB 上限`);
    const text = decodeText(bytes);
    if (!text) throw new Error("文件不是可读取的文本源码");
    return analyzeFiles(name, [{ name: safeName, text }], 1, 0, []);
  }

  let zip: AdmZip;
  try {
    zip = new AdmZip(bytes);
  } catch {
    throw new Error("ZIP 无法读取或文件已损坏");
  }
  const entries = zip.getEntries();
  if (entries.length > MAX_FILES) throw new Error(`代码包文件数超过 ${MAX_FILES} 个上限`);
  const files: TextFile[] = [];
  const warnings: string[] = [];
  let ignored = 0;
  let expandedBytes = 0;
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const entryName = normalizeEntryName(entry.entryName);
    const unixMode = ((entry.header.attr ?? 0) >>> 16) & 0o170000;
    if (unixMode === 0o120000) {
      ignored += 1;
      warnings.push(`已忽略符号链接：${entryName}`);
      continue;
    }
    const size = entry.header.size ?? 0;
    const compressedSize = entry.header.compressedSize ?? 0;
    expandedBytes += size;
    if (expandedBytes > MAX_EXPANDED_BYTES) throw new Error(`代码包解压后超过 ${MAX_EXPANDED_BYTES / 1024 / 1024}MB 安全上限`);
    if (compressedSize > 0 && size / compressedSize > MAX_COMPRESSION_RATIO) throw new Error(`文件压缩比异常：${entryName}`);
    if (shouldIgnore(entryName) || !isSupportedText(entryName)) {
      ignored += 1;
      continue;
    }
    if (size > MAX_FILE_BYTES) {
      ignored += 1;
      warnings.push(`已忽略超过 ${MAX_FILE_BYTES / 1024 / 1024}MB 的文本文件：${entryName}`);
      continue;
    }
    const text = decodeText(entry.getData());
    if (!text) {
      ignored += 1;
      continue;
    }
    files.push({ name: entryName, text });
  }
  if (!files.length) throw new Error("代码包中没有找到可读取的 Web 源码文件");
  return analyzeFiles(name, files, entries.filter((entry) => !entry.isDirectory).length, ignored, warnings);
}

export const CODE_LIMITS = {
  maxArchiveMB: MAX_ARCHIVE_BYTES / 1024 / 1024,
  maxExpandedMB: MAX_EXPANDED_BYTES / 1024 / 1024,
  maxFiles: MAX_FILES,
  maxFileMB: MAX_FILE_BYTES / 1024 / 1024,
} as const;
