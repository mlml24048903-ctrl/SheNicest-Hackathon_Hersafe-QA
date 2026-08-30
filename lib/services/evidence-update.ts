// Evidence Update 事务写入（PRD F4 / tace.md §6.1）：
// - 用户确认前不写入；确认后以事务提交，失败回滚，不允许半完成结果进入报告
// - 只更新关联 Finding；跨风险影响 → 新建关联待办，不静默修改其他结论
// - baseline_issue 服务端派生（BASE/HDAI 包失败的结论自动映射，决策 D3）
// - 置信度与严重度分离落库；not_applicable 必须带不适用依据

import { prisma } from "@/lib/db";
import { getPendingProposal } from "@/lib/services/todo-chat";
import { buildGwtFromRule } from "@/lib/services/analysis";
import { resolveServerFindingType } from "@/lib/services/gateway-validation";
import { getRuleById } from "@/lib/rules";
import { canTransition } from "@/lib/state/todo-machine";
import type { ChatMessage, ControlCandidate, FindingType, Severity } from "@/lib/types";

export interface ConfirmOutcome {
  evidenceUpdateId: string;
  affectedFindingId: string | null;
  crossRiskTodoIds: string[];
  beforeState: unknown;
  afterState: unknown;
}

/**
 * 确认拟写入证据摘要 → 事务写入。
 * 该函数是“用户确认前不写入”不变量的唯一入口。
 */
