#!/usr/bin/env node
// 将 package.json 的 version 同步到 theme.yaml 的 spec.version。
// 主题包名与版本号取自 theme.yaml，打包文件名依赖 spec.version，
// 手动维护两处版本号容易漂移，因此构建前统一以 package.json 为准。
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const themeDir = join(scriptDir, "..");

const packageJsonPath = join(themeDir, "package.json");
const themeYamlPath = join(themeDir, "theme.yaml");

const { version } = JSON.parse(readFileSync(packageJsonPath, "utf8"));
if (typeof version !== "string" || version.length === 0) {
  console.error("package.json 中缺少有效的 version 字段");
  process.exit(1);
}

const themeYaml = readFileSync(themeYamlPath, "utf8");

// spec.version 位于 spec: 块内，缩进为 2 个空格
const specIndex = themeYaml.indexOf("\nspec:\n");
if (specIndex === -1) {
  console.error("theme.yaml 中未找到 spec 字段");
  process.exit(1);
}

const versionPattern = /^ {2}version:[ \t]*(.+)$/m;
const match = themeYaml.slice(specIndex).match(versionPattern);
if (!match) {
  console.error("theme.yaml 中未找到 spec.version 字段");
  process.exit(1);
}

const currentVersion = match[1].trim().replace(/^["']|["']$/g, "");
if (currentVersion === version) {
  console.log(`theme.yaml 版本已是 ${version}，无需更新`);
  process.exit(0);
}

const updated = themeYaml.replace(versionPattern, `  version: ${version}`);
writeFileSync(themeYamlPath, updated, "utf8");
console.log(`theme.yaml 版本已同步：${currentVersion} -> ${version}`);
