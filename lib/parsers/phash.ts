// 感知哈希（pHash）—— 纯函数实现，可单测，不依赖 sharp
// 用途：上传材料去重（PRD F1.4/F1.6：相同内容 pHash 命中不重复计入证据包）
// 算法：亮度降采样 32×32 → DCT-II → 取低频 8×8（去 DC）→ 中位数阈值 → 64bit

export interface RawImage {
  width: number;
  height: number;
  /** RGBA 像素，长度 = width * height * 4 */
  data: Uint8ClampedArray | Uint8Array;
}

/** 亮度通道提取 + 盒式降采样到 size×size（纯确定性） */
export function downsampleLuminance(img: RawImage, size = 32): Float64Array {
  const out = new Float64Array(size * size);
  const { width, height, data } = img;
  for (let by = 0; by < size; by++) {
    const y0 = Math.floor((by * height) / size);
    const y1 = Math.max(y0 + 1, Math.floor(((by + 1) * height) / size));
    for (let bx = 0; bx < size; bx++) {
      const x0 = Math.floor((bx * width) / size);
      const x1 = Math.max(x0 + 1, Math.floor(((bx + 1) * width) / size));
      let sum = 0;
      let n = 0;
      for (let y = y0; y < y1 && y < height; y++) {
        for (let x = x0; x < x1 && x < width; x++) {
          const i = (y * width + x) * 4;
          // ITU-R BT.601 亮度
          sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          n++;
        }
      }
      out[by * size + bx] = n > 0 ? sum / n : 0;
    }
  }
  return out;
}

/** 一维 DCT-II（朴素 O(n²)，n=32 足够快） */
function dct1d(input: Float64Array, n: number): Float64Array {
  const out = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += input[i] * Math.cos((Math.PI * (2 * i + 1) * k) / (2 * n));
    }
    out[k] = sum * (k === 0 ? Math.SQRT1_2 : 1);
  }
  return out;
}

/** 二维 DCT（行、列分离） */
export function dct2d(matrix: Float64Array, n = 32): Float64Array {
  const tmp = new Float64Array(n * n);
  const row = new Float64Array(n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) row[x] = matrix[y * n + x];
    const r = dct1d(row, n);
    for (let x = 0; x < n; x++) tmp[y * n + x] = r[x];
  }
  const out = new Float64Array(n * n);
  const col = new Float64Array(n);
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) col[y] = tmp[y * n + x];
    const c = dct1d(col, n);
    for (let y = 0; y < n; y++) out[y * n + x] = c[y];
  }
  return out;
}

/** 计算 64bit pHash，返回 16 位 hex 字符串 */
export function phash(img: RawImage): string {
  const N = 32;
  const lum = downsampleLuminance(img, N);
  const freq = dct2d(lum, N);
  // 取左上 8×8 低频块，跳过 [0,0] DC 分量，得到 63 个系数 + 补 DC 占位共 64 bit
  const coeffs: number[] = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if (x === 0 && y === 0) continue;
      coeffs.push(freq[y * N + x]);
    }
  }
  const sorted = [...coeffs].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  // 63 位 + DC 位固定 0 = 64 bit
  let bits = "0";
  for (const c of coeffs) bits += c > median ? "1" : "0";
  // bit 串 → hex（前补 0 至 64 位）
  bits = bits.padStart(64, "0").slice(0, 64);
  let hex = "";
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

/** 汉明距离（两个等长 hex 字符串） */
export function hamming(a: string, b: string): number {
  if (a.length !== b.length) return Infinity;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      dist += x & 1;
      x >>= 1;
    }
  }
  return dist;
}

/** 判定疑似重复（阈值 ≤10/64bit 视为同图，工程经验值可配置） */
export function isLikelyDuplicate(a: string, b: string, threshold = 10): boolean {
  return hamming(a, b) <= threshold;
}
