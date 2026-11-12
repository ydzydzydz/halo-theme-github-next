import { fetchAllPages } from "./shared/api";
import { createPolling, pageLocale, plainTextFromHtml, prefersReducedMotion } from "./shared/dom";
import { messages, formatMessage } from "./shared/i18n";

type CommentOwner = {
  avatar?: string;
  displayName?: string;
};

type HaloComment = {
  metadata?: {
    name?: string;
  };
  owner?: CommentOwner;
  spec?: {
    approved?: boolean;
    content?: string;
    creationTime?: string;
    hidden?: boolean;
  };
};

const commentEndpoint = "/apis/api.halo.run/v1alpha1/comments";
const commentDateFormatter = new Intl.DateTimeFormat(pageLocale(), {
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
});

const getCommentText = (comment: HaloComment) => {
  // 用户撰写的 HTML 只取纯文本：用 DOMParser 解析不会发起任何网络请求，
  // 避免一条评论里的 <img> 让访客浏览器去请求任意外部地址。
  return plainTextFromHtml(comment.spec?.content || "") || messages.message.empty;
};

const fetchComments = async (name: string) => {
  const result = await fetchAllPages<HaloComment>(commentEndpoint, {
    params: {
      group: "content.halo.run",
      kind: "SinglePage",
      name,
      version: "alpha1",
    },
  });

  return result.items.filter(
    (comment) => comment.spec?.approved !== false && !comment.spec?.hidden,
  );
};

const commentKey = (comment: HaloComment) =>
  comment.metadata?.name || `${comment.owner?.displayName}:${comment.spec?.creationTime}`;

const createMessage = (comment: HaloComment, lane: number, delay: number, duration: number) => {
  const message = document.createElement("div");
  message.className = "floating-message";
  message.dataset.commentKey = commentKey(comment);
  message.style.setProperty("--message-lane", String(lane));
  message.style.setProperty("--message-duration", `${duration}s`);
  message.style.setProperty("--message-delay", `${delay}s`);

  const avatar = document.createElement("span");
  avatar.className = "floating-message-avatar";

  if (comment.owner?.avatar) {
    const image = document.createElement("img");
    image.src = comment.owner.avatar;
    image.alt = "";
    image.loading = "lazy";
    avatar.append(image);
  } else {
    avatar.textContent = (comment.owner?.displayName || messages.message.guest).slice(0, 1);
  }

  const body = document.createElement("span");
  body.className = "floating-message-body";

  const owner = document.createElement("strong");
  owner.textContent = comment.owner?.displayName || messages.message.guest;

  const content = document.createElement("span");
  content.textContent = getCommentText(comment);

  const time = document.createElement("time");
  const creationTime = comment.spec?.creationTime;
  if (creationTime) {
    const date = new Date(creationTime);
    time.dateTime = creationTime;
    time.textContent = Number.isNaN(date.getTime()) ? "" : commentDateFormatter.format(date);
  }

  body.append(owner, content, time);
  message.append(avatar, body);
  return message;
};

const randomComment = (comments: HaloComment[], excludedKeys: Set<string>) => {
  const candidates = comments.filter((comment) => !excludedKeys.has(commentKey(comment)));
  const source = candidates.length ? candidates : comments;
  return source[Math.floor(Math.random() * source.length)];
};

const setupMessageWall = () => {
  const root = document.querySelector<HTMLElement>("[data-message-wall]");
  const stage = root?.querySelector<HTMLElement>("[data-message-stage]");
  const status = root?.querySelector<HTMLElement>("[data-message-status]");
  const count = root?.querySelector<HTMLElement>("[data-message-count]");
  const countTotal = root?.querySelector<HTMLElement>("[data-message-total]");
  const countUnit = root?.querySelector<HTMLElement>("[data-message-unit]");
  const name = root?.dataset.commentName;

  if (!root || !stage || !status || !count || !name) {
    return;
  }

  const setCount = (total: string, unit: string) => {
    if (countTotal) {
      countTotal.textContent = total;
      countTotal.hidden = !total;
    }

    if (countUnit) {
      countUnit.textContent = unit;
    }
  };

  const setStatus = (text: string) => {
    stage.replaceChildren(status);
    status.hidden = false;
    // 模板结构可能变化，这里不假定一定存在 span。
    const label = status.querySelector("span");
    if (label) {
      label.textContent = text;
    } else {
      status.textContent = text;
    }
  };

  // 轮播用的定时器，刷新列表时统一清理，避免旧定时器替换掉已经不在舞台上的留言。
  const timers = new Set<number>();
  const clearTimers = () => {
    timers.forEach((timer) => window.clearTimeout(timer));
    timers.clear();
  };

  let signature = "";

  const refresh = async () => {
    try {
      const comments = await fetchComments(name);
      setCount("", formatMessage(messages.message.count, comments.length));

      if (!comments.length) {
        signature = "";
        clearTimers();
        setStatus(messages.message.empty);
        return;
      }

      const nextSignature = comments
        .map((comment) => `${comment.metadata?.name}:${comment.spec?.creationTime}`)
        .join("|");

      if (nextSignature === signature) {
        return;
      }

      signature = nextSignature;
      clearTimers();
      const messageCount = comments.length === 1 ? 1 : Math.min(4, comments.length - 1);
      const initialComments = [...comments].sort(() => Math.random() - 0.5).slice(0, messageCount);
      const createLoopingMessage = (comment: HaloComment, index: number): HTMLElement => {
        const lane =
          messageCount === 1 ? 2 : Math.round((index * 5) / Math.max(1, messageCount - 1));
        const duration = 18 + Math.floor(Math.random() * 5);
        const message = createMessage(comment, lane, index * 2.5, duration);

        // 轮播由定时器驱动，不挂在 CSS 的 animationend 事件上：
        // 「减少动效」模式会把动画置为 none，事件永不触发，留言墙会退化成一次性静态列表。
        if (!prefersReducedMotion()) {
          const timer = window.setTimeout(() => {
            timers.delete(timer);
            const activeKeys = new Set(
              Array.from(stage.querySelectorAll<HTMLElement>("[data-comment-key]"))
                .filter((item) => item !== message)
                .map((item) => item.dataset.commentKey || ""),
            );
            const nextComment = randomComment(comments, activeKeys);
            message.replaceWith(createLoopingMessage(nextComment, index));
          }, duration * 1000);

          timers.add(timer);
        }

        return message;
      };
      const wallMessages = initialComments.map((comment, index) =>
        createLoopingMessage(comment, index),
      );
      stage.replaceChildren(...wallMessages);
    } catch {
      setCount("", messages.message.failed);
      clearTimers();
      setStatus(messages.message.failed);
    }
  };

  void refresh();

  // 后台标签页不轮询，回到前台时立即补一次。
  createPolling(() => void refresh(), 30_000);
};

setupMessageWall();
