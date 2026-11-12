#!/usr/bin/env node
/**
 * 从 i18n/*.properties 生成前端消息产物：
 *
 *   1. src/partials/messages.html  里的 window.__HALO_THEME_MESSAGES__ 注入块
 *   2. src/js/shared/i18n.generated.ts  里的 ThemeMessages 类型与中文默认值
 *
 * 为什么要有这个脚本：
 *   - 注入块和 TS 类型是同一份消息表的两处副本，手工维护必然漂移
 *     （漏注入一个键，英文页面就会悄悄回落到中文）；
 *   - 消息键以 properties 为唯一事实来源，模板里的 `#{key}` 与脚本里的
 *     `messages.x.y` 走同一套命名，生成时一一对应。
 *
 * 用法：
 *   node scripts/gen-messages.mjs          写入生成产物
 *   node scripts/gen-messages.mjs --check  只校验是否为最新（CI 用）
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");

/** 统一的排序比较函数：键名都是 ASCII 标识符，按语言序排即可。 */
const byName = (left, right) => left.localeCompare(right);

/** 解析 properties 文件，返回有序的 [key, value] 列表。 */
const parseProperties = (path) => {
  const entries = [];
  const lines = readFileSync(path, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("!")) {
      continue;
    }

    const separator = trimmed.search(/[=:]/);

    if (separator === -1) {
      continue;
    }

    entries.push([trimmed.slice(0, separator).trim(), trimmed.slice(separator + 1).trim()]);
  }

  return entries;
};

/** 递归收集 src/js 下的 .ts 文件。 */
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

// ---------------------------------------------------------------------------
// 1. 读取消息表
// ---------------------------------------------------------------------------

const defaultEntries = parseProperties(join(root, "i18n/default.properties"));

/** 完整消息表：分组 -> 字段 -> 中文默认值（同时用于生成类型）。 */
const catalog = new Map();

for (const [key, value] of defaultEntries) {
  const [group, name] = key.split(".");

  if (!group || !name) {
    continue;
  }

  if (!catalog.has(group)) {
    catalog.set(group, new Map());
  }

  catalog.get(group).set(name, value);
}

// ---------------------------------------------------------------------------
// 2. 找出脚本真正用到的消息键（只注入这些，避免给每个页面塞进整张表）
// ---------------------------------------------------------------------------

const usedKeys = new Set();

for (const file of collectTsFiles(join(root, "src/js"))) {
  const content = readFileSync(file, "utf8");
  const pattern = /\bmessages\s*\??\.\s*([A-Za-z_]\w*)\s*\.\s*([A-Za-z_]\w*)/g;
  let match;

  while ((match = pattern.exec(content)) !== null) {
    usedKeys.add(`${match[1]}.${match[2]}`);
  }
}

// ---------------------------------------------------------------------------
// 3. 生成注入块
// ---------------------------------------------------------------------------

const INJECT_START = "<!-- i18n:generated:start -->";
const INJECT_END = "<!-- i18n:generated:end -->";

const usedGroups = new Map();

for (const key of usedKeys) {
  const [group, name] = key.split(".");

  if (!catalog.get(group)?.has(name)) {
    console.error(`✗ 脚本引用了消息表中不存在的键：${String(key)}`);
    process.exit(1);
  }

  if (!usedGroups.has(group)) {
    usedGroups.set(group, []);
  }

  usedGroups.get(group).push(name);
}

const buildInjectionBlock = () => {
  const lines = [
    "<!--",
    "  前端脚本使用的文案在此注入。Thymeleaf 会按当前访客语言解析消息键，",
    "  并按 JavaScript 字面量规则转义，避免翻译里的引号或换行破坏脚本。",
    "",
    "  本文件由 scripts/gen-messages.mjs 依据 i18n/*.properties 生成，请勿手动编辑。",
    "-->",
    '<script th:inline="javascript">',
    "  window.__HALO_THEME_MESSAGES__ = {",
  ];

  for (const group of [...usedGroups.keys()].sort(byName)) {
    lines.push(`    ${group}: {`);

    for (const name of usedGroups.get(group).sort(byName)) {
      const fallback = JSON.stringify(catalog.get(group).get(name));
      lines.push(`      ${name}: /*[[#{${group}.${name}}]]*/ ${fallback},`);
    }

    lines.push("    },");
  }

  lines.push("  };");
  lines.push("</script>");
  return lines.join("\n");
};

const messagesPath = join(root, "src/partials/messages.html");
const nextMessages = `${INJECT_START}\n${buildInjectionBlock()}\n${INJECT_END}\n`;

// ---------------------------------------------------------------------------
// 4. 生成 TypeScript 类型与默认值
// ---------------------------------------------------------------------------

const tsLines = [
  "/**",
  " * 此文件由 scripts/gen-messages.mjs 生成，请勿手动编辑。",
  " *",
  " * 消息表的事实来源是 i18n/default.properties（简体中文）。",
  " * 修改文案请改 i18n/ 下的 properties，再重新运行生成脚本。",
  " */",
  "",
  "export interface ThemeMessages {",
];

for (const group of [...catalog.keys()].sort(byName)) {
  tsLines.push(`  ${group}: {`);

  for (const name of [...catalog.get(group).keys()].sort(byName)) {
    tsLines.push(`    ${name}: string;`);
  }

  tsLines.push("  };");
}

tsLines.push("}");
tsLines.push("");
tsLines.push("export const defaultMessages: ThemeMessages = {");

for (const group of [...catalog.keys()].sort(byName)) {
  tsLines.push(`  ${group}: {`);

  for (const name of [...catalog.get(group).keys()].sort(byName)) {
    tsLines.push(`    ${name}: ${JSON.stringify(catalog.get(group).get(name))},`);
  }

  tsLines.push("  },");
}

tsLines.push("};");
tsLines.push("");

const generatedTs = tsLines.join("\n");

// ---------------------------------------------------------------------------
// 5. 写盘或校验
// ---------------------------------------------------------------------------

const targets = [
  { path: messagesPath, next: nextMessages },
  { path: join(root, "src/js/shared/i18n.generated.ts"), next: generatedTs },
];

const drifted = targets.filter(({ path, next }) => {
  let current = "";

  try {
    current = readFileSync(path, "utf8");
  } catch {
    return true;
  }

  return current !== next;
});

if (checkOnly) {
  if (drifted.length) {
    console.error("✗ 生成产物与 i18n/*.properties 不一致，请运行：node scripts/gen-messages.mjs");
    for (const { path } of drifted) {
      console.error(`  - ${relative(root, path)}`);
    }
    process.exit(1);
  }

  console.log(`✓ 消息产物已是最新（${usedKeys.size} 个脚本用到的键 / ${catalog.size} 个分组）`);
  process.exit(0);
}

for (const { path, next } of targets) {
  writeFileSync(path, next, "utf8");
}

console.log(
  `✓ 已生成消息产物：${usedKeys.size} 个注入键（${usedGroups.size} 个分组），类型覆盖 ${catalog.size} 个分组`,
);
