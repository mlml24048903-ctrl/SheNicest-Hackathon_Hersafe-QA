import { describe, expect, it } from "vitest";
import { formatModelMessage } from "@/lib/text-format";

describe("formatModelMessage", () => {
  it("保留模型原有换行", () => {
    expect(formatModelMessage("第一段\n第二段")).toBe("第一段\n第二段");
  });

  it("把旧消息中粘连的段落标签自然分开", () => {
    expect(formatModelMessage("摘要内容 记录事实：已有保护 适用范围：当前待办 &#x20;"))
      .toBe("摘要内容\n记录事实：已有保护\n适用范围：当前待办");
  });
});
