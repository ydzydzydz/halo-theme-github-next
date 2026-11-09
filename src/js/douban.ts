import "iconify-icon";

type DoubanType = {
  key: string;
  name: string;
  doubanCount?: number;
};

type DoubanItem = {
  id?: string;
  name?: string;
  poster?: string;
  score?: string;
  type?: string;
  genres?: string[];
  year?: string;
  pubdate?: string;
  link?: string;
  favesStatus?: string;
  favesCreateTime?: string;
};

type DoubanList = {
  items?: DoubanItem[];
  total?: number;
};

const apiBase = "/apis/api.douban.moony.la/v1alpha1/doubanmovies";

const statusLabels: Record<string, string> = {
  mark: "想看",
  doing: "在看",
  done: "看过",
};

const statusOrder = ["mark", "doing", "done"];

const pageSize = 100;

const state = {
  types: [] as DoubanType[],
  type: "",
  status: "",
  genre: "",
  items: [] as DoubanItem[],
  genres: [] as string[],
};

const refs = {
  tabs: null as HTMLElement | null,
  segments: null as HTMLElement | null,
  genres: null as HTMLElement | null,
  grid: null as HTMLElement | null,
};

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
};

const createElement = (tag: string, className: string, text?: string) => {
  const element = document.createElement(tag);
  element.className = className;

  if (text !== undefined) {
    element.textContent = text;
  }

  return element;
};

const getVisibleItems = () =>
  state.items.filter((item) => {
    const matchesStatus = !state.status || item.favesStatus === state.status;
    const matchesGenre = !state.genre || (item.genres || []).includes(state.genre);
    return matchesStatus && matchesGenre;
  });

const getStatusCounts = () => {
  const counts = new Map<string, number>();

  state.items.forEach((item) => {
    const status = item.favesStatus || "";
    counts.set(status, (counts.get(status) || 0) + 1);
  });

  return counts;
};

const createCard = (item: DoubanItem) => {
  const card = document.createElement("a");
  card.className = "douban-card";
  card.href = item.link || "#";
  card.target = "_blank";
  card.rel = "noreferrer";

  const cover = document.createElement("span");
  cover.className = "douban-card-cover";

  if (item.poster) {
    const image = document.createElement("img");
    image.src = item.poster;
    image.alt = item.name || "";
    image.loading = "lazy";
    cover.append(image);
  }

  const body = createElement("span", "douban-card-body");
  const meta = createElement("span", "douban-card-meta");

  const score = Number.parseFloat(item.score || "");
  if (!Number.isNaN(score) && score > 0) {
    meta.append(createElement("span", "douban-card-score", score.toFixed(1)));
  }

  if (item.year) {
    meta.append(createElement("span", "douban-card-year", item.year));
  }

  body.append(createElement("span", "douban-card-title", item.name || "未命名"), meta);

  const genres = (item.genres || []).filter(Boolean);
  if (genres.length) {
    body.append(createElement("span", "douban-card-genres", genres.join(" · ")));
  }

  card.append(cover, body);
  return card;
};

const createEmptyState = (title: string, description: string) => {
  const empty = createElement("div", "links-empty");
  const icon = document.createElement("iconify-icon");
  icon.setAttribute("icon", "octicon:database-16");
  empty.append(icon, createElement("h2", "", title), createElement("p", "", description));
  return empty;
};

const createTabs = () => {
  const tabs = createElement("nav", "douban-tabs");
  tabs.setAttribute("aria-label", "豆瓣类型");

  state.types.forEach((type) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "douban-tab";
    tab.dataset.type = type.key;

    tab.append(createElement("span", "douban-tab-label", type.name || type.key));

    if (typeof type.doubanCount === "number") {
      tab.append(createElement("span", "douban-tab-count", String(type.doubanCount)));
    }

    tabs.append(tab);
  });

  return tabs;
};

const createSegments = () => {
  const counts = getStatusCounts();
  const wrapper = createElement("div", "douban-segments");

  const all = document.createElement("button");
  all.type = "button";
  all.className = "douban-segment";
  all.dataset.status = "";
  all.append(
    createElement("span", "douban-segment-label", "全部"),
    createElement("span", "douban-segment-count", String(state.items.length)),
  );
  wrapper.append(all);

  statusOrder.forEach((status) => {
    const count = counts.get(status) || 0;

    if (!count) {
      return;
    }

    const segment = document.createElement("button");
    segment.type = "button";
    segment.className = "douban-segment";
    segment.dataset.status = status;

    segment.append(
      createElement("span", "douban-segment-label", statusLabels[status] || status),
      createElement("span", "douban-segment-count", String(count)),
    );

    wrapper.append(segment);
  });

  return wrapper;
};

