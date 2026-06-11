#!/usr/bin/env bash

compute_patch_revision() {
    local root="${1:?compute_patch_revision requires a root path}"

    node - "$root" <<'NODE'
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = process.argv[2];
const files = [
  "manifest.json",
  "patch-cli.sh",
  "patch-cli.js",
  "cli-translations.json",
  "bun-binary-io.js",
  "compute-patch-revision.sh",
  "locales/index.json",
  "locales/zh-CN/manifest.json",
  "locales/zh-CN/translations.json",
  "locales/zh-CN/verbs.json",
  "locales/zh-CN/tips.json",
  "locales/zh-CN/session-context.json",
  "locales/zh-CN/notifications.json",
];
const hash = crypto.createHash("sha256");

for (const file of files) {
  const target = path.join(root, file);
  if (!fs.existsSync(target)) continue;
  hash.update(file);
  hash.update("\0");
  hash.update(fs.readFileSync(target));
  hash.update("\0");
}

process.stdout.write(hash.digest("hex").slice(0, 16));
NODE
}
