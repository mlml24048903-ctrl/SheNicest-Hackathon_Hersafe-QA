// 演示种子数据（女性健康版）：通过真实代码路径（ingest → 图层检测 → 初始分析 → 对话 → 确认写入）
// 构造「悦历经期记录 App」完整可演示项目。运行：pnpm db:seed
// 注意：种子流程会执行真实初步分析，因此需要配置 STEPFUN_API_KEY。

process.env.DATABASE_URL ||= "file:./dev.db";

import { prisma } from "@/lib/db";
import { ingestArtifacts, cleanupProjectFiles } from "@/lib/services/ingest";
import { runInitialAnalysis } from "@/lib/services/analysis";
import { sendUserMessage } from "@/lib/services/todo-chat";
import { confirmEvidenceUpdate } from "@/lib/services/evidence-update";
import { recommendPacks } from "@/lib/services/rule-service";
import { getAllRules } from "@/lib/rules";
import { RULESET_VERSION } from "@/lib/rules/data/v1/types";
import sharp from "sharp";

/** 用 SVG 生成模拟产品截图（含按钮/开关/卡片，供图层检测引擎真实计算） */
async function makeScreenshot(elements: string, h = 800): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="${h}">
    <rect width="480" height="${h}" fill="#ffffff"/>
    <rect x="0" y="0" width="480" height="64" fill="#fdf2f8"/>
    <text x="24" y="40" font-size="20" fill="#0f172a">悦历 · 设置</text>
    ${elements}
  </svg>`;
  return sharp(Buffer.from(svg)).flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer();
}

const SETTINGS_SHOT = `
  <rect x="24" y="96" width="432" height="72" rx="8" fill="#fce7f3" stroke="#fbcfe8"/>
  <text x="44" y="140" font-size="16" fill="#334155">提醒推送 · 锁屏显示内容</text>
  <rect x="360" y="120" width="48" height="24" rx="12" fill="#22c55e"/>
  <rect x="24" y="192" width="432" height="72" rx="8" fill="#fce7f3" stroke="#fbcfe8"/>
  <text x="44" y="236" font-size="16" fill="#334155">日历同步到系统</text>
  <rect x="360" y="216" width="48" height="24" rx="12" fill="#94a3b8"/>
  <rect x="24" y="288" width="432" height="72" rx="8" fill="#fce7f3" stroke="#fbcfe8"/>
  <text x="44" y="332" font-size="16" fill="#334155">伴侣查看权限</text>
  <rect x="360" y="312" width="48" height="24" rx="12" fill="#22c55e"/>
  <rect x="24" y="384" width="200" height="44" rx="8" fill="#ec4899"/>
  <text x="76" y="412" font-size="16" fill="#ffffff">删除我的数据</text>
  <rect x="24" y="460" width="432" height="180" rx="8" fill="#eff6ff" stroke="#bfdbfe"/>
  <text x="44" y="496" font-size="15" fill="#1d4ed8">排卵预测 · 固定28天模型</text>
  <rect x="44" y="520" width="392" height="40" rx="6" fill="#ffffff" stroke="#e2e8f0"/>
  <text x="60" y="546" font-size="13" fill="#475569">预测结果页：今天为安全期（无误差说明）</text>
  <rect x="44" y="572" width="150" height="36" rx="6" fill="#fee2e2"/>
  <text x="66" y="596" font-size="13" fill="#dc2626">清除预测缓存</text>
`;

const LOCK_SHOT = `
  <rect width="480" height="480" fill="#0b1220"/>
  <circle cx="400" cy="80" r="36" fill="#334155"/>
  <rect x="24" y="120" width="432" height="120" rx="12" fill="#1e293b"/>
  <text x="48" y="168" font-size="18" fill="#f8fafc">21:47</text>
  <text x="48" y="212" font-size="15" fill="#e2e8f0">悦历：排卵期已开始，适合安排备孕</text>
  <rect x="24" y="300" width="300" height="60" rx="10" fill="#fef3c7" stroke="#fcd34d"/>
  <text x="48" y="337" font-size="14" fill="#92400e">周期提示 · 第14天 · 黄体期临近</text>
  <rect x="350" y="380" width="106" height="76" rx="10" fill="#7c2d12"/>
`;

const DEMO_DOC = `# 悦历经期记录 App · 产品说明（演示样本文档）

