// AI 网关 —— 模型调用唯一出口，网关三函数（PRD §5.2 / tace.md §6）
// analyzeProject / continueTodo / verifyHighRisk
// 横切能力：缓存 → 预算 → 供应商调用（重试）→ zod 校验（含修复重试）→ 记录 ModelInvocation
// 新增（v2）：规则包注入与缓存隔离、continueTodo 注入单条规则全量 JSON。
// 用户项目必须配置 STEPFUN_API_KEY；确定性 Mock 仅在 NODE_ENV=test 时启用。

import { z } from "zod";
import { stepfunConfig } from "@/lib/config";
import {
  InitialAnalysisSchema,
  ContinueTodoOutputSchema,
  VerifyHighRiskOutputSchema,
  ProductAssistantOutputSchema,
  type InitialAnalysis,
  type ContinueTodoOutput,
  type VerifyHighRiskOutput,
  type ProductAssistantOutput,
} from "@/lib/types";
import type { RulePackCode } from "@/lib/types";
import type { ProfileInputLike } from "@/lib/services/rule-service";
import { getRuleById, getAllRules, RULES_VERSION, type RuleV1 } from "@/lib/rules";
import {
  getRulesForPacks,
  filterApplicableRules,
  renderFullRule,
  renderRulesForPrompt,
} from "@/lib/services/rule-service";
import {
  PROMPT_VERSION,
  SCHEMA_VERSION,
  buildAnalyzeProjectPrompt,
  buildContinueTodoPrompt,
  buildVerifyHighRiskPrompt,
  buildProductAssistantPrompt,
} from "@/lib/ai-gateway/prompts";
import { stepfunChat, type ImagePart } from "@/lib/ai-gateway/provider";
import { GatewayError, withRetry, parseJsonLoose } from "@/lib/ai-gateway/retry";
import { computeInputHash, findCachedResult } from "@/lib/ai-gateway/cache";
import { assertBudget, estimateCost, addProjectSpend } from "@/lib/ai-gateway/budget";
import { recordInvocation } from "@/lib/ai-gateway/invocation-log";
import { mockAnalyzeProject, mockContinueTodo, mockVerifyHighRisk } from "@/lib/ai-gateway/mock";

export interface GatewayResult<T> {
  result: T;
  invocationId: string;
  cached: boolean;
  /** live=真实调用 | mock=仅自动化测试使用 */
  mode: "live" | "mock";
}

