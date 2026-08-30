// 审查台全局状态（Zustand，ROADMAP T2.6）：图层↔待办↔确认选项↔补充截图 状态同步
import { create } from "zustand";
import type { ControlCandidate } from "@/lib/types";

export type LayerMode = "annotation" | "risk"; // 标注模式 / 风险图层模式（PRD F2.2）

interface ReviewStore {
  /** 当前模式：annotation=核对候选图层；risk=四类状态视图 */
  mode: LayerMode;
  /** 当前选中图层 */
  selectedControlId: string | null;
  /** 图层集合（服务端权威，操作后同步） */
  controls: ControlCandidate[];
  /** 手工框选中 */
  drawing: boolean;
  /** 待办刷新信号（确认写入/补充截图后联动） */
  todoRefreshFlag: number;
  setMode: (m: LayerMode) => void;
  select: (id: string | null) => void;
  setControls: (c: ControlCandidate[]) => void;
  setDrawing: (d: boolean) => void;
  bumpTodos: () => void;
}

export const useReviewStore = create<ReviewStore>((set) => ({
  mode: "annotation",
  selectedControlId: null,
  controls: [],
  drawing: false,
  todoRefreshFlag: 0,
  setMode: (mode) => set({ mode }),
  select: (selectedControlId) => set({ selectedControlId }),
  setControls: (controls) => set({ controls }),
  setDrawing: (drawing) => set({ drawing }),
  bumpTodos: () => set((s) => ({ todoRefreshFlag: s.todoRefreshFlag + 1 })),
}));
