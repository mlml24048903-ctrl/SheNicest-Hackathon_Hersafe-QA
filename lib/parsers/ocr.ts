// OCR 中文兜底（PRD F1.4 / 降级矩阵：OCR 失败允许人工补充）
// Tesseract.js 动态加载，首次运行需联网下载语言包；失败时返回结构化错误供上层引导。

export interface OcrResult {
  ok: boolean;
  text?: string;
  /** 失败原因（上层据此引导用户人工补充，而非静默失败） */
  error?: string;
}

export async function ocrImage(absPath: string): Promise<OcrResult> {
  try {
    const { createWorker } = await import("tesseract.js");
    // chi_sim 中文 + eng 英文混合识别
    const worker = await createWorker(["chi_sim", "eng"]);
    try {
      const { data } = await worker.recognize(absPath);
      const text = (data.text ?? "").replace(/\s+/g, " ").trim();
      return { ok: text.length > 0, text: text || undefined };
    } finally {
      await worker.terminate();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `OCR 识别失败：${msg}（可人工补充文本）` };
  }
}
