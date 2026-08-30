// 规则包元信息查询（tace.md §11.1 第1条：「选择规则包并解释适用原因」的数据源）
import { NextResponse } from "next/server";
import { describePacks } from "@/lib/services/rule-service";
import { getRulesByPack } from "@/lib/rules";
import { RULESET_VERSION } from "@/lib/rules";

export const runtime = "nodejs";

export async function GET() {
  const packs = describePacks().map((p) => ({
    ...p,
    rulesetVersion: RULESET_VERSION,
    // 每包附两条示例规则供向导预览（确定性取前两条）
    sampleRules: getRulesByPack(p.packCode)
      .slice(0, 2)
      .map((r) => ({ rule_id: r.rule_id, title: r.title })),
  }));
  return NextResponse.json({ packs });
}
