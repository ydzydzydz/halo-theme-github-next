import { scrollBehavior } from "./dom";

export type BackToTopOptions = {
  /** 滚动超过多少像素后按钮才显示。 */
  threshold?: number;
};

/**
 * 回顶按钮。
 *
 * 全站与正文页共用这一份实现：滚动过阈值后按钮才出现，
 * 按钮的外观不随滚动状态变化，滚动动效交给「减少动效」偏好决定。
 */
export const setupBackToTop = (button: HTMLButtonElement, options: BackToTopOptions = {}) => {
  const threshold = options.threshold ?? 320;

  const updateVisibility = () => {
    button.hidden = window.scrollY <= threshold;
  };

  button.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: scrollBehavior() });
  });

  window.addEventListener("scroll", updateVisibility, { passive: true });
  updateVisibility();
};

/**
 * 全站悬浮回顶按钮。
 *
 * 正文页自带一个侧边栏回顶按钮，两处同时存在会重复，
 * 因此这里在检测到正文页的回顶按钮时把全局那颗移除。
 */
export const setupGlobalBackToTop = () => {
  const button = document.querySelector<HTMLButtonElement>("[data-back-to-top]");

  if (!button) {
    return;
  }

  if (document.querySelector("[data-post-back-to-top]")) {
    button.remove();
    return;
  }

  setupBackToTop(button);
};
