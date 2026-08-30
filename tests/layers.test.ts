// 图层检测算法单测（ROADMAP T2.1：固定样本快照断言，带容差）
import { describe, expect, it } from "vitest";
import { detectControls, iou, contains, mergeRects, classifyRect, type Rect } from "@/lib/layers/detect";
import type { RawImage } from "@/lib/parsers/phash";

function makeImage(w: number, h: number, draw: (x: number, y: number) => [number, number, number]): RawImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = draw(x, y);
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

/** 白底 + 黑色按钮 + 蓝色卡片的模拟截图 */
function mockScreenshot(): RawImage {
  return makeImage(400, 300, (x, y) => {
    if (x >= 50 && x < 170 && y >= 200 && y < 240) return [20, 20, 20]; // 黑色按钮 (50,200,120×40)
    if (x >= 250 && x < 370 && y >= 20 && y < 200) return [59, 130, 246]; // 蓝色卡片 (250,20,120×180)
    return [255, 255, 255];
  });
}

describe("图层几何工具", () => {
  it("iou：重叠/相离/包含", () => {
    const a: Rect = { x: 0, y: 0, w: 100, h: 100 };
    expect(iou(a, { x: 50, y: 0, w: 100, h: 100 })).toBeCloseTo(1 / 3, 5);
    expect(iou(a, { x: 200, y: 200, w: 50, h: 50 })).toBe(0);
    expect(iou(a, { x: 25, y: 25, w: 50, h: 50 })).toBeCloseTo(0.25, 5); // 全包含：2500/10000
  });

  it("contains：80% 包含判定", () => {
    const a: Rect = { x: 0, y: 0, w: 100, h: 100 };
    expect(contains(a, { x: 10, y: 10, w: 80, h: 80 })).toBe(true);
    expect(contains(a, { x: 50, y: 50, w: 100, h: 100 })).toBe(false);
  });

  it("mergeRects：IoU 高的框合并并保留更大者", () => {
    const merged = mergeRects(
      [
        { x: 0, y: 0, w: 100, h: 100 },
        { x: 5, y: 5, w: 100, h: 100 },
        { x: 300, y: 300, w: 50, h: 50 },
      ],
      0.45,
    );
    expect(merged.length).toBe(2);
    expect(merged.some((r) => r.x === 0 && r.w === 100)).toBe(true);
  });

  it("classifyRect：类型启发式", () => {
    expect(classifyRect({ x: 0, y: 0, w: 40, h: 40 }, 400 * 300)).toBe("icon");
    expect(classifyRect({ x: 0, y: 0, w: 120, h: 40 }, 400 * 300)).toBe("button");
    expect(classifyRect({ x: 0, y: 0, w: 100, h: 300 }, 400 * 300)).toBe("input");
    expect(classifyRect({ x: 0, y: 0, w: 380, h: 280 }, 400 * 300)).toBe("panel");
  });
});

describe("detectControls 确定性检测", () => {
  it("合成截图能检出按钮与卡片（带容差的重叠断言）", () => {
    const controls = detectControls(mockScreenshot());
    expect(controls.length).toBeGreaterThan(0);

    // 按钮区域：存在候选框与之重叠面积 ≥ 60%
    const button: Rect = { x: 50, y: 200, w: 120, h: 40 };
    const hitBtn = controls.some((c) => {
      const inter =
        Math.max(0, Math.min(c.x + c.w, button.x + button.w) - Math.max(c.x, button.x)) *
        Math.max(0, Math.min(c.y + c.h, button.y + button.h) - Math.max(c.y, button.y));
      return inter / (button.w * button.h) >= 0.6;
    });
    expect(hitBtn).toBe(true);

    // 卡片区域：存在候选框与之重叠面积 ≥ 60%
    const card: Rect = { x: 250, y: 20, w: 120, h: 180 };
    const hitCard = controls.some((c) => {
      const inter =
        Math.max(0, Math.min(c.x + c.w, card.x + card.w) - Math.max(c.x, card.x)) *
        Math.max(0, Math.min(c.y + c.h, card.y + card.h) - Math.max(c.y, card.y));
      return inter / (card.w * card.h) >= 0.6;
    });
    expect(hitCard).toBe(true);
  });

  it("确定性：同输入两次运行结果完全一致", () => {
    const a = detectControls(mockScreenshot());
    const b = detectControls(mockScreenshot());
    expect(a).toEqual(b);
  });

  it("纯色图片不产生候选（无边缘无大色块对比）", () => {
    const solid = makeImage(300, 300, () => [240, 240, 240]);
    expect(detectControls(solid).length).toBe(0);
  });

  it("候选数量有上限保护（≤60）", () => {
    const striped = makeImage(800, 2000, (x) => ((x / 20) % 2 < 1 ? [0, 0, 0] : [255, 255, 255]));
    expect(detectControls(striped).length).toBeLessThanOrEqual(60);
  });
});
