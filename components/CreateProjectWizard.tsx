// 创建项目向导（tace.md §4 步骤1-2）：名称 → 产品画像六字段 → 规则包推荐确认
// 推荐理由由服务端确定性生成并随 ProjectPack 落库，保证「解释适用原因」可审计。
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Banner, Button, Card, Input, Select, Spinner } from "@/components/ui";
import {
  PACK_META,
  PRODUCT_TYPE_LABELS,
  SENSITIVE_DATA_LABELS,
  USER_ROLE_LABELS,
  type ProductType,
  type ProjectProfile,
  type RulePackCode,
  type SensitiveDataKind,
  type UserRole,
} from "@/lib/types";
import { CircleAlert, Check, Sparkles } from "lucide-react";

interface Recommendation {
  packCode: RulePackCode;
  score: number;
  reason: string;
}

interface PackInfo {
  packCode: string;
  label: string;
  desc: string;
  total: number;
  sampleRules: Array<{ rule_id: string; title: string }>;
}

/** 画像草稿：productType 允许未选 */
type ProfileDraft = Omit<Partial<ProjectProfile>, "productType"> & { productType?: ProductType };

const AUDIENCE_PRESETS = [
  "pcos",
  "irregular",
  "postpartum",
  "perimenopause",
  "advanced_age",
  "trying_conceive",
  "general",
];
const AUDIENCE_LABELS: Record<string, string> = {
  pcos: "PCOS 多囊人群",
  irregular: "周期不规律",
  postpartum: "产后恢复期",
  perimenopause: "围绝经期",
  advanced_age: "高龄",
  trying_conceive: "备孕中",
  general: "一般用户",
};

function Chips({
  options,
  labels,
  selected,
  onToggle,
}: {
  options: readonly string[];
  labels: Record<string, string>;
  selected: readonly string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 ${
              active
                ? "border-brand-600 bg-brand-50 font-medium text-brand-700 ring-1 ring-brand-200"
                : "border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            {labels[opt] ?? opt}
          </button>
        );
      })}
    </div>
  );
}

const toggle = <T,>(arr: T[], v: T): T[] => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

