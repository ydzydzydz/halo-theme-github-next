type FilterKind = "category" | "tag" | "sort" | "douban-type" | "douban-status" | "douban-genre";

type MenuSource = "hover" | "click";

let openedMenu: HTMLElement | undefined;
let openedTrigger: HTMLElement | undefined;
let openedSource: MenuSource = "hover";
let closeTimer = 0;
let documentBound = false;

const getTriggers = () =>
  Array.from(document.querySelectorAll<HTMLButtonElement>("[data-repository-filter]"));

const closeMenu = () => {
  window.clearTimeout(closeTimer);

  if (openedMenu) {
    openedMenu.hidden = true;
    openedMenu = undefined;
    openedTrigger = undefined;
    openedSource = "hover";
  }

  getTriggers().forEach((trigger) => trigger.setAttribute("aria-expanded", "false"));
};

const scheduleClose = () => {
  window.clearTimeout(closeTimer);

  closeTimer = window.setTimeout(() => {
    // 主动点击展开的菜单保持展开，只有悬停展开的菜单才会在指针移开时收起。
    if (openedSource === "click") {
      return;
    }

    const stillHovered =
      getTriggers().some((trigger) => trigger.matches(":hover")) ||
      (openedMenu?.matches(":hover") ?? false);

    if (!stillHovered) {
      closeMenu();
    }
  }, 120);
};

const openMenu = (trigger: HTMLButtonElement, kind: FilterKind, source: MenuSource) => {
  const menu = document.querySelector<HTMLElement>(`[data-repository-filter-menu="${kind}"]`);

  if (!menu) {
    return;
  }

  if (openedMenu !== menu) {
    closeMenu();
    menu.hidden = false;
    openedMenu = menu;

    const rect = trigger.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.left = `${Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8)}px`;
  }

  openedTrigger = trigger;
  openedSource = source;
  trigger.setAttribute("aria-expanded", "true");
};

// 归档页与豆瓣页共用的下拉筛选菜单，动态渲染后可以重复调用。
export const setupRepositoryFilters = () => {
  const triggers = getTriggers().filter((trigger) => !trigger.dataset.repositoryFilterBound);

  if (!triggers.length) {
    return;
  }

  triggers.forEach((trigger) => {
    const kind = trigger.dataset.repositoryFilter as FilterKind | undefined;

    if (!kind) {
      return;
    }

    trigger.dataset.repositoryFilterBound = "true";

    // 兜底：筛选参数无效（例如手改 URL）时，回退到默认文案，避免按钮只剩箭头。
    const label = trigger.querySelector<HTMLElement>("[data-repository-filter-label]");

    if (label && !label.textContent?.trim()) {
      label.textContent = trigger.dataset.repositoryFilterDefault || "";
    }

    const openTriggerMenu = () => openMenu(trigger, kind, "hover");

    trigger.addEventListener("pointerenter", openTriggerMenu);
    trigger.addEventListener("pointerleave", scheduleClose);
    trigger.addEventListener("focus", openTriggerMenu);
  });

  const boundMenus = Array.from(
    document.querySelectorAll<HTMLElement>("[data-repository-filter-menu]"),
  ).filter((menu) => !menu.dataset.repositoryFilterMenuBound);

  boundMenus.forEach((menu) => {
    menu.dataset.repositoryFilterMenuBound = "true";
    menu.addEventListener("pointerenter", () => window.clearTimeout(closeTimer));
    menu.addEventListener("pointerleave", scheduleClose);
  });

  if (documentBound) {
    return;
  }

  documentBound = true;

  document.addEventListener("click", (event) => {
    const clickTarget = event.target;
    const trigger =
      clickTarget instanceof Element
        ? clickTarget.closest<HTMLButtonElement>("[data-repository-filter]")
        : null;

    // 点击筛选按钮时切换菜单：悬停已展开的菜单保持展开，再次点击才收起。
    if (trigger) {
      const kind = trigger.dataset.repositoryFilter as FilterKind | undefined;
      const menu = kind
        ? document.querySelector<HTMLElement>(`[data-repository-filter-menu="${kind}"]`)
        : null;

      if (menu && kind) {
        if (openedMenu === menu) {
          if (openedTrigger === trigger && openedSource === "hover") {
            openedSource = "click";
          } else {
            closeMenu();
          }
        } else {
          openMenu(trigger, kind, "click");
        }

        return;
      }
    }

    if (
      openedMenu &&
      clickTarget instanceof Node &&
      !openedMenu.contains(clickTarget) &&
      !getTriggers().some((item) => item.contains(clickTarget))
    ) {
      closeMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && openedMenu) {
      closeMenu();
    }
  });
};
