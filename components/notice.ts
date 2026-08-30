// 操作反馈的结构化协议
// 旧协议是"字符串 + ⚠️/✅ emoji 前缀"，靠 startsWith 嗅探决定展示形态；
// 本模块用类型化的 { kind, text } 取代之，渲染统一走 <Banner kind={notice.kind}>。

export type NoticeKind = "success" | "error" | "info";

export interface NoticeState {
  kind: NoticeKind;
  text: string;
}

/** 组件内的反馈状态：null 表示无待展示消息 */
export type Notice = NoticeState | null;

/**
 * 行为保持型执行器：fn() 成功时其返回字符串成为 success 文案；
 * 抛错时取 error.message（无 message 则用 fallbackError）成为 error 文案。
 * 用于消除三处业务组件重复的 try/catch + setNotice 样板。
 */
export async function runWithNotice(
  setNotice: (n: Notice) => void,
  fn: () => Promise<string>,
  fallbackError = "操作失败",
): Promise<void> {
  try {
    const text = await fn();
    setNotice({ kind: "success", text });
  } catch (err) {
    const message = err instanceof Error && err.message ? err.message : fallbackError;
    setNotice({ kind: "error", text: message });
  }
}
