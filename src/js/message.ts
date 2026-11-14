import "iconify-icon";
import { fetchAllPages } from "./shared/api";
import { createPolling, pageLocale, plainTextFromHtml, prefersReducedMotion } from "./shared/dom";
import { messages, formatMessage } from "./shared/i18n";

type CommentOwner = {
  avatar?: string;
  displayName?: string;
  kind?: string;
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
    owner?: {
      annotations?: Record<string, string>;
    };
  };
};

const commentEndpoint = "/apis/api.halo.run/v1alpha1/comments";
// 评论组件的头像配置：弹幕区复用同一份，才能让同一个人全站是同一个形象。
const commentWidgetConfigEndpoint = "/apis/api.commentwidget.halo.run/v1alpha1/config";
const commentDateFormatter = new Intl.DateTimeFormat(pageLocale(), {
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
});

/** 评论组件「头像提供方」设置。 */
type AvatarConfig = {
  enable?: boolean;
  provider?: string;
  providerMirror?: string;
  policy?: string;
};

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

/**
 * 读取评论组件的头像配置。
 *
 * 评论组件（PluginCommentWidget）把站点「头像提供方」的设置放在这个公开接口里，
 * 弹幕区复用同一份配置，同一个人在整个站点才是同一个形象。
 * 接口不存在（站点没装评论组件）或返回异常时返回 null，
 * 此时头像按评论区「没有头像地址」的规则显示文字占位，不影响留言墙本身。
 */
const fetchAvatarConfig = async (): Promise<AvatarConfig | null> => {
  try {
    const response = await fetch(commentWidgetConfigEndpoint, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as { avatar?: AvatarConfig };
    return data?.avatar ?? null;
  } catch {
    return null;
  }
};

// 头像配置只取一次：接口不可用时缓存 null，不在每次轮询里重复请求。
let avatarConfigRequest: Promise<AvatarConfig | null> | null = null;

const loadAvatarConfig = () => {
  avatarConfigRequest ??= fetchAvatarConfig();
  return avatarConfigRequest;
};

/**
 * 按评论组件的规则生成头像地址。
 *
 * - custom：镜像地址里的 {hash}/{seed} 换成邮箱哈希，没有占位符则追加 _avatar= 参数；
 * - gravatar：{镜像}/avatar/{邮箱哈希}。
 */
const buildProviderAvatar = (config: AvatarConfig, emailHash: string) => {
  const mirror = config.providerMirror?.trim() || "";

  if (config.provider === "gravatar") {
    const base = (mirror || "https://gravatar.com").replace(/\/+$/, "");
    return `${base}/avatar/${emailHash}`;
  }

  if (!mirror) {
    return "";
  }

  const encoded = encodeURIComponent(emailHash || "anonymous");
  if (/\{(?:hash|seed)\}/.test(mirror)) {
    return mirror.replace(/\{hash\}/g, encoded).replace(/\{seed\}/g, encoded);
  }

  // 片段（#...）要留在最后，参数拼在片段之前。
  const fragmentIndex = mirror.indexOf("#");
  const base = fragmentIndex < 0 ? mirror : mirror.slice(0, fragmentIndex);
  const fragment = fragmentIndex < 0 ? "" : mirror.slice(fragmentIndex);
  return `${base}${base.includes("?") ? "&" : "?"}_avatar=${encoded}${fragment}`;
};

/**
 * 评论组件的三种头像策略：
 * - anonymousUser（默认）：只有匿名评论用生成头像，注册用户用自己上传的头像；
 * - noAvatarUser：没有头像的用户改用生成头像；
 * - allUser：所有人都用生成头像。
 */
const resolveAvatar = (comment: HaloComment, config: AvatarConfig | null) => {
  const uploaded = comment.owner?.avatar || "";

  if (!config?.enable) {
    return uploaded;
  }

  const isAnonymous = comment.owner?.kind === "Email";
  const emailHash = comment.spec?.owner?.annotations?.["email-hash"] || "";
  const policy = config.policy || "anonymousUser";

  const useProvider =
    policy === "allUser" || (policy === "noAvatarUser" ? isAnonymous || !uploaded : isAnonymous);

  if (!useProvider) {
    return uploaded;
  }

  return buildProviderAvatar(config, emailHash) || uploaded;
};

/**
 * 文字占位：与评论组件一致，取昵称首字母并大写；
 * 昵称是「First Last」这种两段式时取两个首字母。
 */
const avatarPlaceholder = (displayName?: string) => {
  const parts = (displayName || messages.message.guest).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return "";
  }
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  return parts[0].charAt(0).toUpperCase() + parts[1].charAt(0).toUpperCase();
};

