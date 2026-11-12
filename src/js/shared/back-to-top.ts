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
