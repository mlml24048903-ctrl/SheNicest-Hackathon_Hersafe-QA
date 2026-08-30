// 图片解析：压缩、裁切适配、pHash 去重（PRD F1.4，全部确定性程序，不调用 AI）
import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";
import { phash } from "@/lib/parsers/phash";
import type { RawImage } from "@/lib/parsers/phash";
import { UPLOAD_DIR } from "@/lib/config";

export interface ParsedImage {
  storagePath: string; // 压缩产物相对路径
  width: number;
  height: number;
  pHash: string;
}

/**
 * 保存并压缩截图：
 * - 长边限制 1600px（演示足够，控制存储与模型输入体积）
 * - 输出 JPEG quality 82（PNG 截图转 JPEG 体积更小；透明底铺白）
 * - 同步计算 pHash（去重键）
 */
export async function saveAndParseImage(fileName: string, bytes: Buffer): Promise<ParsedImage> {
  // 透明通道铺白，避免 PNG 透明底导致边缘检测异常
  const pipeline = sharp(bytes).flatten({ background: "#ffffff" }).rotate();
  const meta = await pipeline.metadata();
  const resized =
    Math.max(meta.width ?? 0, meta.height ?? 0) > 1600
      ? pipeline.resize({ width: 1600, height: 1600, fit: "inside" })
      : pipeline;

  const outName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${path
    .basename(fileName)
    .replace(/[^\w.-]/g, "_")}.jpg`;
  // 安全校验：输出必须落在上传目录内（防御 basename 规则未来被改动导致的目录逃逸）
  const uploadRoot = path.resolve(UPLOAD_DIR);
  const outPath = path.resolve(uploadRoot, outName);
  if (!outPath.startsWith(uploadRoot + path.sep)) {
    throw new Error("非法的图片输出路径");
  }
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const outBuffer = await resized.jpeg({ quality: 82 }).toBuffer();
  await fs.writeFile(outPath, outBuffer);

  // pHash 基于压缩后图片计算（ensureAlpha 保证 raw 输出为 4 通道 RGBA，
  // 否则 removeAlpha 后是 3 通道，按 4 通道索引会越界读出 NaN 导致全零哈希）
  const { data, info } = await sharp(outBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const raw: RawImage = { width: info.width, height: info.height, data };
  const hash = phash(raw);

  return {
    storagePath: path.relative(process.cwd(), outPath).replace(/\\/g, "/"),
    width: info.width,
    height: info.height,
    pHash: hash,
  };
}

/** 读取图片为原始像素（图层检测输入；ensureAlpha 统一 4 通道 RGBA） */
export async function readImageRaw(storagePath: string): Promise<RawImage> {
  // 安全校验：storagePath 来自外部输入，禁止越出上传目录（路径穿越防护）
  const uploadRoot = path.resolve(process.cwd(), UPLOAD_DIR);
  const abs = path.resolve(process.cwd(), storagePath);
  if (!abs.startsWith(uploadRoot + path.sep)) {
    throw new Error(`非法的图片存储路径: ${storagePath}`);
  }
  const { data, info } = await sharp(abs).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data };
}
