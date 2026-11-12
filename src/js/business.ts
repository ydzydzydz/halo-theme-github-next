import "../css/business.scss";
import "iconify-icon";
import { captureFocus, createFocusTrap, restoreFocus } from "./shared/dom";

const setupBusinessDetails = () => {
  const modal = document.querySelector<HTMLElement>("[data-business-modal]");
  const panel = modal?.querySelector<HTMLElement>("[data-business-panel]");
  const content = modal?.querySelector<HTMLElement>("[data-business-modal-content]");
  const triggers = document.querySelectorAll<HTMLButtonElement>("[data-business-open]");
  const closeButtons = modal?.querySelectorAll<HTMLElement>("[data-business-close]");

  if (!modal || !panel || !content || !triggers.length || !closeButtons?.length) {
    return;
  }

  // 背景遮罩也带 [data-business-close]，但它不可聚焦，真正该拿到焦点的是第一个关闭按钮。
  const focusableCloseButtons = Array.from(closeButtons).filter((button) =>
    button.matches("button, a[href], [tabindex]"),
  );
  const trap = createFocusTrap(panel);
  let lastFocused: HTMLElement | undefined;

  const close = () => {
    modal.hidden = true;
    document.body.classList.remove("business-modal-open");
    content.replaceChildren();
    trap.release();
    // 关闭后把焦点还给打开弹窗的按钮，键盘用户不会「掉」回页面顶部。
    restoreFocus(lastFocused);
    lastFocused = undefined;
  };

  const open = (trigger: HTMLButtonElement) => {
    const template =
      trigger.parentElement?.querySelector<HTMLTemplateElement>("[data-business-detail]");
    if (!template) {
      return;
    }

    lastFocused = captureFocus();
    content.replaceChildren(template.content.cloneNode(true));
    const title = content.querySelector("h2");
    if (title) {
      title.id = "business-modal-title";
      panel.setAttribute("aria-labelledby", title.id);
    }
    modal.hidden = false;
    document.body.classList.add("business-modal-open");
    trap.activate();
    focusableCloseButtons[0]?.focus();
  };

  triggers.forEach((trigger) => trigger.addEventListener("click", () => open(trigger)));
  closeButtons.forEach((button) => button.addEventListener("click", close));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) {
      close();
    }
  });
};

setupBusinessDetails();
