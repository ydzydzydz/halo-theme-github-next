/**
 * 顶栏配色切换。
 *
 * 三种状态：system（跟随系统）/ light / dark。
 * 只有用户显式选择过 light 或 dark 时才写入 <html data-color-scheme>，
 * 这样未选择过的访客能由 CSS 的 prefers-color-scheme 规则接管，跟随系统外观。
 */
import { formatMessage, messages } from "../shared/i18n";

const colorSchemeStorageKey = "theme-github-next-color-scheme";

type ColorScheme = "system" | "light" | "dark";

export const setupThemeToggle = () => {
  const trigger = document.querySelector<HTMLButtonElement>("[data-theme-toggle]");
  const icon = trigger?.querySelector<HTMLElement>("iconify-icon");

  if (!trigger) {
    return;
  }

  const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)");

  let preference: ColorScheme = "system";

  try {
    const stored = localStorage.getItem(colorSchemeStorageKey);
    if (stored === "dark" || stored === "light") {
      preference = stored;
    }
  } catch {
    // 存储不可用时保持 system，由 CSS 媒体查询决定实际外观。
  }

  const resolveScheme = (value: ColorScheme): "light" | "dark" => {
    if (value === "dark") return "dark";
    if (value === "light") return "light";
    return systemPrefersDark.matches ? "dark" : "light";
  };

  // 三态循环：跟随系统 -> 白色 -> 夜间 -> 跟随系统。
  // 这样用户可以回到「跟随系统」，不必清缓存才能恢复默认行为。
  const nextScheme = (value: ColorScheme): ColorScheme => {
    if (value === "system") return "light";
    if (value === "light") return "dark";
    return "system";
  };

  // 图标按「用户选择的模式」取，而不是按「当前实际生效的外观」取。
  //
  // 原因：跟随系统时实际外观由操作系统决定，若图标跟着实际外观走，
  // 系统为暗色时「跟随系统」和「夜间」会渲染成完全一样的月亮图标，
  // 用户点击后看不出自己已经切回了跟随系统。这里用显示器图标表示
  // 「跟随设备 / 跟随系统设置」，太阳与月亮分别表示白色与夜间。
  const colorSchemeIcons: Record<ColorScheme, string> = {
    system: "solar:monitor-linear",
    light: "solar:sun-linear",
    dark: "solar:moon-line-duotone",
  };

  const colorSchemeModeLabels: Record<ColorScheme, string> = {
    system: messages.theme.modeSystem,
    light: messages.theme.modeLight,
    dark: messages.theme.modeDark,
  };

  const colorSchemeActionLabels: Record<ColorScheme, string> = {
    system: messages.theme.switchToSystem,
    light: messages.theme.switchToLight,
    dark: messages.theme.switchToDark,
  };

  const applyColorScheme = (preferenceValue: ColorScheme) => {
    const scheme = resolveScheme(preferenceValue);
    const root = document.documentElement;

    // 始终把「实际生效的配色」写到 <html data-color-scheme>，跟随系统时也不例外。
    //
    // 原因是站点里的插件（代码高亮 shiki、文章摘要、评论组件、搜索组件……）
    // 都以 html[data-color-scheme="dark"] 判断是否暗色。如果跟随系统时把这个
    // 属性删掉，主题自己会按 prefers-color-scheme 变暗，插件却仍是浅色，
    // 暗色页面上就会浮着几张白色卡片。
    //
    // CSS 里的 @media (prefers-color-scheme: dark) 分支保留给没有 JS 的访客。
    root.dataset.colorScheme = scheme;

    // 无障碍名称同时说明「当前是什么模式」和「点下去会切到什么模式」，
    // 光靠图标传达不了三态之间的区别。
    const label = `${formatMessage(
      messages.theme.modeLabel,
      colorSchemeModeLabels[preferenceValue],
    )}, ${colorSchemeActionLabels[nextScheme(preferenceValue)]}`;

    trigger.setAttribute("aria-label", label);
    trigger.title = label;
    trigger.dataset.colorMode = preferenceValue;
    icon?.setAttribute("icon", colorSchemeIcons[preferenceValue]);
  };

  applyColorScheme(preference);

  trigger.addEventListener("click", () => {
    preference = nextScheme(preference);
    applyColorScheme(preference);

    try {
      if (preference === "system") {
        localStorage.removeItem(colorSchemeStorageKey);
      } else {
        localStorage.setItem(colorSchemeStorageKey, preference);
      }
    } catch {
      // 存储不可用时，本次页面仍然按所选模式生效。
    }
  });

  // 用户未显式选择时，系统外观变化应实时反映到页面。
  const onSystemChange = () => {
    if (preference === "system") {
      applyColorScheme(preference);
    }
  };

  if (typeof systemPrefersDark.addEventListener === "function") {
    systemPrefersDark.addEventListener("change", onSystemChange);
  } else if (typeof systemPrefersDark.addListener === "function") {
    systemPrefersDark.addListener(onSystemChange);
  }
};
