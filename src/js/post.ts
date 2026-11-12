import { setupBackToTop } from "./shared/back-to-top";

const backToTop = document.querySelector<HTMLButtonElement>("[data-post-back-to-top]");

if (backToTop) {
  // 与全站悬浮回顶按钮保持一致：滚动过阈值才显示，外观不随滚动状态变化。
  setupBackToTop(backToTop);
}
