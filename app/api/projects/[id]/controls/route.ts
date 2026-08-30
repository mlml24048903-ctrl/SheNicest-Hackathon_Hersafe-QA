// 图层人工修正与五选项确认流（PRD F2.3/F2.5/F2.6/F2.7）
// op: add（人工框选）/ update（边界/类型修正）/ delete / confirm（五选项）
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ControlCandidateSchema, type ControlCandidate } from "@/lib/types";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** 读取当前 controls */
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const pkg = await prisma.evidencePackage.findUnique({ where: { projectId: id } });
  if (!pkg) return NextResponse.json({ error: "证据包不存在" }, { status: 404 });
  return NextResponse.json({ controls: pkg.controls as ControlCandidate[] });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const pkg = await prisma.evidencePackage.findUnique({ where: { projectId: id } });
  if (!pkg) return NextResponse.json({ error: "证据包不存在" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const op = body?.op as string;
  const controls = [...((pkg.controls as ControlCandidate[]) ?? [])];

  const parse = ControlCandidateSchema.safeParse(body?.control);
  const control = parse.success ? parse.data : null;

  try {
    switch (op) {
      case "add": {
        // 人工框选（PRD F2.3）：origin=manual
        if (!control) return NextResponse.json({ error: "图层字段不合法" }, { status: 400 });
        const manual: ControlCandidate = { ...control, id: `manual-${Date.now()}`, origin: "manual" };
        controls.push(manual);
        break;
      }
      case "update": {
        // 边界修正 / 类型修改
        const idx = controls.findIndex((c) => c.id === body?.control?.id);
        if (idx === -1) return NextResponse.json({ error: "图层不存在" }, { status: 404 });
        if (!control) return NextResponse.json({ error: "图层字段不合法" }, { status: 400 });
        controls[idx] = control;
        break;
      }
      case "delete": {
        const idx = controls.findIndex((c) => c.id === body?.controlId);
        if (idx === -1) return NextResponse.json({ error: "图层不存在" }, { status: 404 });
        controls.splice(idx, 1);
        break;
      }
      case "confirm": {
        // 五选项确认流（PRD F2.5）+ 状态同步（F2.7）
        const idx = controls.findIndex((c) => c.id === body?.controlId);
        if (idx === -1) return NextResponse.json({ error: "图层不存在" }, { status: 404 });
        const confirmation = body?.confirmation as ControlCandidate["confirmation"];
        if (!confirmation) return NextResponse.json({ error: "缺少确认选项" }, { status: 400 });
        const c = controls[idx];
        c.confirmation = confirmation;
        // 状态映射：protected→已有保护；design_exists_no_shot→需补充证据；其余→未确认
        c.status =
          confirmation === "protected"
            ? "protected"
            : confirmation === "design_exists_no_shot"
              ? "needs_evidence"
              : "unconfirmed";
        break;
      }
      default:
        return NextResponse.json({ error: "未知操作" }, { status: 400 });
    }

    await prisma.evidencePackage.update({
      where: { projectId: id },
      data: { controls, updatedAt: new Date() },
    });
    return NextResponse.json({ controls });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "操作失败" }, { status: 500 });
  }
}
