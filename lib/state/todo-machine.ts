// 待办状态机 —— 集中管理状态流转（ROADMAP 关键约束：状态流转集中一个模块）
// 全路径单测见 tests/todo-machine.test.ts

import { TODO_TRANSITIONS, type TodoStatus } from "@/lib/types";

/** 每个待办最多 3 轮 AI 追问，超过转人工确认（PRD F3.4） */
export const MAX_AI_ROUNDS = 3;

export class IllegalTransitionError extends Error {
  constructor(
    public readonly from: TodoStatus,
    public readonly to: TodoStatus,
  ) {
    super(`非法状态转移：${from} → ${to}（合法目标：${TODO_TRANSITIONS[from].join(", ") || "无（终态）"}）`);
    this.name = "IllegalTransitionError";
  }
}

/** 校验状态转移是否合法 */
export function canTransition(from: TodoStatus, to: TodoStatus): boolean {
  return TODO_TRANSITIONS[from]?.includes(to) ?? false;
}

/** 断言状态转移合法，非法则抛错（服务端事务路径使用） */
export function assertTransition(from: TodoStatus, to: TodoStatus): void {
  if (!canTransition(from, to)) {
    throw new IllegalTransitionError(from, to);
  }
}

/**
 * 计算下一轮追问：
 * - 当前轮次 < 3：允许继续追问，返回下一轮轮次
 * - 已达 3 轮：强制转为 needs_manual（第 4 轮拦截）
 */
export function nextRound(currentRound: number): {
  round: number;
  forceManual: boolean;
} {
  if (currentRound >= MAX_AI_ROUNDS) {
    return { round: currentRound, forceManual: true };
  }
  return { round: currentRound + 1, forceManual: false };
}