## 提醒通知
锁屏通知默认显示完整健康内容；用户可在系统层面关闭通知，但应用内不提供单独的健康内容预览开关。
## 周期预测
采用固定 28 天周期模型输出「安全期/易孕期」，界面上直接给出今日安全期结论，暂不支持不规则周期设置。
## 目标模式
注册后默认进入「备孕」目标模式，开启伴侣共享入口。
## 数据删除
删除我的数据仅清空服务器原始记录；基于历史数据的用户标签（如备孕中）保留用于运营分析。`;

async function main() {
  const name = "演示 · 悦历经期记录 App 审查";
  // 幂等：先清掉旧演示项目（含文件）
  const old = await prisma.auditProject.findMany({ where: { name } });
  for (const p of old) {
    await cleanupProjectFiles(p.id);
    await prisma.auditProject.delete({ where: { id: p.id } });
  }

  // ===== 0) 规则库镜像入库（编写源在 lib/rules/data/v1）=====
  const rules = getAllRules();
  for (const r of rules) {
    await prisma.rule.upsert({
      where: { key: r.rule_id },
      create: {
        key: r.rule_id,
        packCode: r.pack,
        dimension: r.dimension,
        version: r.version,
        title: r.title,
        status: r.meta.draft ? "draft" : "reviewed",
        body: r as unknown as object,
      },
      update: {
        packCode: r.pack,
        dimension: r.dimension,
        version: r.version,
        title: r.title,
        body: r as unknown as object,
      },
    });
  }
  console.log(`✅ 规则库镜像入库：${rules.length} 条（RULESET ${RULESET_VERSION}）`);

  // ===== 1) 创建项目（带画像 + 规则包推荐，复用 API 同款确定性逻辑）=====
  const profile = {
    productType: "period_tracking" as const,
    targetAudience: ["trying_conceive", "irregular"],
    coreTasks: ["周期记录", "notification", "predict"],
    healthClaims: ["预测易孕期"],
    sensitiveData: ["cycle", "sexual_life"] as never,
    userRoles: ["owner", "partner"] as never,
  };
  const recs = recommendPacks(profile);
  const project = await prisma.auditProject.create({
    data: {
      name,
      description: "女性健康版演示：截图+文档 → 图层 → 待办 → 对话 → 确认写入 → 报告",
      productType: profile.productType,
      targetAudience: profile.targetAudience as unknown as object,
      coreTasks: profile.coreTasks as unknown as object,
      healthClaims: profile.healthClaims as unknown as object,
      sensitiveData: profile.sensitiveData as unknown as object,
      userRoles: profile.userRoles as unknown as object,
      packs: {
        create: recs.map((r) => ({
          packCode: r.packCode,
          ruleSetVersion: RULESET_VERSION,
          reason: r.reason,
          recommended: true,
          selectedByUser: true,
        })),
      },
    },
  });
  console.log(`✅ 项目已创建：${project.id}（规则包：${recs.map((r) => r.packCode).join("/")}）`);

  // ===== 2) 上传材料（真实解析管线 + 图层检测）=====
  const result = await ingestArtifacts(project.id, {
    images: [
      { name: "settings-page.png", bytes: await makeScreenshot(SETTINGS_SHOT) },
      { name: "lockscreen.png", bytes: await makeScreenshot(LOCK_SHOT, 480) },
    ],
    docs: [{ name: "product-doc.md", text: DEMO_DOC, type: "md" }],
  });
  console.log(
    `✅ 材料入库：新增 ${result.created.length}、去重 ${result.deduped.length}、警告 ${result.warnings.length}`,
  );
  result.warnings.forEach((w) => console.warn(`   ⚠️ ${w.artifactRef}: ${w.message}`));

  const pkg = await prisma.evidencePackage.findUnique({ where: { projectId: project.id } });
  console.log(
    `✅ 证据包：图层 ${((pkg?.controls as unknown[]) ?? []).length} 个、文档规则 ${((pkg?.docRules as unknown[]) ?? []).length} 条`,
  );

  // ===== 3) 初始分析（真实 StepFun 模型）=====
  const analysis = await runInitialAnalysis(project.id);
  analysis.warnings.forEach((w) => console.warn(`   🛈 校验剥离：${w}`));
  console.log(
    `✅ 初始分析（mode=${analysis.mode}${analysis.cached ? " · 缓存命中" : ""}）：待办 ${analysis.todoIds.length}、初始 Finding ${analysis.findingIds.length}`,
  );

  // ===== 4) 走完第一条待办的完整对话链 =====
  const firstTodo = analysis.todoIds[0];
  if (firstTodo) {
    const r1 = await sendUserMessage(firstTodo, "产品有对应设计，具体页面我没有截图");
    console.log(`✅ 对话第 1 轮：${r1.status}`);
    const r2 = await sendUserMessage(firstTodo, "产品已经有该设计，默认是隐藏内容的，已有保护机制");
    console.log(`✅ 对话第 2 轮：${r2.status}`);
    if (r2.status === "awaiting_confirm") {
      const outcome = await confirmEvidenceUpdate(firstTodo, "演示用户");
      console.log(
        `✅ EvidenceUpdate 已事务提交（${outcome.evidenceUpdateId.slice(-8)}），仅更新关联 Finding：${outcome.affectedFindingId}`,
      );
    }
  }

  console.log("\n🎉 演示数据就绪：pnpm dev 后访问 http://localhost:3000");
}

main()
  .catch((err) => {
    console.error("❌ seed 失败：", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
