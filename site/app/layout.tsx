import type { Metadata } from "next";
import "./globals.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://claude-code-zh-cn.changfenhuang.chatgpt.site";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Claude Code 中文本地化",
    template: "%s · Claude Code 中文本地化",
  },
  description:
    "一条命令，把 Claude Code 的终端界面、等待提示、系统通知和默认回复切换为简体中文。",
  openGraph: {
    title: "Claude Code 中文本地化",
    description: "让终端里的 AI 编程助手说中文。",
    images: [`${basePath}/github-social-preview.png`],
  },
  icons: {
    icon: `${basePath}/favicon.svg`,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
