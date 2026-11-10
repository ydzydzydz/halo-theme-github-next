import "../css/business.scss";
import "iconify-icon";

const setupBusinessDetails = () => {
  const modal = document.querySelector<HTMLElement>("[data-business-modal]");
  const panel = modal?.querySelector<HTMLElement>("[data-business-panel]");
  const content = modal?.querySelector<HTMLElement>("[data-business-modal-content]");
  const triggers = document.querySelectorAll<HTMLButtonElement>("[data-business-open]");
  const closeButtons = modal?.querySelectorAll<HTMLElement>("[data-business-close]");

  if (!modal || !panel || !content || !triggers.length || !closeButtons?.length) {
    return;
  }

  const close = () => {
    modal.hidden = true;
    document.body.classList.remove("business-modal-open");
    content.replaceChildren();
  };

  const open = (trigger: HTMLButtonElement) => {
    const template =
      trigger.parentElement?.querySelector<HTMLTemplateElement>("[data-business-detail]");
    if (!template) {
      return;
    }

    content.replaceChildren(template.content.cloneNode(true));
    const title = content.querySelector("h2");
    if (title) {
      title.id = "business-modal-title";
      panel.setAttribute("aria-labelledby", title.id);
    }
    modal.hidden = false;
    document.body.classList.add("business-modal-open");
    closeButtons[closeButtons.length - 1]?.focus();
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