/** 网关通用编排：缓存 → 预算 → 调用/校验/修复重试 → 记录 */
async function orchestrate<T>(args: {
  functionName: string;
  projectId?: string;
  payload: unknown;
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  buildPrompt: () => { system: string; user: string };
  images?: ImagePart[];
  mockGenerate: () => T;
}): Promise<GatewayResult<T>> {
  const cfg = stepfunConfig();
  // 按输入形态自动路由模型：带截图走多模态旗舰（step-3.7-flash），纯文本走 Agent 优化轻量档
  const model = args.images?.length ? cfg.model : cfg.textModel;
  const allowTestMock = process.env.NODE_ENV === "test";
  if (!cfg.apiKey && !allowTestMock) {
    throw new GatewayError("auth", "实时模型尚未配置，分析没有开始。请配置模型密钥后重试。");
  }
  const mode: "live" | "mock" = cfg.apiKey ? "live" : "mock";
  const inputHash = computeInputHash(
    args.functionName,
    mode === "live" ? model : "mock",
    PROMPT_VERSION,
    RULES_VERSION,
    SCHEMA_VERSION,
    args.payload,
  );

  // 1) 缓存命中直接返回（相同材料+模型+Prompt+规则+Schema 版本）
  const cached = await findCachedResult(inputHash);
  if (cached !== null) {
    const parsed = args.schema.safeParse(cached);
    if (parsed.success) {
      const invocationId = await recordInvocation({
        projectId: args.projectId,
        functionName: args.functionName,
        model: mode === "live" ? model : "mock",
        promptVersion: PROMPT_VERSION,
        ruleVersion: RULES_VERSION,
        schemaVersion: SCHEMA_VERSION,
        inputHash,
        cacheHit: true,
        cost: 0,
        result: parsed.data,
      });
      return { result: parsed.data, invocationId, cached: true, mode };
    }
  }

  // 2) Mock 模式：仅自动化测试环境可进入
  if (mode === "mock") {
    const started = Date.now();
    const result = args.mockGenerate();
    const invocationId = await recordInvocation({
      projectId: args.projectId,
      functionName: args.functionName,
      model: "mock",
      promptVersion: PROMPT_VERSION,
      ruleVersion: RULES_VERSION,
      schemaVersion: SCHEMA_VERSION,
      inputHash,
      latencyMs: Date.now() - started,
      cost: 0,
      result,
    });
    return { result, invocationId, cached: false, mode };
  }

  // 3) 预算检查（调用前）
  await assertBudget(args.projectId);

  // 4) 真实调用（有限重试）+ zod 校验 + 一次修复重试
  const started = Date.now();
  let tokensIn: number | undefined;
  let tokensOut: number | undefined;
  let parsedResult: T | null = null;

  const attempt = async (repairNote?: string): Promise<string> => {
    const { system, user } = args.buildPrompt();
    const chat = await stepfunChat({
      model,
      system,
      user: repairNote
        ? `${user}\n\n【修复要求】上次输出未通过 Schema 校验：${repairNote}\n请只输出修正后的 JSON。`
        : user,
      images: args.images,
    });
    tokensIn = chat.tokensIn;
    tokensOut = chat.tokensOut;
    return chat.content;
  };

  try {
    const content = await withRetry(() => attempt());
    const first = args.schema.safeParse(parseJsonLoose(content));
    if (first.success) {
      parsedResult = first.data;
    } else {
      // 格式错误：一次修复重提示
      const repaired = await withRetry(() =>
        attempt(first.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")),
      );
      const second = args.schema.safeParse(parseJsonLoose(repaired));
      if (!second.success) {
        throw new GatewayError("format", `两次输出均未通过 Schema 校验：${second.error.issues[0]?.message}`);
      }
      parsedResult = second.data;
    }
  } catch (err) {
    // 调用失败也记录（供降级与巡检）；保留预处理产物，允许稍后继续
    await recordInvocation({
      projectId: args.projectId,
      functionName: args.functionName,
      model,
      promptVersion: PROMPT_VERSION,
      ruleVersion: RULES_VERSION,
      schemaVersion: SCHEMA_VERSION,
      inputHash,
      latencyMs: Date.now() - started,
      cost: 0,
      adopted: false,
      result: { error: err instanceof Error ? err.message : String(err) },
    }).catch(() => undefined);
    throw err;
  }

  const latencyMs = Date.now() - started;
  const cost = estimateCost(model, tokensIn ?? 0, tokensOut ?? 0);
  if (args.projectId) {
    await addProjectSpend(args.projectId, cost).catch(() => undefined);
  }
  const invocationId = await recordInvocation({
    projectId: args.projectId,
    functionName: args.functionName,
    model: cfg.model,
    promptVersion: PROMPT_VERSION,
    ruleVersion: RULES_VERSION,
    schemaVersion: SCHEMA_VERSION,
    inputHash,
    tokens: { input: tokensIn, output: tokensOut },
    latencyMs,
    cost,
    result: parsedResult,
  });
  return { result: parsedResult!, invocationId, cached: false, mode };
}

// ===== 网关三函数 =====

/** 项目级初始分析（每项目原则上一次）。packs+profile 决定规则注入集并参与缓存隔离 */
export async function analyzeProject(args: {
  projectId?: string;
  evidenceSummary: string;
  images?: ImagePart[];
  packs?: RulePackCode[];
  /** 产品画像：驱动适用性筛选（tace.md §11 规则服务职责） */
  profile?: ProfileInputLike;
}): Promise<GatewayResult<InitialAnalysis>> {
  let injected = args.packs?.length ? getRulesForPacks(args.packs) : getAllRules();
  // 画像级适用性筛选（过滤过狠时回退未筛选集，保证注入密度）
  if (args.profile) {
    const filtered = filterApplicableRules(injected, args.profile);
    if (filtered.length >= 8) injected = filtered;
  }
  return orchestrate<InitialAnalysis>({
    functionName: "analyzeProject",
    projectId: args.projectId,
    payload: {
      evidenceSummary: args.evidenceSummary.slice(0, 4000),
      packCodes: args.packs ?? ["ALL"],
      profileKey: args.profile?.productType ?? null,
    },
    schema: InitialAnalysisSchema,
    images: args.images,
    buildPrompt: () =>
      buildAnalyzeProjectPrompt(args.evidenceSummary.slice(0, 12000), renderRulesForPrompt(injected)),
    mockGenerate: () => mockAnalyzeProject(args.evidenceSummary, injected),
  });
}

/** 待办级增量调用（用户输入触发）。绑定了规则时注入该规则全量 JSON */
export async function continueTodo(args: {
  projectId?: string;
  ruleId?: string | null;
  todoContext: string;
  userInput: string;
  images?: ImagePart[];
}): Promise<GatewayResult<ContinueTodoOutput>> {
  const rule: RuleV1 | undefined = args.ruleId ? getRuleById(args.ruleId) : undefined;
  const rulesText = rule ? renderFullRule(rule) : renderRulesForPrompt(getAllRules().slice(0, 5));
  return orchestrate<ContinueTodoOutput>({
    functionName: "continueTodo",
    projectId: args.projectId,
    payload: {
      todoContext: args.todoContext.slice(0, 2000),
      userInput: args.userInput.slice(0, 2000),
      ruleId: rule?.rule_id ?? null,
    },
    schema: ContinueTodoOutputSchema,
    images: args.images,
    buildPrompt: () =>
      buildContinueTodoPrompt(args.todoContext.slice(0, 6000), args.userInput.slice(0, 4000), rulesText),
    mockGenerate: () => mockContinueTodo(rule?.title ?? "当前规则", args.userInput, 1),
  });
}

/** 高风险 Finding 独立一致性复核 */
export async function verifyHighRisk(args: {
  projectId?: string;
  finding: {
    id: string;
    title: string;
    type: string;
    severity: string;
    sources: string[];
    dimension?: string | null;
    ruleId?: string | null;
  };
  evidenceSummary: string;
}): Promise<GatewayResult<VerifyHighRiskOutput>> {
  const rule = args.finding.ruleId ? getRuleById(args.finding.ruleId) : undefined;
  const rulesText = rule ? renderFullRule(rule) : renderRulesForPrompt(getAllRules().slice(0, 5));
  const findingContext =
    JSON.stringify(args.finding, null, 2) + "\n证据摘要：" + args.evidenceSummary.slice(0, 4000);
  return orchestrate<VerifyHighRiskOutput>({
    functionName: "verifyHighRisk",
    projectId: args.projectId,
    payload: { finding: args.finding, evidence: args.evidenceSummary.slice(0, 2000) },
    schema: VerifyHighRiskOutputSchema,
    buildPrompt: () => buildVerifyHighRiskPrompt(findingContext, rulesText),
    mockGenerate: () => mockVerifyHighRisk({ sources: args.finding.sources, type: args.finding.type }, rule),
  });
}

/** 产品内使用助手：与审查分析共用真实模型出口，不读取未授权项目材料。 */
export async function askProductAssistant(args: {
  question: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<GatewayResult<ProductAssistantOutput>> {
  const history = (args.history ?? [])
    .slice(-6)
    .map((message) => `${message.role === "user" ? "用户" : "泡芙"}：${message.content.slice(0, 600)}`)
    .join("\n");
  return orchestrate<ProductAssistantOutput>({
    functionName: "askProductAssistant",
    payload: { question: args.question.slice(0, 1000), history },
    schema: ProductAssistantOutputSchema,
    buildPrompt: () => buildProductAssistantPrompt(args.question.slice(0, 1000), history),
    mockGenerate: () => ({ answer: "这是自动化测试中的助手回答。", suggestions: [] }),
  });
}

export { GatewayError };