export async function confirmEvidenceUpdate(
  todoId: string,
  confirmedBy = "演示用户",
): Promise<ConfirmOutcome> {
  const todo = await prisma.reviewTodo.findUnique({ where: { id: todoId }, include: { finding: true } });
  if (!todo) throw new Error("待办不存在");
  if (todo.status !== "awaiting_confirm") {
    throw new Error(`当前状态（${todo.status}）不可确认写入，仅在“待确认写入”状态允许`);
  }

  const proposal = await getPendingProposal(todoId);
  if (!proposal || proposal.kind !== "sufficient") {
    throw new Error("未找到有效的拟写入证据摘要");
  }

  const finding = todo.finding;
  if (!finding) {
    throw new Error("这条待办没有关联的风险结论，暂时不能写入报告。请返回初步分析重新生成待办。");
  }
  const beforeState = finding
    ? {
        id: finding.id,
        type: finding.type,
        severity: finding.severity,
        status: finding.status,
        confidence: finding.confidence,
        confirmedFacts: finding.confirmedFacts,
      }
    : null;

  const rule = finding?.ruleId ? getRuleById(finding.ruleId) : undefined;
  const preview = proposal.risk_update_preview;

  // 受控收敛：rawType 只能来自五类合法结论（Schema 已限），baseline_issue 由服务端派生
  const rawType = (preview?.new_type as FindingType) ?? "unverified_risk";
  const newType: FindingType = resolveServerFindingType(rawType, rule);
  const newSeverity: Severity = (preview?.new_severity as Severity) ?? finding?.severity ?? "medium";
  const newStatus = newType === "unverified_risk" ? "pending_verify" : "final";

  // 不适用必须带依据；缺失时由摘要兜底
  let naBasis: string | null = null;
  if (newType === "not_applicable") {
    naBasis =
      preview?.na_basis?.trim() ||
      `${rule ? `命中规则 ${rule.rule_id} 的不适用条件；` : ""}用户确认：${(proposal.facts_to_record[0] ?? proposal.summary).slice(0, 80)}`;
  }

  const confidence = preview?.confidence ?? "medium";
  const confidenceReason = preview?.confidence_reason ?? "";

  const afterState = {
    ...(beforeState ?? {}),
    type: newType,
    severity: newSeverity,
    status: newStatus,
    confidence,
    naBasis,
    confirmedFacts: [...((finding?.confirmedFacts as string[]) ?? []), ...proposal.facts_to_record],
  };

  const crossRiskTodoIds: string[] = [];

  // ===== 事务写入（失败回滚，无半完成状态）=====
  const evidenceUpdateId = await prisma.$transaction(async (tx) => {
    // 1) EvidenceUpdate 档案（先 pending，事务末置 committed）
    const eu = await tx.evidenceUpdate.create({
      data: {
        projectId: todo.projectId,
        todoId: todo.id,
        findingId: finding.id,
        beforeState: beforeState ?? {},
        afterState,
        summary: proposal.summary,
        confirmedBy,
        txStatus: "pending",
      },
    });

    // 2) 只更新关联 Finding（不变量：单项补充只更新关联风险）
    if (finding) {
      await tx.finding.update({
        where: { id: finding.id },
        data: {
          type: newType,
          severity: newSeverity,
          status: newStatus,
          confidence,
          confidenceReason: confidenceReason || null,
          naBasis,
          confirmedFacts: afterState.confirmedFacts,
          // 用户确认事实与模型推断分离记录
          modelInference:
            `${finding.modelInference ?? ""}\n[证据更新 ${new Date().toISOString()}] ${proposal.summary}`.trim(),
        },
      });
      // 结论升级为终态时补充/刷新 GWT 用例
      if (newStatus === "final") {
        const hasCase = await tx.testCase.findFirst({ where: { findingId: finding.id } });
        if (!hasCase) {
          await tx.testCase.create({
            data: { findingId: finding.id, ...buildGwtFromRule(finding.ruleId) },
          });
        }
      }
    }

    // 3) 跨风险影响 → 新建关联待办（不静默修改其他结论）
    for (const impact of proposal.cross_risk_impact ?? []) {
      const impacted = await tx.finding.findUnique({ where: { id: impact.finding_id } });
      if (!impacted || impacted.projectId !== todo.projectId) continue;
      const t = await tx.reviewTodo.create({
        data: {
          projectId: todo.projectId,
          title: `新证据可能影响：${impacted.title}`,
          priority: "medium",
          reason: `待办「${todo.title}」的新证据可能改变此风险：${impact.why}`,
          evidenceRefs: proposal.fact_sources,
          findingId: impacted.id,
          ruleId: impacted.ruleId,
          status: "pending",
          conversation: {
            create: {
              messages: [
                {
                  role: "assistant",
                  content: `提出原因：待办「${todo.title}」确认了新证据（${proposal.summary}），可能与本风险存在相互影响（${impact.why}）。请核对并补充材料。`,
                  round: 0,
                  kind: "question",
                  createdAt: new Date().toISOString(),
                  attachments: [],
                },
              ],
            },
          },
        },
      });
      crossRiskTodoIds.push(t.id);
    }

    // 4) 待办完成 + 对话留痕（awaiting_confirm → done 为法定转移）
    void canTransition;
    await tx.reviewTodo.update({ where: { id: todo.id }, data: { status: "done" } });
    const conv = await tx.todoConversation.findUnique({ where: { todoId: todo.id } });
    if (conv) {
      const msgs = [...((conv.messages as ChatMessage[]) ?? [])];
      msgs.push({
        role: "system",
        content: `用户已确认写入（${new Date().toISOString()}）。结论类型：${newType}。EvidenceUpdate：${eu.id}`,
        round: todo.aiRounds,
        kind: "note",
        createdAt: new Date().toISOString(),
        attachments: [],
      });
      await tx.todoConversation.update({
        where: { todoId: todo.id },
        data: { messages: msgs, contextSummary: null, updatedAt: new Date() },
      });
    }

    // 5) 提交
    await tx.evidenceUpdate.update({ where: { id: eu.id }, data: { txStatus: "committed" } });
    return eu.id;
  });

  // 6) 图层状态同步：本待办关联的图层随结论更新状态（含新增两类的映射）
  if (finding) {
    const pkg = await prisma.evidencePackage.findUnique({ where: { projectId: todo.projectId } });
    if (pkg) {
      const controls = (pkg.controls as ControlCandidate[]) ?? [];
      let changed = false;
      for (const c of controls) {
        if (c.todoId === todo.id) {
          c.status =
            newType === "protected"
              ? "protected"
              : newType === "confirmed_risk" || newType === "baseline_issue"
                ? "risk"
                : newType === "not_applicable"
                  ? "not_applicable"
                  : "needs_evidence";
          changed = true;
        }
      }
      if (changed) {
        await prisma.evidencePackage.update({
          where: { projectId: todo.projectId },
          data: { controls, updatedAt: new Date() },
        });
      }
    }
  }

  return {
    evidenceUpdateId,
    affectedFindingId: finding?.id ?? null,
    crossRiskTodoIds,
    beforeState,
    afterState,
  };
}
