import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 服务端原生依赖不入打包，避免 sharp/playwright/pdfjs 等在服务端运行时报错
  serverExternalPackages: ["sharp", "playwright", "pdfjs-dist", "mammoth", "tesseract.js", "@prisma/client"],
  experimental: {
    // 服务端动作超时放宽：解析管线可能较慢
    serverActions: { bodySizeLimit: "60mb" },
  },
};

export default nextConfig;
