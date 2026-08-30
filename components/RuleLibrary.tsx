"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Search, ShieldCheck } from "lucide-react";
import { Badge, Card, Input } from "@/components/ui";
import { DIMENSION_LABELS, PACK_META, type RulePackCode } from "@/lib/types";
import { getSourceUrl, isUnverifiedSource } from "@/lib/rules/source-links";
import type { RuleV1 } from "@/lib/rules";

export default function RuleLibrary({ rules }: { rules: RuleV1[] }) {
  const [query, setQuery] = useState("");
  const [pack, setPack] = useState<RulePackCode | "all">("all");
  const [highlightedRuleId, setHighlightedRuleId] = useState("");
  const [returnTo, setReturnTo] = useState("");

  const filtered = useMemo(() => rules.filter((rule) => {
    const matchesPack = pack === "all" || rule.pack === pack;
    const haystack = `${rule.rule_id} ${rule.title} ${rule.normative_requirement}`.toLowerCase();
    return matchesPack && haystack.includes(query.trim().toLowerCase());
  }), [pack, query, rules]);

  useEffect(() => {
    const syncLocation = () => {
      const ruleId = decodeURIComponent(window.location.hash.replace(/^#/, ""));
      const back = new URLSearchParams(window.location.search).get("returnTo") ?? "";
      if (!ruleId) return;
      setPack("all");
      setQuery("");
      setReturnTo(back.startsWith("/projects/") ? back : "");
      setHighlightedRuleId(ruleId);
      requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(`rule-${ruleId}`)?.scrollIntoView({ block: "center", behavior: "smooth" })));
    };
    syncLocation();
    window.addEventListener("hashchange", syncLocation);
    window.addEventListener("popstate", syncLocation);
    return () => {
      window.removeEventListener("hashchange", syncLocation);
      window.removeEventListener("popstate", syncLocation);
    };
  }, []);

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {returnTo && <Link href={returnTo} className="mb-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-3 text-sm font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50"><ArrowLeft className="h-4 w-4" />返回当前待办</Link>}
          <p className="text-xs font-semibold text-brand-600">可追溯规则</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">规则库</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">这里说明每条规则具体要求什么、为什么需要核查，以及可以参考哪些公开依据。</p>
        </div>
        <div className="relative w-full sm:w-80"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索规则编号或名称" className="pl-10" /></div>
      </header>
      <div className="mt-7 flex flex-wrap gap-2" aria-label="按规则包筛选">
        <button onClick={() => setPack("all")} className={`min-h-10 whitespace-nowrap rounded-xl px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${pack === "all" ? "bg-neutral-950 text-white shadow-md" : "bg-white text-neutral-600 shadow-sm hover:bg-neutral-50"}`}>全部 {rules.length}</button>
        {(Object.keys(PACK_META) as RulePackCode[]).map((code) => <button key={code} onClick={() => setPack(code)} className={`min-h-10 whitespace-nowrap rounded-xl px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${pack === code ? "bg-neutral-950 text-white shadow-md" : "bg-white text-neutral-600 shadow-sm hover:bg-neutral-50"}`}>{PACK_META[code].label}</button>)}
      </div>
      <div className="mt-6 grid items-stretch gap-4 lg:grid-cols-2">
        {filtered.map((rule) => {
          const highlighted = rule.rule_id === highlightedRuleId;
          return (
            <div key={rule.rule_id} id={`rule-${rule.rule_id}`} className="h-full scroll-mt-24">
            <Card className={`h-full p-5 transition-[box-shadow,background-color] sm:p-6 ${highlighted ? "bg-brand-50 shadow-raised ring-[3px] ring-brand-400" : ""}`}>
              <article aria-current={highlighted ? "true" : undefined} className="flex h-full flex-col">
                {highlighted && <p className="mb-3 text-sm font-semibold text-brand-800">当前待办引用的规则</p>}
                <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><Badge color="pink">{rule.rule_id}</Badge><Badge color="neutral">{DIMENSION_LABELS[rule.dimension]}</Badge></div><span className="text-xs text-neutral-400">{rule.version}</span></div>
                <h2 className="mt-4 text-lg font-semibold tracking-[-0.015em]">{rule.title}</h2>
                <p className="mt-3 text-sm leading-6 text-neutral-700">{rule.normative_requirement}</p>
                <details open={highlighted || undefined} className="mt-auto rounded-2xl bg-white/80 p-4 pt-4">
                  <summary className="cursor-pointer text-sm font-semibold text-neutral-700">查看核查要点与依据</summary>
                  <div className="mt-4 space-y-4 text-sm leading-6 text-neutral-600">
                    <div><p className="text-xs font-semibold text-neutral-500">需要的证据</p><p className="mt-1">{rule.required_evidence.join("；")}</p></div>
                    <div><p className="text-xs font-semibold text-neutral-500">公开来源</p><ul className="mt-2 space-y-2">{rule.sources.map((source) => { const url = getSourceUrl(source.ref); return <li key={`${source.ref}-${source.clause ?? ""}`} className="flex items-start gap-2"><ShieldCheck className="mt-1 h-4 w-4 shrink-0 text-brand-600" /><span className="flex-1">{source.ref}{source.clause ? ` · ${source.clause}` : ""}</span>{url ? <a href={url} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-brand-700 hover:bg-brand-50">打开依据来源<ExternalLink className="h-3.5 w-3.5" /></a> : <Badge color={isUnverifiedSource(source.ref) ? "amber" : "neutral"}>{isUnverifiedSource(source.ref) ? "待核验" : "暂无公开链接"}</Badge>}</li>; })}</ul></div>
                  </div>
                </details>
              </article>
            </Card>
            </div>
          );
        })}
      </div>
      {!filtered.length && <Card className="mt-6 p-10 text-center text-sm text-neutral-500">没有找到匹配规则。可以缩短关键词或查看全部规则。</Card>}
    </div>
  );
}
