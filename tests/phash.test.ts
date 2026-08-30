// pHash 单元测试：确定性、同图零距离、轻微改动小距离、结构差异大距离
import { describe, expect, it } from "vitest";
import { phash, hamming, isLikelyDuplicate, type RawImage } from "@/lib/parsers/phash";
import { saveAndParseImage } from "@/lib/parsers/image";
import sharp from "sharp";

/** 构造合成 RGBA 图像 */
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

describe("pHash 感知哈希", () => {
  it("确定性：同输入同哈希", () => {
    const img = makeImage(64, 64, (x, y) => [(x * 4) % 256, (y * 4) % 256, 128]);
    expect(phash(img)).toBe(phash(img));
    expect(phash(img)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("相同图片 → 汉明距离 0", () => {
    const a = makeImage(96, 96, (x, y) => [(x * 2) % 256, (y * 2) % 256, (x + y) % 256]);
    const b = makeImage(96, 96, (x, y) => [(x * 2) % 256, (y * 2) % 256, (x + y) % 256]);
    expect(hamming(phash(a), phash(b))).toBe(0);
  });

  it("轻微改动（4/4096 像素灰度微扰）→ 小距离且判为重复", () => {
    // 频谱分散的平滑图（正弦调光，贴近真实截图的低频分布），哈希对微扰稳健
    const smooth = (x: number, y: number): number =>
      Math.max(0, Math.min(255, Math.round(128 + 50 * Math.sin(x * 0.35) * Math.cos(y * 0.25))));
    const base = (x: number, y: number): [number, number, number] => {
      const s = smooth(x, y);
      return [s, s, s];
    };
    const a = makeImage(64, 64, base);
    const b = makeImage(64, 64, (x, y) => {
      if (
        (x === 10 && y === 10) ||
        (x === 11 && y === 10) ||
        (x === 10 && y === 11) ||
        (x === 30 && y === 40)
      ) {
        const s = Math.min(255, smooth(x, y) + 12);
        return [s, s, s];
      }
      return base(x, y);
    });
    const d = hamming(phash(a), phash(b));
    expect(d).toBeLessThanOrEqual(12);
    expect(isLikelyDuplicate(phash(a), phash(b))).toBe(true);
  });

  it("结构反转 → 大距离且不判为重复", () => {
    const a = makeImage(64, 64, (x) => [(x * 4) % 256, (x * 4) % 256, (x * 4) % 256]);
    const b = makeImage(64, 64, (x) => [255 - ((x * 4) % 256), 255 - ((x * 4) % 256), 255 - ((x * 4) % 256)]);
    const d = hamming(phash(a), phash(b));
    expect(d).toBeGreaterThanOrEqual(20);
    expect(isLikelyDuplicate(phash(a), phash(b))).toBe(false);
  });

  it("纯色图 → 稳定哈希（全低频系数相等）", () => {
    const solid = makeImage(64, 64, () => [200, 200, 200]);
    expect(phash(solid)).toBe(phash(makeImage(64, 64, () => [200, 200, 200])));
  });
});

describe("pHash × sharp 集成（真实图片字节 → 去重管线）", () => {
  // 回归防护：raw 输出通道数错配曾导致所有图片哈希全零（距离恒 0 → 全部误判重复）
  it("不同内容图片哈希非全零且互不判重", async () => {
    const toJpeg = async (svg: string) =>
      sharp(Buffer.from(svg)).flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer();

    const a = await saveAndParseImage(
      "it-a.png",
      await toJpeg(
        `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#fff"/><rect x="40" y="60" width="120" height="50" fill="#111"/><rect x="170" y="200" width="100" height="150" fill="#2563eb"/></svg>`,
      ),
    );
    const b = await saveAndParseImage(
      "it-b.png",
      await toJpeg(
        `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#0b1220"/><circle cx="220" cy="80" r="40" fill="#334155"/><rect x="30" y="160" width="200" height="60" fill="#fef3c7"/></svg>`,
      ),
    );

    expect(a.pHash).not.toBe("0000000000000000");
    expect(b.pHash).not.toBe("0000000000000000");
    expect(hamming(a.pHash, b.pHash)).toBeGreaterThan(6);
    expect(isLikelyDuplicate(a.pHash, b.pHash)).toBe(false);
  });

  it("同一图片重复上传 → 哈希一致判重", async () => {
    const bytes = await sharp(
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="280"><rect width="280" height="280" fill="#fafafa"/><rect x="60" y="40" width="160" height="90" fill="#be185d"/></svg>`,
      ),
    )
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 85 })
      .toBuffer();
    const a = await saveAndParseImage("dup-1.png", bytes);
    const b = await saveAndParseImage("dup-2.png", bytes);
    expect(hamming(a.pHash, b.pHash)).toBe(0);
    expect(isLikelyDuplicate(a.pHash, b.pHash)).toBe(true);
  });
});
