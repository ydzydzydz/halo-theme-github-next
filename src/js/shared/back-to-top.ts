import { scrollBehavior } from "./dom";

export type BackToTopOptions = {
  /** 滚动超过多少像素后按钮才可用。 */
  threshold?: number;
  /**
   * 可见性表达方式。
   *
   * - `hidden`：直接隐藏按钮（侧边悬浮按钮）。
   * - `disabled`：保留位置但禁用按钮（正文页侧边操作按钮，禁用态有专门的样式）。
   */
  mode?: "hidden" | "disabled";
};

/**
 * 回顶按钮。
 *
 * 正文页与全站各有一份实现，可见性判断口径还不一样（一个 `scrollY < 320`，
 * 一个 `scrollY <= 320`），这里合并成一份，并把滚动动效交给「减少动效」偏好决定。
 */
export const setupBackToTop = (button: HTMLButtonElement, options: BackToTopOptions = {}) => {
  const threshold = options.threshold ?? 320;
  const mode = options.mode ?? "hidden";

  const updateVisibility = () => {
    const shouldShow = window.scrollY > threshold;

    if (mode === "disabled") {
      button.disabled = !shouldShow;
      return;
    }

    button.hidden = !shouldShow;
  };

  button.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: scrollBehavior() });
  });

  window.addEventListener("scroll", updateVisibility, { passive: true });
  updateVisibility();
};
