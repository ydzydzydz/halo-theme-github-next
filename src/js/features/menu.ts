/**
 * 顶栏与导航相关交互：菜单图标、当前菜单高亮、发布菜单、用户菜单、友链 logo 兜底。
 */
import { setupDropdownMenu } from "../shared/dropdown-menu";
import { getCurrentUser, isAuthenticated } from "../shared/session";

/** 把菜单链接规整成可比较的路径。 */
const normalizeMenuPath = (path: string | null | undefined) => {
  const value = (path || "").trim();

  if (!value) {
    return "/";
  }

  try {
    const url = new URL(value, window.location.origin);
    const pathname = url.pathname || "/";
    return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  } catch {
    const pathname = value.startsWith("/") ? value : `/${value}`;
    return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  }
};

/**
 * 应用后台「自定义菜单图标」配置。
 *
 * 规则写在 <div data-menu-icon-rules> 里（服务端渲染，页面不可见），
 * 这里按菜单路径把图标写到对应的菜单项上。
 */
export const setupCustomMenuIcons = () => {
  const rules = new Map<string, string>();

  document
    .querySelectorAll<HTMLElement>("[data-menu-icon-rules] [data-menu-path][data-menu-icon]")
    .forEach((rule) => {
      const icon = rule.dataset.menuIcon?.trim();

      if (!icon) {
        return;
      }

      rules.set(normalizeMenuPath(rule.dataset.menuPath), icon);
    });

  if (!rules.size) {
    return;
  }

  document
    .querySelectorAll<HTMLAnchorElement>(".profile-tabs a[data-menu-href]")
    .forEach((item) => {
      const icon = rules.get(normalizeMenuPath(item.dataset.menuHref || item.getAttribute("href")));
      const iconElement = item.querySelector("iconify-icon");

      if (icon && iconElement) {
        iconElement.setAttribute("icon", icon);
      }
    });
};

/**
 * 高亮当前所在页面对应的菜单项。
 *
 * 服务端已经按模板变量标记过一遍，这里再补一次：
 * 自定义菜单链接（后台自建页面）在服务端无法预判，只能在浏览器里判断。
 */
export const setupActiveMenuItem = () => {
  const currentPath = normalizeMenuPath(window.location.pathname);

  document
    .querySelectorAll<HTMLAnchorElement>(".profile-tabs a[data-menu-href]")
    .forEach((item) => {
      const menuPath = normalizeMenuPath(item.dataset.menuHref || item.getAttribute("href"));
      const isCurrent =
        menuPath === "/"
          ? currentPath === "/"
          : currentPath === menuPath || currentPath.startsWith(`${menuPath}/`);

      if (isCurrent) {
        item.classList.add("is-active");
      }
    });
};

/** 友链 logo 加载失败时回落到备用图，都失败则标记为无效。 */
export const setupLinkLogoFallbacks = () => {
  document.querySelectorAll<HTMLImageElement>("img[data-link-logo]").forEach((image) => {
    const fallback = image.dataset.linkFallback?.trim();
    let fallbackAttempted = !fallback || image.getAttribute("src") === fallback;

    const showFallback = () => {
      if (!fallbackAttempted && fallback) {
        fallbackAttempted = true;
        image.src = fallback;
        return;
      }

      image.classList.add("is-invalid");
    };

    image.addEventListener("error", showFallback);

    if (image.complete && image.naturalWidth === 0) {
      showFallback();
    }
  });
};

export const setupPublishMenu = () => {
  const trigger = document.querySelector<HTMLButtonElement>("[data-publish-menu-trigger]");
  const menu = document.querySelector<HTMLElement>("[data-publish-menu]");
  const container = trigger?.closest<HTMLElement>(".publish-menu");

  if (!trigger || !menu || !container) {
    return;
  }

  setupDropdownMenu({ container, trigger, menu });
};

export const setupUserMenu = async () => {
  const container = document.querySelector<HTMLElement>("[data-user-menu]");
  const loginLink = container?.querySelector<HTMLAnchorElement>("[data-login-link]");
  const trigger = container?.querySelector<HTMLButtonElement>("[data-user-menu-trigger]");
  const menu = container?.querySelector<HTMLElement>("[data-user-menu-list]");
  const avatar = trigger?.querySelector<HTMLImageElement>("[data-user-avatar]");

  if (!container || !loginLink || !trigger || !menu || !avatar) {
    return;
  }

  loginLink.href = `/login?redirect_uri=${encodeURIComponent(window.location.href)}`;

  if (!isAuthenticated()) {
    return;
  }

  const currentUser = await getCurrentUser();
  const username = currentUser?.user?.metadata?.name;

  if (!username || username === "anonymousUser") {
    return;
  }

  const fallbackAvatar = avatar.currentSrc || avatar.src;
  avatar.removeAttribute("srcset");
  avatar.removeAttribute("sizes");
  avatar.src = currentUser.user?.spec?.avatar || fallbackAvatar;
  avatar.alt = currentUser.user?.spec?.displayName || username;
  avatar.addEventListener("error", () => {
    if (avatar.src !== fallbackAvatar) {
      avatar.src = fallbackAvatar;
    }
  });
  loginLink.hidden = true;
  trigger.hidden = false;

  setupDropdownMenu({ container, trigger, menu });
};
