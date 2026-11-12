#!/usr/bin/env node
// 打包前清理构建残留，避免本地无限累积：
// 1. dist/ 下历史版本的主题 zip（theme-package 不会自动清理旧包）
// 2. public/.DS_Store 与 templates/.DS_Store
//    （public/ 会被 vite 原样复制进 templates/，.DS_Store 会混进构建产物）
import { existsSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const themeDir = join(scriptDir, "..");

const distDir = join(themeDir, "dist");
if (existsSync(distDir)) {
  const stalePackages = readdirSync(distDir).filter((name) => name.endsWith(".zip"));
  for (const name of stalePackages) {
    rmSync(join(distDir, name), { force: true });
    console.log(`已清理旧主题包：dist/${name}`);
  }
}

for (const relativePath of ["public/.DS_Store", "templates/.DS_Store"]) {
  const target = join(themeDir, relativePath);
  if (existsSync(target)) {
    rmSync(target, { force: true });
    console.log(`已清理：${relativePath}`);
  }
}
