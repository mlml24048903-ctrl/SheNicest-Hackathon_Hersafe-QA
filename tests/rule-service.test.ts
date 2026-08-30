// 规则服务单测：确定性推荐 / 适用性筛选 / Prompt 渲染护栏
import { describe, expect, it } from "vitest";
import {
  recommendPacks,
  filterApplicableRules,
  getRulesForPacks,
  renderRulesForPrompt,
  renderFullRule,
  describePacks,
} from "@/lib/services/rule-service";

describe("recommendPacks 确定性推荐", () => {
  it("经期记录 → BASE+MENS；含 AI 主张时叠加 HDAI", () => {
    const recs = recommendPacks({
      productType: "period_tracking",
      sensitiveData: ["cycle"],
      healthClaims: ["AI 经期预测建议"],
    });
    const codes = recs.map((r) => r.packCode);
    expect(codes).toContain("BASE");
    expect(codes).toContain("MENS");
    expect(codes).toContain("HDAI");
    expect(codes).not.toContain("PREG");
  });

  it("孕期产品 → BASE+PREG，不推荐 MENS", () => {
    const codes = recommendPacks({ productType: "pregnancy" }).map((r) => r.packCode);
    expect(codes).toEqual(expect.arrayContaining(["BASE", "PREG"]));
    expect(codes).not.toContain("MENS");
  });

  it("泛健康且无 AI 特征 → 仅 BASE", () => {
    expect(recommendPacks({ productType: "general_health" }).map((r) => r.packCode)).toEqual(["BASE"]);
  });

  it("每条推荐都带非空 reason（支撑「解释适用原因」验收项）", () => {
    for (const r of recommendPacks({ productType: "fertility_ttc", coreTasks: ["predict"] })) {
      expect(r.reason.length).toBeGreaterThan(10);
    }
  });
});

describe("filterApplicableRules / getRulesForPacks", () => {
  const all = getRulesForPacks(["BASE", "MENS"]);

  it("未选包内的规则被剔除", () => {
    const mensOnly = filterApplicableRules(
      all,
      { productType: "period_tracking" },
      { packs: new Set(["MENS"]) },
    );
    expect(mensOnly.every((r) => r.pack === "MENS")).toBe(true);
  });

  it("feature 全不命中且不限类型的规则被过滤", () => {
    const kept = filterApplicableRules(all, { productType: "other" }, {});
    // other 类型应基本清空 MENS 场景规则
    expect(kept.some((r) => r.pack === "MENS")).toBe(false);
  });

  it("includeDrafts=false 剔除草稿（当前全为草稿 → 空）", () => {
    expect(
      filterApplicableRules(all, { productType: "period_tracking" }, { includeDrafts: false }),
    ).toHaveLength(0);
  });
});

describe("Prompt 渲染护栏", () => {
  it("renderRulesForPrompt 遵守 cap 截断且含指定规则（子集内）", () => {
    const rules = getRulesForPacks(["BASE", "MENS", "PREG", "HDAI"]);
    expect(rules.length).toBeGreaterThan(16);
    const text = renderRulesForPrompt(rules, 16);
    expect(text.split("\n- [").length - 1).toBeLessThanOrEqual(16);
    // 子集注入时目标规则必现
    const mensText = renderRulesForPrompt(getRulesForPacks(["MENS"]), 16);
    expect(mensText).toContain("MENS-PRIV-001");
    expect(text).not.toContain(renderFullRule(rules[0]).slice(0, 20)); // 不应注入完整 JSON
  });

  it("describePacks 返回四包元信息且条数正确", () => {
    const meta = describePacks();
    expect(meta).toHaveLength(4);
    expect(meta.reduce((a, b) => a + b.total, 0)).toBeGreaterThanOrEqual(40);
  });
});
