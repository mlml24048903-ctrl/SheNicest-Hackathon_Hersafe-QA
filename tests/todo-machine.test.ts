// 待办状态机全路径单测（ROADMAP §6.3：状态机全路径 + 失败注入）
import { describe, expect, it } from "vitest";
import {
  canTransition,
  assertTransition,
  nextRound,
  MAX_AI_ROUNDS,
  IllegalTransitionError,
} from "@/lib/state/todo-machine";
import { TODO_TRANSITIONS, type TodoStatus } from "@/lib/types";

describe("待办状态机", () => {
  it("全部法定转移：canTransition=true 且 assertTransition 不抛", () => {
    for (const [from, targets] of Object.entries(TODO_TRANSITIONS) as Array<[TodoStatus, TodoStatus[]]>) {
      for (const to of targets) {
        expect(canTransition(from, to)).toBe(true);
        expect(() => assertTransition(from, to)).not.toThrow();
      }
    }
  });

  it("非法转移抛 IllegalTransitionError（含中文说明）", () => {
    expect(() => assertTransition("pending", "done")).toThrow(IllegalTransitionError);
    expect(() => assertTransition("pending", "done")).toThrow(/非法状态转移/);
    expect(canTransition("done", "in_chat")).toBe(false); // 终态不可出
  });

  it("成功标准路径：pending → in_chat → awaiting_confirm → done", () => {
    expect(canTransition("pending", "in_chat")).toBe(true);
    expect(canTransition("in_chat", "awaiting_confirm")).toBe(true);
    expect(canTransition("awaiting_confirm", "done")).toBe(true);
  });

  it("用户可撤回待确认内容，补充后再次进入确认", () => {
    expect(canTransition("awaiting_confirm", "re_evaluating")).toBe(true);
    expect(canTransition("re_evaluating", "in_chat")).toBe(true);
    expect(canTransition("re_evaluating", "awaiting_confirm")).toBe(true);
  });

  it("第 4 轮拦截：nextRound 边界", () => {
    expect(nextRound(0)).toEqual({ round: 1, forceManual: false });
    expect(nextRound(1)).toEqual({ round: 2, forceManual: false });
    expect(nextRound(2)).toEqual({ round: 3, forceManual: false });
    expect(nextRound(3)).toEqual({ round: 3, forceManual: true });
    expect(nextRound(99).forceManual).toBe(true);
    expect(MAX_AI_ROUNDS).toBe(3);
  });

  it("降级路径：活动态 → needs_manual / retryable_error 可达性抽查", () => {
    expect(canTransition("in_chat", "needs_manual")).toBe(true);
    expect(canTransition("awaiting_confirm", "retryable_error")).toBe(true);
    expect(canTransition("re_evaluating", "awaiting_confirm")).toBe(true);
    expect(canTransition("needs_manual", "done")).toBe(true);
  });
});
