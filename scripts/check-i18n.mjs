#!/usr/bin/env node
/**
 * 主题模板自检脚本
 *
 * 检查项：
 * 1. 重复的 th:* 属性（批量替换文案时容易产生，Thymeleaf 会直接报错）
 * 2. i18n 消息键是否存在（模板引用的 #{key} 必须在 i18n/*.properties 中定义）
 * 3. 各语言文件的键集合是否一致
 * 4. 模板中是否残留未国际化的中文字符串
 *
 * 用法：node scripts/check-i18n.mjs
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const themeDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(themeDir, "src");
const i18nDir = join(themeDir, "i18n");

/** 递归收集模板文件 */
const collectTemplates = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectTemplates(full));
    else if (entry.name.endsWith(".html")) out.push(full);
  }
  return out;
};

/** 读取 properties 文件的键 */
const readKeys = (file) => {
  const keys = new Set();
  const duplicates = [];
  const seen = new Set();
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const key = line.slice(0, line.indexOf("=")).trim();
    if (seen.has(key)) duplicates.push(key);
    seen.add(key);
    keys.add(key);
  }
  return { keys, duplicates };
};

const problems = [];

// ---------- 1. i18n 文件检查 ----------
if (!existsSync(i18nDir)) {
  problems.push(`缺少 i18n 目录：${i18nDir}`);
} else {
  const files = readdirSync(i18nDir).filter((f) => f.endsWith(".properties"));
  if (!files.includes("default.properties")) {
    problems.push("i18n/default.properties 缺失，默认语言必须提供兜底消息");
  }

  const parsed = new Map();
  for (const file of files) {
    const { keys, duplicates } = readKeys(join(i18nDir, file));
    parsed.set(file, keys);
    for (const dup of duplicates) {
      problems.push(`${file} 中存在重复键：${dup}`);
    }
  }

  // 键集合一致性
  const base = parsed.get("default.properties");
  if (base) {
    for (const [file, keys] of parsed) {
      if (file === "default.properties") continue;
      const missing = [...base].filter((k) => !keys.has(k));
      const extra = [...keys].filter((k) => !base.has(k));
      if (missing.length) {
        problems.push(`${file} 缺少 default.properties 中的键：${missing.join(", ")}`);
      }
      if (extra.length) {
        problems.push(`${file} 存在 default.properties 没有的键：${extra.join(", ")}`);
      }
    }
  }

  // ---------- 2. 模板检查 ----------
  const templates = collectTemplates(srcDir);
  const usedKeys = new Set();

  for (const file of templates) {
    const rel = file.replace(`${themeDir}/`, "");
    const raw = readFileSync(file, "utf8");
    // 去掉 HTML 注释，避免把文档注释里的文案算进去
    const src = raw.replace(/<!--[\s\S]*?-->/g, "");

    // 重复属性
    for (const match of src.matchAll(/<[^>]*>/g)) {
      const tag = match[0];
      for (const attr of ["th:text", "th:if", "th:unless", "th:attr", "th:href"]) {
        const count = (tag.match(new RegExp(`\\s${attr}=`, "g")) || []).length;
        if (count > 1) {
          const line = src.slice(0, match.index).split("\n").length;
          problems.push(`${rel}:${line} 存在重复的 ${attr} 属性`);
        }
      }

      // class 属性内部吞掉了 Thymeleaf 属性（引号位置写错）。
      // 例如 class="love-duration-label th:text="#{key}" —— th:text 被当成 class 的值，
      // 标签结构随即损坏，构建产物会被静默截断。
      const classMatch = tag.match(/\bclass="([^"]*)"/);
      if (classMatch && /\b(th:|aria-|data-)\w+\s*=/.test(classMatch[1])) {
        const line = src.slice(0, match.index).split("\n").length;
        problems.push(
          `${rel}:${line} class 属性内混入了 Thymeleaf 属性（引号位置错误）：${classMatch[1].trim()}`,
        );
      }

      // 属性之间缺少空格，例如 role="menuitem"th:text="..."
      // 用属性扫描而非正则：逐个找出 name="value" 对，
      // 若某个 value 的闭合引号后紧跟下一个属性名（中间无空白），即为粘连。
      // 扫描每个 name="value" 对：若闭合引号之后紧接着下一个属性名（中间无空白），即为粘连。
      const attrPattern = /([a-zA-Z_:][\w:.-]*)\s*=\s*"([^"]*)"/g;
      const ends = [];
      let attrMatch;
      while ((attrMatch = attrPattern.exec(tag)) !== null) {
        ends.push(attrMatch.index + attrMatch[0].length);
      }
      for (let i = 1; i < ends.length; i++) {
        // 上一个属性闭合引号之后的内容，应只有空白
        const gap = tag.slice(ends[i - 1], ends[i - 1] + 40);
        const sticky = gap.match(/^(\S+)/);
        if (sticky && /^(?:th:|aria-|data-|role|rel|target|href|src|class)=/.test(sticky[1])) {
          const line = src.slice(0, match.index).split("\n").length;
          problems.push(
            `${rel}:${line} 属性之间缺少空格：${tag.slice(0, 80).replace(/\s+/g, " ")}`,
          );
          break;
        }
      }
    }

    // 引用到的消息键
    for (const match of src.matchAll(/#\{([a-zA-Z0-9_.]+)\}/g)) {
      usedKeys.add(match[1]);
    }

    // 未国际化的中文
    // 说明：Thymeleaf 允许 `th:text="#{key}">中文回退</th:text>` 这种写法，
    // 中文只是消息缺失时的回退文案，不算遗漏。真正要报的是「完全没有 th:text
    // 或 i18n 键的中文文本节点」。
    const lines = src.split("\n");
    const LOCALIZED_ATTR =
      /th:(text|alt|attr)\s*=|aria-label\s*=|title\s*=|placeholder\s*=|th:utext\s*=/;

    // 跳过 th:inline 脚本块：其中的中文是注入给前端的兜底默认值，
    // 已由对应的 #{key} 决定，不是遗漏。
    let inInlineScript = false;

    lines.forEach((line, index) => {
      if (/th:inline\s*=/.test(line)) {
        inInlineScript = true;
        return;
      }
      if (inInlineScript) {
        if (/<\/script>/.test(line)) {
          inInlineScript = false;
        }
        return;
      }

      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("<!") || trimmed.startsWith("//")) return;
      if (!/[\u4e00-\u9fff]/.test(line)) return;
      if (/<!--/.test(line)) return;

      // 向上回溯最多 6 行，找到当前元素所属的起始标签
      let hasLocalizedAttr = false;
      for (let back = 0; back <= 6 && index - back >= 0; back++) {
        const candidate = lines[index - back];
        if (LOCALIZED_ATTR.test(candidate)) {
          hasLocalizedAttr = true;
          break;
        }
        // 遇到另一个标签起始说明跨过了元素边界
        if (back > 0 && /^\s*</.test(candidate) && !/<\//.test(candidate)) break;
      }
      if (hasLocalizedAttr) return;

      // 纯文本节点：整行是中文且没有属性，说明漏掉了 th:text
      const isPureTextNode =
        !trimmed.startsWith("<") && !trimmed.startsWith("}") && !trimmed.startsWith("],");
      if (isPureTextNode) {
        problems.push(`${rel}:${index + 1} 存在未国际化的中文：${trimmed.slice(0, 60)}`);
      }
    });
  }

  // 模板引用了但 properties 里没定义的键
  for (const key of [...usedKeys].sort((left, right) => left.localeCompare(right))) {
    if (base && !base.has(key)) {
      problems.push(`模板引用了未定义的消息键：${String(key)}`);
    }
  }
}