const createGenres = () => {
  const wrapper = createElement("div", "douban-genres");
  wrapper.setAttribute("aria-label", "作品类型");

  ["", ...state.genres].forEach((genre) => {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "douban-genre";
    pill.dataset.genre = genre;
    pill.textContent = genre || "全部";
    wrapper.append(pill);
  });

  return wrapper;
};

const syncActiveState = () => {
  refs.tabs?.querySelectorAll<HTMLElement>("[data-type]").forEach((tab) => {
    const active = tab.dataset.type === state.type;
    tab.classList.toggle("is-active", active);

    if (active) {
      tab.setAttribute("aria-current", "true");
    } else {
      tab.removeAttribute("aria-current");
    }
  });

  refs.segments?.querySelectorAll<HTMLElement>("[data-status]").forEach((segment) => {
    segment.classList.toggle("is-active", segment.dataset.status === state.status);
  });

  refs.genres?.querySelectorAll<HTMLElement>("[data-genre]").forEach((pill) => {
    pill.classList.toggle("is-active", pill.dataset.genre === state.genre);
  });
};

const renderItems = () => {
  const items = getVisibleItems();
  const grid = refs.grid;

  if (!grid) {
    return;
  }

  const cards = items.map((item) => createCard(item));
  grid.replaceChildren(...cards);
  grid.hidden = !items.length;

  const empty = grid.nextElementSibling as HTMLElement | null;
  if (empty?.classList.contains("links-empty")) {
    empty.hidden = items.length > 0;
  }
};
const buildPanel = (root: HTMLElement) => {
  const toolbar = createElement("div", "douban-toolbar");
  refs.tabs = createTabs();
  refs.segments = createSegments();
  refs.genres = createGenres();

  toolbar.append(refs.tabs);

  if (refs.segments.childElementCount) {
    toolbar.append(refs.segments);
  }

  if (state.genres.length) {
    toolbar.append(refs.genres);
  }

  refs.grid = createElement("div", "douban-grid");
  const empty = createEmptyState("暂无记录", "还没有符合当前筛选条件的豆瓣条目。");
  empty.hidden = true;

  root.replaceChildren(toolbar, refs.grid, empty);
};

const renderPanel = (root: HTMLElement) => {
  buildPanel(root);
  syncActiveState();
  renderItems();
};

const loadType = async (root: HTMLElement, total: HTMLElement | null, type: string) => {
  state.type = type;
  state.status = "";
  state.genre = "";
  state.items = [];

  const [list, genres] = await Promise.all([
    fetchJson<DoubanList>(`${apiBase}?page=0&size=${pageSize}&type=${encodeURIComponent(type)}`),
    fetchJson<string[]>(`${apiBase}/-/genres?type=${encodeURIComponent(type)}`).catch(() => []),
  ]);

  state.items = (list.items || []).sort((a, b) => {
    const left = a.favesCreateTime || "";
    const right = b.favesCreateTime || "";
    return right.localeCompare(left);
  });
  state.genres = genres.filter(Boolean);

  if (total) {
    total.textContent = String(state.items.length);
  }

  renderPanel(root);
};

const setupDouban = () => {
  const root = document.querySelector<HTMLElement>("[data-douban-app]");
  const total = document.querySelector<HTMLElement>("[data-douban-total]");

  if (!root) {
    return;
  }

  const showError = (message: string) => {
    refs.tabs = null;
    refs.segments = null;
    refs.genres = null;
    refs.grid = null;
    root.replaceChildren(createEmptyState("豆瓣记录读取失败", message));
  };

  root.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const tab = target?.closest<HTMLElement>("[data-type]");
    const segment = target?.closest<HTMLElement>("[data-status]");
    const genre = target?.closest<HTMLElement>("[data-genre]");

    if (tab?.dataset.type && tab.dataset.type !== state.type) {
      void loadType(root, total, tab.dataset.type).catch(() => {
        showError("请稍后重试。");
      });
      return;
    }

    if (segment?.dataset.status !== undefined) {
      state.status = segment.dataset.status;
      syncActiveState();
      renderItems();
      return;
    }

    if (genre?.dataset.genre !== undefined) {
      state.genre = genre.dataset.genre;
      syncActiveState();
      renderItems();
    }
  });

  void (async () => {
    try {
      const types = await fetchJson<DoubanType[]>(`${apiBase}/-/types`);
      state.types = (types || []).filter((type) => type.key);

      if (!state.types.length) {
        showError("未获取到可用的豆瓣类型。");
        return;
      }

      await loadType(root, total, state.types[0].key);
    } catch {
      showError("请确认已安装并启用豆瓣插件后重试。");
    }
  })();
};

setupDouban();
