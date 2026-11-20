/**
 * 友链申请：把访客填写的资料整理成一条留言，提交到留言板页面。
 */
import { formatMessage, messages } from "../shared/i18n";

const commentEndpoint = "/apis/api.halo.run/v1alpha1/comments";
const singlePageEndpoint = "/apis/api.content.halo.run/v1alpha1/singlepages?page=1&size=1000";

type SinglePageSummary = {
  metadata?: { name?: string };
  spec?: { template?: string };
};

const escapeCommentHtml = (value: string) =>
  value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character];
  });

/** 只允许 http / https，避免把 javascript: 之类写进留言内容。 */
const normalizeHttpUrl = (value: string, label: string) => {
  if (!value) {
    return "";
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error();
    }
    return url.toString();
  } catch {
    throw new Error(formatMessage(messages.links.invalidUrl, label));
  }
};

const formatFriendLinkApplication = (payload: {
  siteName: string;
  url: string;
  logo: string;
  email: string;
  description: string;
  backlinkUrl: string;
  rssUrl: string;
}) => {
  const row = (label: string, value: string) =>
    value
      ? `<p><strong>${label}${messages.links.rowSeparator}</strong>${escapeCommentHtml(value)}</p>`
      : "";
  const safeUrl = escapeCommentHtml(payload.url);

  return [
    `<p><strong>[${messages.links.linkApplication}]</strong></p>`,
    row(messages.links.rowSiteName, payload.siteName),
    `<p><strong>${messages.links.rowSiteUrl}${messages.links.rowSeparator}</strong>${safeUrl}</p>`,
    row(messages.links.rowSiteLogo, payload.logo),
    row(messages.links.rowSiteDescription, payload.description),
    row(messages.links.rowContactEmail, payload.email),
    row(messages.links.rowBacklinkUrl, payload.backlinkUrl),
    row(messages.links.rowRssUrl, payload.rssUrl),
  ]
    .filter(Boolean)
    .join("");
};

/** 找到留言板单页的 metadata.name，留言要挂在它下面。 */
const findMessageBoardName = async () => {
  const response = await fetch(singlePageEndpoint, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(messages.links.boardFetchFailed);
  }

  const result = (await response.json()) as { items?: SinglePageSummary[] };
  const messageBoard = result.items?.find((page) => page.spec?.template === "message.html");
  if (!messageBoard?.metadata?.name) {
    throw new Error(messages.links.boardMissing);
  }
  return messageBoard.metadata.name;
};

export const setupFriendLinkApplication = () => {
  const root = document.querySelector<HTMLElement>("[data-friend-link-application]");
  const trigger = root?.querySelector<HTMLButtonElement>("[data-friend-link-open]");
  const form = root?.querySelector<HTMLFormElement>("[data-friend-link-form]");
  const submit = root?.querySelector<HTMLButtonElement>("[data-friend-link-submit]");
  const status = root?.querySelector<HTMLElement>("[data-friend-link-status]");

  if (!root || !trigger || !form || !submit || !status) {
    return;
  }

  trigger.addEventListener("click", () => {
    form.hidden = false;
    trigger.hidden = true;
    form.querySelector<HTMLInputElement>('input[name="siteName"]')?.focus();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const values = new FormData(form);
    const valueOf = (name: string) => {
      const value = values.get(name);
      return typeof value === "string" ? value.trim() : "";
    };
    const payload = {
      siteName: valueOf("siteName"),
      url: valueOf("url"),
      logo: valueOf("logo"),
      email: valueOf("email"),
      description: valueOf("description"),
      backlinkUrl: valueOf("backlinkUrl"),
      rssUrl: valueOf("rssUrl"),
    };

    submit.disabled = true;
    status.classList.remove("is-error");
    status.classList.remove("is-success");
    status.textContent = messages.links.submitting;

    void Promise.resolve()
      .then(() => {
        payload.url = normalizeHttpUrl(payload.url, messages.links.rowSiteUrl);
        payload.logo = normalizeHttpUrl(payload.logo, messages.links.rowSiteLogo);
        payload.backlinkUrl = normalizeHttpUrl(payload.backlinkUrl, messages.links.rowBacklinkUrl);
        payload.rssUrl = normalizeHttpUrl(payload.rssUrl, messages.links.rowRssUrl);
        return findMessageBoardName();
      })
      .then((messageBoardName) => {
        const content = formatFriendLinkApplication(payload);
        return fetch(commentEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            raw: content,
            content,
            allowNotification: false,
            subjectRef: {
              group: "content.halo.run",
              kind: "SinglePage",
              name: messageBoardName,
              version: "",
            },
            owner: {
              displayName: payload.siteName,
              email: payload.email,
              website: payload.url,
            },
          }),
        });
      })
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json().catch(() => undefined)) as
            | { detail?: string; message?: string }
            | undefined;
          throw new Error(body?.message || body?.detail || messages.links.failed);
        }

        form.reset();
        status.classList.add("is-success");
        status.textContent = messages.links.submittedToBoard;
      })
      .catch((error: unknown) => {
        status.classList.add("is-error");
        status.textContent = error instanceof Error ? error.message : messages.links.failed;
      })
      .finally(() => {
        submit.disabled = false;
      });
  });
};