/**
 * 普通 HTML 属性里的硬编码中文。
 *
 * `aria-label="上一首"` 这类写法 Thymeleaf 不会解析，必须写成
 * `th:attr="aria-label=#{music.previous}"` 才能随语言切换。
 * 元素文本漏掉 `th:text` 时上面的规则能查出来，属性漏掉时却查不出来，
 * 所以这里单独补一条规则。
 */
const checkHardcodedAttributes = () => {
  const pattern =
    /(?<![\w:-])(aria-label|aria-description|aria-placeholder|title|placeholder|alt)\s*=\s*"([^"]*[\u4e00-\u9fff][^"]*)"/g;

  for (const file of collectTemplates(srcDir)) {
    const rel = file.replace(`${themeDir}/`, "");

    // 生成产物由 scripts/gen-messages.mjs 维护，不参与检查
    if (rel.endsWith("partials/messages.html")) continue;

    const lines = readFileSync(file, "utf8").split(/\r?\n/);

    lines.forEach((line, index) => {
      for (const match of line.matchAll(pattern)) {
        problems.push(
          `${rel}:${index + 1} 属性 ${match[1]}="${match[2].slice(0, 30)}" 未国际化，请改用 th:attr`,
        );
      }
    });
  }
};

checkHardcodedAttributes();

if (problems.length) {
  console.error(`✗ 检查未通过，发现 ${problems.length} 个问题：\n`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log("✓ 模板与 i18n 检查通过");
