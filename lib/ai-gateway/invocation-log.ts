// 网关横切：ModelInvocation 调用记录（PRD §5.7）
// 每次调用保存模型、Prompt、规则和 Schema 版本及输入 Hash，保证结论可复现、可回归。

import { prisma } from "@/lib/db";

export interface InvocationRecord {
  projectId?: string;
  functionName: string;
  model: string;
  promptVersion: string;
  ruleVersion: string;
  schemaVersion: string;
  inputHash: string;
  tokens?: { input?: number; output?: number };
  latencyMs?: number;
  cost?: number;
  cacheHit?: boolean;
  adopted?: boolean;
  result?: unknown;
}

/** 记录一次调用（失败也记录，供费用看板与回归分析） */
export async function recordInvocation(rec: InvocationRecord): Promise<string> {
  const inv = await prisma.modelInvocation.create({
    data: {
      projectId: rec.projectId,
      functionName: rec.functionName,
      model: rec.model,
      promptVersion: rec.promptVersion,
      ruleVersion: rec.ruleVersion,
      schemaVersion: rec.schemaVersion,
      inputHash: rec.inputHash,
      tokens: rec.tokens ?? undefined,
      latencyMs: rec.latencyMs,
      cost: rec.cost ?? 0,
      cacheHit: rec.cacheHit ?? false,
      adopted: rec.adopted ?? true,
      result: rec.result ?? undefined,
    },
  });
  return inv.id;
}
