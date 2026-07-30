import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Claude Code 中文本地化",
    template: "%s · Claude Code 中文本地化",
  },
  description:
    "一条命令，把 Claude Code 的终端界面、等待提示、系统通知和默认回复切换为简体中文。",
  icons: {
    icon: "/favicon.svg",
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
