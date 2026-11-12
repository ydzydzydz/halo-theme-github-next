import { setupBackToTop } from "./shared/back-to-top";

const backToTop = document.querySelector<HTMLButtonElement>("[data-post-back-to-top]");

if (backToTop) {
  // 正文页的按钮保留位置、只用禁用态表达可见性，与全站悬浮按钮的隐藏式不同。
  setupBackToTop(backToTop, { mode: "disabled" });
}
