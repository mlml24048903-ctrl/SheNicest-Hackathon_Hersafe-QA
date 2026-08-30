// 项目 CRUD：GET 列表 / POST 创建（v2：携带产品画像与所选规则包，推荐原因服务端兜底计算）
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { PackSelectionSchema, PACK_META, ProjectProfileSchema, type RulePackCode } from "@/lib/types";
import { recommendPacks } from "@/lib/services/rule-service";
import { RULESET_VERSION } from "@/lib/rules";

export const runtime = "nodejs";

export async function GET() {
  const projects = await prisma.auditProject.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { artifacts: true, todos: true, findings: true } },
      packs: true,
    },
  });
  return NextResponse.json({
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      status: p.status,
      productType: p.productType,
      packCodes: p.packs.filter((x) => x.selectedByUser).map((x) => x.packCode),
      createdAt: p.createdAt,
      counts: p._count,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.name || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "项目名称必填" }, { status: 400 });
  }

  // 画像校验（可选：未提供时不落画像字段，兼容旧客户端）
  let profile: ReturnType<typeof ProjectProfileSchema.parse> | null = null;
  if (body.profile) {
    const parsedProfile = ProjectProfileSchema.safeParse(body.profile);
    if (!parsedProfile.success) {
      return NextResponse.json(
        {
          error: `产品画像非法：${parsedProfile.error.issues[0]?.path.join(".")} ${parsedProfile.error.issues[0]?.message}`,
        },
        { status: 400 },
      );
    }
    profile = parsedProfile.data;
  }

  // 勾选的规则包（可选）；无勾选且无画像时默认仅 BASE
  const selectedCodesRaw: RulePackCode[] = [];
  if (Array.isArray(body.packs)) {
    for (const p of body.packs as unknown[]) {
      const r = PackSelectionSchema.safeParse(p);
      if (r.success && r.data.selected) selectedCodesRaw.push(r.data.packCode);
    }
  }

  // 服务端兜底重算推荐（防客户端篡改推荐原因）
  const recs = profile ? recommendPacks(profile) : [];
  const finalPacks = selectedCodesRaw.length
    ? [...new Set(selectedCodesRaw)].sort()
    : (["BASE"] as RulePackCode[]);

  const project = await prisma.$transaction(async (tx) => {
    const created = await tx.auditProject.create({
      data: {
        name: body.name.trim().slice(0, 100),
        description: typeof body.description === "string" ? body.description.slice(0, 500) : null,
        ...(profile
          ? {
              productType: profile.productType,
              targetAudience: profile.targetAudience,
              coreTasks: profile.coreTasks,
              healthClaims: profile.healthClaims,
              sensitiveData: profile.sensitiveData,
              userRoles: profile.userRoles,
            }
          : {}),
      },
    });

    await tx.projectPack.createMany({
      data: finalPacks.map((code) => {
        const rec = recs.find((r) => r.packCode === code);
        return {
          projectId: created.id,
          packCode: code,
          ruleSetVersion: RULESET_VERSION,
          reason: rec?.reason ?? `${PACK_META[code]?.label ?? code}：由用户在创建时手动勾选。`,
          recommended: Boolean(rec),
          selectedByUser: true,
        };
      }),
    });

    return created;
  });

  return NextResponse.json({ project }, { status: 201 });
}
