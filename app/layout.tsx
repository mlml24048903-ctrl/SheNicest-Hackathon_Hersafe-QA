import type { Metadata, Viewport } from "next";
import AppShell from "@/components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "她测 HerSafe QA · 产品风险审查",
  description: "面向产品经理与产品设计师的证据式产品风险审查工作台。",
};

export const viewport: Viewport = { themeColor: "#ffffff" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen antialiased"><AppShell>{children}</AppShell></body>
    </html>
  );
}
