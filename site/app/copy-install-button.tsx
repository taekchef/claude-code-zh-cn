"use client";

import { useState } from "react";

export function CopyInstallButton({
  command,
  prominent = false,
}: {
  command: string;
  prominent?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      className={prominent ? "copy-button prominent" : "copy-button"}
      type="button"
      onClick={copy}
      aria-live="polite"
    >
      {copied ? "已复制" : prominent ? "复制一行安装命令" : "复制"}
    </button>
  );
}
