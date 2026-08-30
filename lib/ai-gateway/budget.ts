// 网关横切：三档预算检查（用户/项目/每日，PRD §5.6 / §7.1）
// 调用前检查，超预算直接拒绝（不自动重试）。
// 项目档已花费金额累计在 AuditProject.budgetConfig.spent（确定性记账）。

import { prisma } from "@/lib/db";
import { BUDGET_DEFAULTS, stepfunConfig } from "@/lib/config";
import { GatewayError } from "@/lib/ai-gateway/retry";

/** type 别名（而非 interface）以获得隐式索引签名，可直接存入 Prisma Json 字段 */
export type BudgetConfig = {
  perProject?: number;
  perUser?: number;
  perDay?: number;
  /** 累计已花费（记账字段，单位元） */
  spent?: number;
};

/** 费用估算（元）：按型号粗估，实测账单后更新单价表（ROADMAP T0.1 口径）
    StepFun pro plan 走专属网关代理计价，官方公开单价未覆盖，以下为保守估值 */
const PRICE_PER_K: Record<string, { in: number; out: number }> = {
  "step-3.7-flash": { in: 0.008, out: 0.024 },
  "step-3.5-flash-2603": { in: 0.001, out: 0.004 },
  default: { in: 0.005, out: 0.015 },
};

export function estimateCost(model: string, tokensIn = 0, tokensOut = 0): number {
  const p = PRICE_PER_K[model] ?? PRICE_PER_K.default;
  const cost = (tokensIn / 1000) * p.in + (tokensOut / 1000) * p.out;
  return Math.round(cost * 10000) / 10000;
}

/** 调用前预算检查：当日累计 + 项目累计 两道闸 */
export async function assertBudget(projectId?: string): Promise<void> {
  const cfg = stepfunConfig();
  if (!cfg.apiKey) return; // 仅自动化测试环境会在无密钥时继续进入网关

  // 当日累计
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const daily = await prisma.modelInvocation.aggregate({
    where: { createdAt: { gte: dayStart } },
    _sum: { cost: true },
  });
  if ((daily._sum.cost ?? 0) >= BUDGET_DEFAULTS.perDay) {
    throw new GatewayError("budget", `已达每日预算上限（¥${BUDGET_DEFAULTS.perDay}）`);
  }

  // 项目累计（budgetConfig.spent 记账）
  if (projectId) {
    const project = await prisma.auditProject.findUnique({ where: { id: projectId } });
    const bc = (project?.budgetConfig ?? {}) as BudgetConfig;
    const limit = bc.perProject ?? BUDGET_DEFAULTS.perProject;
    if ((bc.spent ?? 0) >= limit) {
      throw new GatewayError("budget", `项目已达预算上限（¥${limit}）`);
    }
  }
}

/** 成功调用后记账：累加 spent（失败不影响主流程） */
export async function addProjectSpend(projectId: string, cost: number): Promise<void> {
  if (!projectId || cost <= 0) return;
  const project = await prisma.auditProject.findUnique({ where: { id: projectId } });
  if (!project) return;
  const bc = (project.budgetConfig ?? {}) as BudgetConfig;
  bc.spent = Math.round(((bc.spent ?? 0) + cost) * 10000) / 10000;
  await prisma.auditProject.update({
    where: { id: projectId },
    data: { budgetConfig: bc },
  });
}
