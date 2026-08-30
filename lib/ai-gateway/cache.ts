// 网关横切：输入哈希缓存（PRD §5.6 / §7.1）
// 相同材料 + 模型 + Prompt + 规则 + Schema 版本 → 按输入 Hash 命中，不重复调用。

import { createHash } from "crypto";
import { prisma } from "@/lib/db";

/** 计算调用输入哈希（版本五要素 + 载荷） */
export function computeInputHash(
  functionName: string,
  model: string,
  promptVersion: string,
  ruleVersion: string,
  schemaVersion: string,
  payload: unknown,
): string {
  return createHash("sha256")
    .update(
      [functionName, model, promptVersion, ruleVersion, schemaVersion, JSON.stringify(payload)].join(
        "\n---\n",
      ),
    )
    .digest("hex");
}

/** 查缓存：命中返回历史结果（须为已采用的结果），未命中返回 null */
export async function findCachedResult(inputHash: string): Promise<unknown | null> {
  const hit = await prisma.modelInvocation.findFirst({
    where: { inputHash, adopted: true, cacheHit: false },
    orderBy: { createdAt: "desc" },
  });
  return hit?.result ?? null;
}
