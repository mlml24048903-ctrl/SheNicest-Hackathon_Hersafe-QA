import { describe, expect, it } from "vitest";
import { mockAnalyzeProject } from "@/lib/ai-gateway/mock";
import { getAllRules } from "@/lib/rules";

describe("测试环境代码分析规则匹配", () => {
  it("代码没有风险线索时如实返回，不强行生成健康规则待办", () => {
    const result = mockAnalyzeProject("【代码静态分析】只有页面与普通按钮\n\n【代码风险线索】[]", getAllRules());
    expect(result.todos).toEqual([]);
    expect(result.initial_findings).toEqual([]);
    expect(result.product_summary.summary).toContain("未发现明确的数据外传");
  });

  it("一条通知代码证据只关联对应规则和来源", () => {
    const signals = [{ type: "notification", title: "通知可能展示健康信息", description: "存在通知逻辑。", source_key: "S7", file_path: "app.js", start_line: 42 }];
    const result = mockAnalyzeProject(`【代码静态分析】经期提醒\n\n【代码风险线索】${JSON.stringify(signals)}`, getAllRules());
    expect(result.todos).toHaveLength(1);
    expect(result.todos[0]).toMatchObject({ rule_id: "MENS-PRIV-001", evidence_refs: ["S7"] });
    expect(result.todos[0].reason).toContain("代码中已经确认");
    expect(result.todos[0].reason).toContain("还需要确认");
  });
});