/**
 * 弹幕头像：来源与评论区完全一致 ——
 * - 有头像地址（本人上传，或评论组件的头像提供方生成）就显示图片；
 * - 没有地址就显示昵称首字母的文字占位；
 * - 图片加载失败时显示警告图标，和评论区的处理保持一致。
 */
const createAvatar = (comment: HaloComment, config: AvatarConfig | null) => {
  const avatar = document.createElement("span");
  avatar.className = "floating-message-avatar";

  const placeholder = avatarPlaceholder(comment.owner?.displayName);
  const source = resolveAvatar(comment, config);

  if (!source) {
    avatar.textContent = placeholder;
    return avatar;
  }

  const image = document.createElement("img");
  image.alt = "";
  image.loading = "lazy";
  image.decoding = "async";
  image.addEventListener("error", () => {
    const icon = document.createElement("iconify-icon");
    icon.setAttribute("icon", "tabler:alert-circle");
    icon.setAttribute("aria-hidden", "true");
    avatar.replaceChildren(icon);
  });
  image.src = source;
  avatar.append(image);
  return avatar;
};

const createMessage = (
  comment: HaloComment,
  lane: number,
  delay: number,
  duration: number,
  avatarConfig: AvatarConfig | null,
) => {
  const message = document.createElement("div");
  message.className = "floating-message";
  message.dataset.commentKey = commentKey(comment);
  message.style.setProperty("--message-lane", String(lane));
  message.style.setProperty("--message-duration", `${duration}s`);
  message.style.setProperty("--message-delay", `${delay}s`);

  const avatar = createAvatar(comment, avatarConfig);

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

  let signature = "";

  const refresh = async () => {
    try {
      // 头像配置与留言并行拉取：配置只取一次，取不到就按评论区的文字占位处理。
      const [comments, avatarConfig] = await Promise.all([fetchComments(name), loadAvatarConfig()]);
      setCount("", formatMessage(messages.message.count, comments.length));

      if (!comments.length) {
        signature = "";
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
      const messageCount = comments.length === 1 ? 1 : Math.min(4, comments.length - 1);
      const initialComments = [...comments].sort(() => Math.random() - 0.5).slice(0, messageCount);

      // 一条弹幕只负责内容与样式，什么时候换下一条由动画结束事件决定。
      const createMessageElement = (comment: HaloComment, index: number): HTMLElement => {
        const lane =
          messageCount === 1 ? 2 : Math.round((index * 5) / Math.max(1, messageCount - 1));
        const duration = 18 + Math.floor(Math.random() * 5);
        // 入场延迟：几条弹幕错开进场，不会同时挤在舞台右侧。
        const delay = index * 2.5;
        return createMessage(comment, lane, delay, duration, avatarConfig);
      };

      // 弹幕的生命周期跟着 CSS 动画走：动画播完 = 弹幕已经滚出舞台尾部，
      // 这时再换下一条继续飘，实现「滚到尾部自动消失」。
      //
      // 这里不用 setTimeout 掐表，因为定时器和动画进度会对不上：
      // 1. 弹幕带入场延迟，定时器只按滚动时长算，弹幕还在半路就被换掉，
      //    表现为「没滚到尾部就突然消失」；
      // 2. 鼠标悬停会暂停 CSS 动画，定时器却继续走，暂停期间弹幕同样被强行替换。
      const mountMessage = (message: HTMLElement, index: number) => {
        message.addEventListener("animationend", (event) => {
          if (event.target !== message || event.animationName !== "message-drift") {
            return;
          }

          // 舞台已经被刷新重建，或用户开启了「减少动效」时，不再替换。
          if (!message.isConnected || prefersReducedMotion()) {
            return;
          }

          const activeKeys = new Set(
            Array.from(stage.querySelectorAll<HTMLElement>("[data-comment-key]"))
              .filter((item) => item !== message)
              .map((item) => item.dataset.commentKey || ""),
          );
          const nextComment = randomComment(comments, activeKeys);
          const next = createMessageElement(nextComment, index);
          message.replaceWith(next);
          mountMessage(next, index);
        });
      };

      const wallMessages = initialComments.map((comment, index) =>
        createMessageElement(comment, index),
      );
      stage.replaceChildren(...wallMessages);
      wallMessages.forEach((message, index) => mountMessage(message, index));
    } catch {
      setCount("", messages.message.failed);
      setStatus(messages.message.failed);
    }
  };

  void refresh();

  // 后台标签页不轮询，回到前台时立即补一次。
  createPolling(() => void refresh(), 30_000);
};

setupMessageWall();
