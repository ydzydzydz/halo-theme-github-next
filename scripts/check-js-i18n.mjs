#!/usr/bin/env node
/**
 * 校验 JS 层 i18n 闭环：
 *
 *   src/js/**.ts 里的 messages.<组>.<键> 引用
 *     ⊆ src/partials/messages.html 注入的 window.__HALO_THEME_MESSAGES__
 *     ⊆ i18n/en.properties / i18n/default.properties 的词条
 *
 * 任何一环缺失，英文页面都会回落到中文默认值（因为 shared/i18n.ts 带了中文兜底），
 * 这种问题在浏览器里表现为「个别文案没翻译」，很容易漏掉，所以在此静态拦截。
 *
 * 注入块由 scripts/gen-messages.mjs 依据 i18n/*.properties 生成，
 * 这里只做交叉校验，不重复生成逻辑。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");

const read = (path) => readFileSync(join(root, path), "utf8");

/** 递归收集 src/js 下的 .ts 文件 */
const collectTsFiles = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (entry.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
};

/** 读取 properties 文件的键集合 */
const readPropertyKeys = (path) => {
  const keys = new Set();
  for (const line of read(path).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("!")) continue;
    const idx = trimmed.search(/[=:]/);
    if (idx === -1) continue;
    keys.add(trimmed.slice(0, idx).trim());
  }
  return keys;
};

const layout = read("src/partials/messages.html");

// 解析注入块：捕获 `<组>: {` 与 `键: /*[[#{i18n.key}]]*/ "值"` 的配对
const injected = new Map(); // "group.key" -> i18n key
{
  const blockStart = layout.indexOf("__HALO_THEME_MESSAGES__");
  const block =
    blockStart === -1 ? "" : layout.slice(blockStart, layout.indexOf("</script>", blockStart));
  const lines = block.split(/\r?\n/);
  let group = null;
  for (const line of lines) {
    const groupMatch = line.match(/^\s*([A-Za-z_][\w]*)\s*:\s*\{/);
    if (groupMatch) {
      group = groupMatch[1];
      continue;
    }
    const entryMatch = line.match(/^\s*([A-Za-z_][\w]*)\s*:\s*\/\*\[\[#\{([^}]+)\}\]\]\*\//);
    if (entryMatch && group) {
      injected.set(`${group}.${entryMatch[1]}`, entryMatch[2]);
    }
    if (/^\s*\}\s*,?\s*$/.test(line)) group = null;
  }
}

// 收集 JS 里的 messages.<组>.<键> 引用
const jsRefs = new Map(); // "group.key" -> [文件...]
for (const file of collectTsFiles(join(root, "src/js"))) {
  const content = readFileSync(file, "utf8");
  const rel = relative(root, file);
  const re = /\bmessages\s*\??\.\s*([A-Za-z_][\w]*)\s*\.\s*([A-Za-z_][\w]*)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const key = `${m[1]}.${m[2]}`;
    if (!jsRefs.has(key)) jsRefs.set(key, []);
    if (!jsRefs.get(key).includes(rel)) jsRefs.get(key).push(rel);
  }
}

const enKeys = readPropertyKeys("i18n/en.properties");
const defaultKeys = readPropertyKeys("i18n/default.properties");

const problems = [];

// 1. JS 引用的键必须在注入块中存在
for (const [key, files] of jsRefs) {
  if (!injected.has(key)) {
    problems.push(`JS 引用了未注入的消息 messages.${key}（${files.join(", ")}）`);
  }
}

// 2. 注入块引用的 i18n key 必须存在于 en.properties 与 default.properties
for (const [path, i18nKey] of injected) {
  if (!enKeys.has(i18nKey)) {
    problems.push(`注入块 ${path} 引用 #{${i18nKey}}，但 i18n/en.properties 缺少该键`);
  }
  if (!defaultKeys.has(i18nKey)) {
    problems.push(`注入块 ${path} 引用 #{${i18nKey}}，但 i18n/default.properties 缺少该键`);
  }
}

// 3. 同一个 JS 路径不得被注入两次（后者会静默覆盖前者）。
//    注意：不同的 JS 路径共用同一个 i18n key 是合法的复用
//    （例如活动分页与文章分页都显示「上一页」，共用 pagination.previous）。
const seen = new Map();
for (const [path, i18nKey] of injected) {
  if (seen.has(path)) {
    problems.push(`消息路径 ${path} 被重复注入（#{${i18nKey}}）`);
  } else {
    seen.set(path, i18nKey);
  }
}

if (problems.length) {
  console.error("✗ JS i18n 检查未通过：");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(
  `✓ JS i18n 检查通过（JS 引用 ${jsRefs.size} 个消息键，注入块 ${injected.size} 个，英文词条 ${enKeys.size} 个）`,
);
