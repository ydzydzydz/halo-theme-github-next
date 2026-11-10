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

type CommentList = {
  items?: HaloComment[];
  total?: number;
  totalPages?: number;
};

const commentEndpoint = "/apis/api.halo.run/v1alpha1/comments";
const commentDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
});

const getCommentText = (comment: HaloComment) => {
  const container = document.createElement("div");
  container.innerHTML = comment.spec?.content || "";
  return container.textContent?.replace(/\s+/g, " ").trim() || "留下一条消息";
};

const fetchComments = async (name: string) => {
  const comments: HaloComment[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const query = new URLSearchParams({
      group: "content.halo.run",
      kind: "SinglePage",
      name,
      page: String(page),
      size: "100",
      version: "alpha1",
    });
    const response = await fetch(`${commentEndpoint}?${query}`, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Unable to load comments: ${response.status}`);
    }

    const result = (await response.json()) as CommentList;
    comments.push(...(result.items || []));
    totalPages = Math.max(1, result.totalPages || 1);
    page += 1;
  } while (page <= totalPages);

  return comments.filter((comment) => comment.spec?.approved !== false && !comment.spec?.hidden);
};

const commentKey = (comment: HaloComment) =>
  comment.metadata?.name || `${comment.owner?.displayName}:${comment.spec?.creationTime}`;

const createMessage = (comment: HaloComment, lane: number, delay: number) => {
  const message = document.createElement("div");
  message.className = "floating-message";
  message.dataset.commentKey = commentKey(comment);
  message.style.setProperty("--message-lane", String(lane));
  message.style.setProperty("--message-duration", `${18 + Math.floor(Math.random() * 5)}s`);
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
    avatar.textContent = (comment.owner?.displayName || "访").slice(0, 1);
  }

  const body = document.createElement("span");
  body.className = "floating-message-body";

  const owner = document.createElement("strong");
  owner.textContent = comment.owner?.displayName || "访客";

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

  let signature = "";

  const refresh = async () => {
    try {
      const comments = await fetchComments(name);
      setCount(String(comments.length), "条留言");

      if (!comments.length) {
        signature = "";
        stage.replaceChildren(status);
        status.hidden = false;
        status.querySelector("span")!.textContent = "还没有留言，来写下第一条吧。";
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
      const createLoopingMessage = (comment: HaloComment, index: number): HTMLElement => {
        const lane =
          messageCount === 1 ? 2 : Math.round((index * 5) / Math.max(1, messageCount - 1));
        const message = createMessage(comment, lane, index * 2.5);

        message.addEventListener("animationend", () => {
          const activeKeys = new Set(
            Array.from(stage.querySelectorAll<HTMLElement>("[data-comment-key]"))
              .filter((item) => item !== message)
              .map((item) => item.dataset.commentKey || ""),
          );
          const nextComment = randomComment(comments, activeKeys);
          message.replaceWith(createLoopingMessage(nextComment, index));
        });

        return message;
      };
      const messages = initialComments.map((comment, index) =>
        createLoopingMessage(comment, index),
      );
      stage.replaceChildren(...messages);
    } catch {
      setCount("", "留言暂不可用");
      stage.replaceChildren(status);
      status.hidden = false;
      status.querySelector("span")!.textContent = "留言加载失败，请稍后重试。";
    }
  };

  void refresh();
  window.setInterval(() => {
    if (!document.hidden) {
      void refresh();
    }
  }, 30_000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      void refresh();
    }
  });
};

setupMessageWall();
