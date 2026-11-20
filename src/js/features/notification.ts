/**
 * 顶栏通知红点：登录后定期检查有没有未读通知。
 */
import { createPolling } from "../shared/dom";
import { messages } from "../shared/i18n";
import { getCurrentUsername, isAuthenticated } from "../shared/session";

type NotificationList = {
  items?: unknown[];
  total?: number;
};

export const setupNotificationIndicator = () => {
  const link = document.querySelector<HTMLAnchorElement>("[data-notification-link]");
  const dot = link?.querySelector<HTMLElement>("[data-notification-dot]");

  if (!link || !dot) {
    return;
  }

  if (!isAuthenticated()) {
    return;
  }

  let checking = false;

  const setUnreadState = (hasUnread: boolean) => {
    dot.hidden = !hasUnread;

    if (hasUnread) {
      link.title = messages.notification.unread;
    } else {
      link.removeAttribute("title");
    }
  };

  const checkUnreadNotifications = async () => {
    if (checking) {
      return;
    }

    checking = true;

    try {
      const currentUsername = await getCurrentUsername();
      if (!currentUsername) {
        setUnreadState(false);
        return;
      }

      const endpoint =
        `/apis/api.notification.halo.run/v1alpha1/userspaces/${encodeURIComponent(currentUsername)}` +
        "/notifications?page=1&size=1&fieldSelector=spec.unread%3Dtrue";
      const response = await fetch(endpoint);

      if (!response.ok) {
        setUnreadState(false);
        return;
      }

      const notifications = (await response.json()) as NotificationList;
      setUnreadState((notifications.total ?? notifications.items?.length ?? 0) > 0);
    } catch {
      setUnreadState(false);
    } finally {
      checking = false;
    }
  };

  void checkUnreadNotifications();
  // 切到后台标签页时自动暂停轮询，回到前台再恢复。
  createPolling(() => void checkUnreadNotifications(), 30_000);
  window.addEventListener("focus", () => void checkUnreadNotifications());
};