export default function CreateProjectWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [profile, setProfile] = useState<ProfileDraft>({});
  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  const [packInfos, setPackInfos] = useState<PackInfo[]>([]);
  const [selectedPacks, setSelectedPacks] = useState<Set<RulePackCode>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && packInfos.length === 0) {
      fetch("/api/rule-packs")
        .then((r) => r.json())
        .then((d) => setPackInfos(d.packs ?? []))
        .catch(() => undefined);
    }
  }, [open, packInfos.length]);

  if (!open) return null;

  const gotoRecommend = async () => {
    setError("");
    setBusy(true);
    const res = await fetch("/api/rule-packs/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "推荐失败");
      return;
    }
    const d = await res.json();
    const rs: Recommendation[] = d.recommendations ?? [];
    setRecs(rs);
    setSelectedPacks(new Set(rs.map((r) => r.packCode)));
    setStep(3);
  };

  const createProject = async () => {
    setBusy(true);
    setError("");
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description,
        profile,
        packs: [...selectedPacks].map((packCode) => ({ packCode, selected: true })),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "创建失败");
      return;
    }
    router.push(`/projects/${data.project.id}?step=materials`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/25 px-4 py-10 backdrop-blur-md">
      <Card data-tour="create-project-dialog" className="w-full max-w-xl rounded-[24px] p-6 shadow-card-hover">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">创建审查项目</h2>
          <Button size="sm" variant="ghost" onClick={onClose}>
            关闭
          </Button>
        </div>
        {/* 三段式步骤进度：填充轨 + 当前步标签（替代旧的纯文字计数） */}
        <div className="mt-3" aria-label={`步骤 ${step} / 3`}>
          <div className="flex gap-1.5">
            {[1, 2, 3].map((s) => (
              <span
                key={s}
                className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                  s <= step ? "bg-brand-600" : "bg-neutral-200"
                }`}
              />
            ))}
          </div>
          <p className="mt-1.5 text-xs text-neutral-400">
            {["基本信息", "产品画像", "规则包确认"][step - 1]} · 填写产品画像以获得规则包推荐
          </p>
        </div>

        {error && (
          <div className="mt-3">
            <Banner kind="error">{error}</Banner>
          </div>
        )}

        {/* 步骤 1：基本信息 */}
        {step === 1 && (
          <div key="s1" className="animate-fade-in-up mt-4 space-y-3">
            <Input
              data-tour="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="项目名称，如：悦历经期记录 App 审查"
            />
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简要描述（可选）"
            />
            <div className="flex justify-end">
              <Button disabled={!name.trim()} onClick={() => setStep(2)}>
                下一步：产品画像
              </Button>
            </div>
          </div>
        )}

        {/* 步骤 2：产品画像 */}
        {step === 2 && (
          <div key="s2" className="animate-fade-in-up mt-4 space-y-4 text-sm">
            <div>
              <label className="text-xs font-medium text-neutral-600">产品类型 *</label>
              <Select
                className="mt-1"
                value={profile.productType ?? ""}
                onChange={(e) => setProfile({ ...profile, productType: e.target.value as ProductType })}
              >
                <option value="" disabled>
                  请选择
                </option>
                {(Object.keys(PRODUCT_TYPE_LABELS) as ProductType[]).map((k) => (
                  <option key={k} value={k}>
                    {PRODUCT_TYPE_LABELS[k]}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-neutral-600">目标人群</label>
              <div className="mt-1">
                <Chips
                  options={AUDIENCE_PRESETS}
                  labels={AUDIENCE_LABELS}
                  selected={profile.targetAudience ?? []}
                  onToggle={(v) =>
                    setProfile({ ...profile, targetAudience: toggle(profile.targetAudience ?? [], v) })
                  }
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-neutral-600">
                敏感数据（决定隐私类规则的适用范围）
              </label>
              <div className="mt-1">
                <Chips
                  options={Object.keys(SENSITIVE_DATA_LABELS)}
                  labels={SENSITIVE_DATA_LABELS}
                  selected={profile.sensitiveData ?? []}
                  onToggle={(v) =>
                    setProfile({
                      ...profile,
                      sensitiveData: toggle(profile.sensitiveData ?? [], v as SensitiveDataKind),
                    })
                  }
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-neutral-600">涉及角色</label>
              <div className="mt-1">
                <Chips
                  options={Object.keys(USER_ROLE_LABELS)}
                  labels={USER_ROLE_LABELS}
                  selected={profile.userRoles ?? []}
                  onToggle={(v) =>
                    setProfile({ ...profile, userRoles: toggle(profile.userRoles ?? [], v as UserRole) })
                  }
                />
              </div>
            </div>

            <Input
              value={(profile.coreTasks ?? []).join("、")}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  coreTasks: e.target.value
                    .split(/[、,，]/)
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="核心任务，用顿号分隔：周期记录、排卵预测、锁屏提醒"
            />
            <Input
              value={(profile.healthClaims ?? []).join("、")}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  healthClaims: e.target.value
                    .split(/[、,，]/)
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="健康主张，用顿号分隔：预测易孕期、自动生成经期建议"
            />

            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                ← 上一步
              </Button>
              <Button disabled={!profile.productType || busy} onClick={gotoRecommend}>
                {busy ? "推荐中…" : "获取规则包推荐"}
              </Button>
            </div>
          </div>
        )}

        {/* 步骤 3：推荐结果确认 */}
        {step === 3 && recs && (
          <div key="s3" className="animate-fade-in-up mt-4 space-y-3">
            <Banner kind="info" title="系统依据画像确定性推荐以下规则包">
              可取消勾选或追加任意规则包；推荐原因将写入项目档案并进入报告溯源链。
            </Banner>
            {(["BASE", "MENS", "PREG", "HDAI"] as RulePackCode[]).map((code) => {
              const rec = recs.find((r) => r.packCode === code);
              const info = packInfos.find((p) => p.packCode === code);
              const checked = selectedPacks.has(code);
              return (
                <label
                  key={code}
                  className={`block cursor-pointer rounded-lg border p-3 transition-[border-color,background-color,box-shadow,transform] duration-200 hover:-translate-y-px ${
                    checked
                      ? "border-brand-300 bg-brand-50/40 shadow-focus ring-1 ring-brand-100"
                      : "border-neutral-200 bg-white hover:bg-neutral-50"
                  }`}
                >
                  <span className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1 accent-brand-600"
                      checked={checked}
                      onChange={() =>
                        setSelectedPacks((prev) => {
                          const next = new Set(prev);
                          if (next.has(code)) next.delete(code);
                          else next.add(code);
                          return next;
                        })
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <b className="text-sm">{PACK_META[code].label}</b>
                        <Badge color={checked ? "pink" : "neutral"}>{info?.total ?? "-"} 条规则</Badge>
                        {rec ? (
                          <Badge color="blue">
                            <Sparkles className="mr-0.5 inline h-3 w-3" aria-hidden />
                            系统推荐
                          </Badge>
                        ) : (
                          <Badge color="neutral">未命中画像</Badge>
                        )}
                        {checked && (
                          <Badge color="green">
                            <Check className="mr-0.5 inline h-3 w-3" aria-hidden />
                            已选
                          </Badge>
                        )}
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-neutral-500">
                        {rec?.reason ?? PACK_META[code].desc}
                      </span>
                      {info?.sampleRules?.length ? (
                        <span className="mt-1 block text-[11px] text-neutral-400">
                          示例：{info.sampleRules.map((s) => `${s.rule_id} ${s.title}`).join(" ｜ ")}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </label>
              );
            })}
            <div className="flex items-center justify-between pt-1">
              <Button variant="ghost" size="sm" onClick={() => setStep(2)}>
                ← 上一步
              </Button>
              <Button disabled={!selectedPacks.size || busy} onClick={createProject}>
                {busy ? (
                  <>
                    <Spinner label="" />
                    创建中…
                  </>
                ) : (
                  "创建项目并上传材料"
                )}
              </Button>
            </div>
          </div>
        )}

        <p className="mt-4 flex items-center gap-1 text-[11px] text-neutral-400">
          <CircleAlert className="inline h-3 w-3" aria-hidden />
          上传的材料将发送至模型服务方用于审查分析；删除项目时联动删除全部产物。
        </p>
      </Card>
    </div>
  );
}
