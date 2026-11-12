/**
 * 主题国际化消息。
 *
 * 消息值由 Thymeleaf 在渲染时通过 `th:inline="javascript"` 注入到
 * `window.__HALO_THEME_MESSAGES__`，此处只做类型收敛与安全回退：
 * 页面未注入（理论上不会发生）或某个键缺失时，退回默认中文值，
 * 避免界面出现 `undefined`。
 *
 * 语言判断本身不在前端：Halo 会按「language 查询参数 → Cookie → 登录用户偏好 →
 * 浏览器 Accept-Language」的顺序协商出语言，服务端解析 `#{key}` 后把该语言的文案
 * 注入进来。前端只负责在文案缺失时兜底，以及把 `<html lang>` 交给 Intl 做本地化格式化。
 *
 * 类型与默认值来自 `i18n.generated.ts`，该文件由 `scripts/gen-messages.mjs`
 * 依据 `i18n/default.properties` 生成，不要手工编辑。
 */
import { defaultMessages, type ThemeMessages } from "./i18n.generated";

export type { ThemeMessages };

/** 深合并：页面注入的消息覆盖默认值，未注入的键回落到默认中文。 */
const mergeMessages = (base: ThemeMessages, override: unknown): ThemeMessages => {
  if (!override || typeof override !== "object") {
    return base;
  }

  const merged = { ...base } as Record<string, unknown>;

  for (const [group, values] of Object.entries(override as Record<string, unknown>)) {
    const baseGroup = merged[group];

    if (values && typeof values === "object" && baseGroup && typeof baseGroup === "object") {
      merged[group] = { ...(baseGroup as object), ...(values as object) };
    } else if (typeof values === "string") {
      merged[group] = values;
    }
  }

  return merged as unknown as ThemeMessages;
};

const injected = (globalThis as Record<string, unknown>).__HALO_THEME_MESSAGES__;

export const messages: ThemeMessages = mergeMessages(defaultMessages, injected);

/** 用消息模板填充占位符，如 `找到 {0} 条结果`。 */
export const formatMessage = (template: string, ...values: (string | number)[]): string => {
  return values.reduce<string>(
    (text, _value) =>
      text.replace(/\{(\d+)\}/, (_match: string, index: string) => {
        const position = Number(index);
        return position < values.length ? String(values[position]) : "";
      }),
    template,
  );
};

/**
 * 页面当前是否使用中文。
 *
 * 只用于需要区分中英的格式化场景（例如中文习惯的日期写法），
 * 不参与文案翻译 —— 文案在服务端就已经按当前语言解析好了。
 */
export const isChinese = () => {
  const language = document.documentElement.lang || "";
  return language.toLowerCase().startsWith("zh");
};
