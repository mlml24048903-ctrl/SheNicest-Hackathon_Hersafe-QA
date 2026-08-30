import { readFileSync } from "node:fs";
import path from "node:path";
import { parseCodePackage } from "../lib/parsers/code";

const input = process.argv[2];
if (!input) throw new Error("用法：npx tsx scripts/inspect-code-package.ts <代码包路径>");

const absolutePath = path.resolve(input);
const analysis = parseCodePackage(path.basename(absolutePath), readFileSync(absolutePath));

console.log(JSON.stringify({
  sourceName: analysis.sourceName,
  coverage: analysis.coverage,
  uiElements: analysis.uiElements.map((item) => ({ kind: item.kind, label: item.label, file: `${item.evidence.filePath}:${item.evidence.startLine}` })),
  interactions: analysis.interactions.map((item) => ({ title: item.title, apiCalls: item.apiCalls, dataFlow: item.dataFlow, file: `${item.evidence.filePath}:${item.evidence.startLine}` })),
  backendEndpoints: analysis.backendEndpoints.map((item) => ({ method: item.method, path: item.path, effect: item.effect, file: `${item.evidence.filePath}:${item.evidence.startLine}` })),
}, null, 2));
