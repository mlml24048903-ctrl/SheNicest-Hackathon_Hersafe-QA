// 规则包推荐：画像 → 确定性推荐结果。前端展示用；创建项目时服务端会再算一次兜底，防止客户端篡改。
import { NextRequest, NextResponse } from "next/server";
import { ProjectProfileSchema } from "@/lib/types";
import { recommendPacks } from "@/lib/services/rule-service";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = ProjectProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: `画像数据非法：${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}` },
      { status: 400 },
    );
  }
  return NextResponse.json({
    recommendations: recommendPacks(parsed.data),
    profile: parsed.data,
  });
}
