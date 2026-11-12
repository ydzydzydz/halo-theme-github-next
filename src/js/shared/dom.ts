/**
 * 浏览器端通用工具：页面语言、动效偏好、轮询、焦点管理与纯文本提取。
 *
 * 这些能力原先散落在各个页面脚本里，各自实现了一套，口径不一致
 * （例如「减少动效」有的地方读媒体查询，有的地方直接写死 smooth）。
 */

/** 页面语言：服务端按访客语言渲染，`<html lang>` 是最可靠的来源。 */
export const pageLocale = () => document.documentElement.lang || "zh-CN";

const reducedMotionQuery = () => window.matchMedia("(prefers-reduced-motion: reduce)");

/** 用户是否开启了「减少动效」偏好。 */
export const prefersReducedMotion = () => reducedMotionQuery().matches;

/**
 * 监听「减少动效」偏好变化，支持运行时切换。
 *
 * @returns 取消监听的函数。
 */
export const onReducedMotionChange = (handler: (reduced: boolean) => void) => {
  const query = reducedMotionQuery();
  const listener = (event: MediaQueryListEvent) => handler(event.matches);

  query.addEventListener("change", listener);

  return () => query.removeEventListener("change", listener);
};

/** 滚动动效：用户要求减少动效时直接跳转，不做平滑滚动。 */
export const scrollBehavior = (): ScrollBehavior => (prefersReducedMotion() ? "auto" : "smooth");

const unitFormatters = new Map<string, Intl.NumberFormat | null>();

/**
 * 带单位的数字，例如「3 天」「2 years」。
 *
 * 浏览器不支持该单位时退化为纯数字，不影响页面可用性。
 */
export const formatUnit = (value: number, unit: string, options?: Intl.NumberFormatOptions) => {
  const key = `${unit}|${options?.minimumIntegerDigits ?? ""}`;
  const cached = unitFormatters.get(key);

  if (cached !== undefined) {
    return cached ? cached.format(value) : String(value);
  }

  let formatter: Intl.NumberFormat | null = null;

  try {
    formatter = new Intl.NumberFormat(pageLocale(), {
      style: "unit",
      unit,
      unitDisplay: "long",
      ...options,
    });
  } catch {
    formatter = null;
  }

  unitFormatters.set(key, formatter);

  return formatter ? formatter.format(value) : String(value);
};

export type PollingInterval = number | (() => number);

export type PollingHandle = {
  /** 暂停轮询（切到后台标签页时自动暂停）。 */
  pause: () => void;
  /** 恢复轮询，回到前台时自动恢复。 */
  resume: () => void;
  /** 彻底停止并清理监听。 */
  stop: () => void;
};

/**
 * 统一的轮询封装。
 *
 * 后台标签页里继续轮询既费电又没意义，统一在 `visibilitychange` 时暂停；
 * 页面卸载时清理定时器与监听，避免跨页面残留。
 */
export const createPolling = (
  task: () => void | Promise<void>,
  interval: PollingInterval,
): PollingHandle => {
  let timer = 0;
  let stopped = false;

  const delayOf = () => (typeof interval === "function" ? interval() : interval);

  const tick = () => {
    timer = 0;

    if (stopped) {
      return;
    }

    void task();
    timer = window.setTimeout(tick, delayOf());
  };

  const pause = () => {
    if (!timer) {
      return;
    }

    window.clearTimeout(timer);
    timer = 0;
  };

  const resume = () => {
    if (stopped || timer || document.hidden) {
      return;
    }

    tick();
  };

  const handleVisibilityChange = () => {
    if (document.hidden) {
      pause();
      return;
    }

    resume();
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);

  const stop = () => {
    stopped = true;
    pause();
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };

  window.addEventListener("pagehide", stop, { once: true });

  if (!document.hidden) {
    tick();
  }

  return { pause, resume, stop };
};

/**
 * 从 HTML 片段里提取纯文本。
 *
 * 用 DOMParser 而不是 `innerHTML`：HTML 解析器会创建 `<img>` 元素，
 * `innerHTML` 虽然不执行脚本，但浏览器仍会立刻发起图片请求，
 * 用户就能借一条瞬间或评论让所有访客的浏览器去请求任意外部地址。
 * DOMParser 解析出的文档没有浏览上下文，不会发起任何请求。
 */
export const plainTextFromHtml = (html: string) => {
  if (!html) {
    return "";
  }

  const parsed = new DOMParser().parseFromString(html, "text/html");
  return parsed.body?.textContent?.replace(/\s+/g, " ").trim() || "";
};

/** 截断过长文本并补上省略号。 */
export const truncateText = (text: string, maxLength: number) =>
  text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;

/** 记录当前焦点元素，弹窗关闭后归还。 */
export const captureFocus = () =>
  document.activeElement instanceof HTMLElement ? document.activeElement : undefined;

/** 归还焦点到之前记录的元素。 */
export const restoreFocus = (element?: HTMLElement | null) => {
  if (element && document.contains(element)) {
    element.focus();
  }
};

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export type FocusTrap = {
  activate: () => void;
  release: () => void;
};

/**
 * 焦点陷阱：Tab 键在弹窗内部循环，不会跑到背后的页面内容上。
 *
 * 只对 `role="dialog"` 且 `aria-modal="true"` 的弹窗使用。
 */
export const createFocusTrap = (container: HTMLElement): FocusTrap => {
  const getFocusable = () =>
    Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(
      (element) => element.offsetParent !== null || element === document.activeElement,
    );

  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key !== "Tab") {
      return;
    }

    const items = getFocusable();

    if (!items.length) {
      event.preventDefault();
      return;
    }

    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || !container.contains(active))) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && (active === last || !container.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  };

  return {
    activate: () => document.addEventListener("keydown", handleKeydown, true),
    release: () => document.removeEventListener("keydown", handleKeydown, true),
  };
};

/**
 * 在元素旁显示一条短提示，替代阻塞式 `window.alert`。
 *
 * 提示会自行消失，不打断用户当前操作。
 */
export const showInlineHint = (target: HTMLElement, text: string, duration = 3000) => {
  const hint = document.createElement("span");

  hint.setAttribute("role", "status");
  hint.textContent = text;
  hint.style.cssText =
    "margin-left: 6px; color: var(--danger-fg, #cf222e); font-size: 12px; white-space: nowrap;";

  target.parentElement?.insertBefore(hint, target.nextSibling);
  window.setTimeout(() => hint.remove(), duration);
};
