import "iconify-icon";
import { setupRepositoryFilters } from "./shared/repository-filters";

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
  cardSubtitle?: string;
  doubanId?: string;
  favesStatus?: string;
  favesCreateTime?: string;
  favesRemark?: string;
  favesScore?: string;
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

// 插件 DoubanRequest.DoubanType 支持的完整分类维度。
// 接口只返回有数据的分类，这里补齐其余分类，保证分类维度完整。
const typeCatalog: DoubanType[] = [
  { key: "movie", name: "电影" },
  { key: "book", name: "图书" },
  { key: "music", name: "音乐" },
  { key: "game", name: "游戏" },
  { key: "drama", name: "舞台剧" },
];

const pageSize = 12;

const state = {
  types: [] as DoubanType[],
  type: "",
  status: "",
  genre: "",
  page: 1,
  items: [] as DoubanItem[],
  genres: [] as string[],
  detailApi: "",
};

const refs = {
  root: null as HTMLElement | null,
  total: null as HTMLElement | null,
  filters: null as HTMLElement | null,
  list: null as HTMLElement | null,
  empty: null as HTMLElement | null,
  pagination: null as HTMLElement | null,
};

const introCache = new Map<string, string>();

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

const createIcon = (name: string) => {
  const icon = document.createElement("iconify-icon");
  icon.setAttribute("icon", name);
  icon.setAttribute("aria-hidden", "true");
  return icon;
};

const formatDate = (value?: string) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
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

const getTypeName = (key: string) => state.types.find((type) => type.key === key)?.name || key;

const createStars = (score?: string) => {
  const wrapper = createElement("span", "douban-list-stars");
  const value = Number.parseInt(score || "", 10);
  const filled = Number.isFinite(value) ? Math.min(Math.max(value, 0), 5) : 0;

  wrapper.setAttribute("title", filled ? `我的评分 ${filled} 星` : "未评分");
  wrapper.setAttribute("aria-label", filled ? `我的评分 ${filled} 星` : "未评分");

  for (let index = 1; index <= 5; index += 1) {
    const icon = createIcon(index <= filled ? "octicon:star-fill-16" : "octicon:star-16");

    if (index > filled) {
      icon.classList.add("douban-list-star--empty");
    }

    wrapper.append(icon);
  }

  return wrapper;
};

const createListItem = (item: DoubanItem) => {
  const listItem = document.createElement("li");
  listItem.className = "repository-list-item douban-list-item";

  const cover = document.createElement("a");
  cover.className = "douban-list-cover";
  cover.href = item.link || "#";
  cover.target = "_blank";
  cover.rel = "noreferrer";
  cover.setAttribute("aria-hidden", "true");
  cover.tabIndex = -1;

  if (item.poster) {
    const image = document.createElement("img");
    image.src = item.poster;
    image.alt = "";
    image.loading = "lazy";
    cover.append(image);
  }

  const copy = createElement("div", "repository-list-copy");
  const heading = createElement("div", "repository-list-heading");
  const title = createElement("h2", "repository-list-title");

  const titleLink = document.createElement("a");
  titleLink.href = item.link || "#";
  titleLink.target = "_blank";
  titleLink.rel = "noreferrer";
  titleLink.textContent = (item.name || "未命名").replace(/[\u200e\u200f]/g, "").trim();
  title.append(titleLink);
  heading.append(title);

  const genres = (item.genres || []).filter(Boolean);

  if (genres.length) {
    const tags = createElement("span", "repository-title-tags");

    genres.forEach((genre) => {
      tags.append(createElement("span", "repository-title-tag", genre));
    });

    heading.append(tags);
  }

  const desc = createElement("p", "repository-list-desc");
  desc.dataset.doubanDesc = item.id || "";
  desc.textContent = (item.favesRemark || item.cardSubtitle || "暂无简介").trim();
  copy.append(heading, desc);

  const meta = createElement("div", "repository-list-meta");

  const score = Number.parseFloat(item.score || "");

  if (!Number.isNaN(score) && score > 0) {
    const scoreBadge = createElement("span", "douban-list-score", score.toFixed(1));
    scoreBadge.title = `豆瓣评分 ${score.toFixed(1)}`;
    meta.append(scoreBadge);
  }

  const itemType = item.type || state.type;

  if (itemType && itemType !== state.type) {
    meta.append(createElement("span", "", getTypeName(itemType)));
  }

  if (item.year) {
    meta.append(createElement("span", "", item.year));
  }

  const markedAt = formatDate(item.favesCreateTime);

  if (markedAt) {
    meta.append(createElement("span", "", `标记于 ${markedAt}`));
  }

  copy.append(meta);

  const side = createElement("div", "douban-list-side");
  const status = item.favesStatus || "";

  side.append(
    createElement(
      "span",
      `douban-list-status douban-list-status--${status || "mark"}`,
      statusLabels[status] || "未标记",
    ),
  );

  if (item.favesScore) {
    side.append(createStars(item.favesScore));
  }

  listItem.append(cover, copy, side);
  return listItem;
};

const createEmptyState = (title: string, description: string) => {
  const empty = createElement("div", "links-empty");
  empty.append(createIcon("octicon:database-16"), createElement("h2", "", title));
  empty.append(createElement("p", "", description));
  return empty;
};

const createFilterButton = (kind: string, label: string, active: boolean) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "repository-filter-button";
  button.dataset.repositoryFilter = kind;
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-haspopup", "true");
  button.dataset.repositoryFilterDefault = label;

  if (active) {
    button.classList.add("is-active");
  }

  const text = createElement("span", "", label);
  text.dataset.repositoryFilterLabel = "";
  button.append(text, createElement("span", "chevron"));
  return button;
};

const createFilterMenu = (kind: string, options: { label: string; value: string }[]) => {
  const menu = createElement("div", "repository-filter-menu");
  menu.dataset.repositoryFilterMenu = kind;
  menu.setAttribute("role", "menu");
  menu.hidden = true;

  options.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "repository-filter-option";
    button.dataset.doubanFilter = kind;
    button.dataset.doubanFilterValue = option.value;
    button.textContent = option.label;
    menu.append(button);
  });

  return menu;
};

const syncFilterMenus = () => {
  const filters = refs.filters;

  if (!filters) {
    return;
  }

  const typeMenu = filters.querySelector<HTMLElement>(
    '[data-repository-filter-menu="douban-type"]',
  );
  const statusMenu = filters.querySelector<HTMLElement>(
    '[data-repository-filter-menu="douban-status"]',
  );
  const genreMenu = filters.querySelector<HTMLElement>(
    '[data-repository-filter-menu="douban-genre"]',
  );

  typeMenu?.querySelectorAll<HTMLElement>("[data-douban-filter-value]").forEach((option) => {
    option.classList.toggle("is-active", option.dataset.doubanFilterValue === state.type);
  });

  statusMenu?.querySelectorAll<HTMLElement>("[data-douban-filter-value]").forEach((option) => {
    option.classList.toggle("is-active", option.dataset.doubanFilterValue === state.status);
  });

  genreMenu?.querySelectorAll<HTMLElement>("[data-douban-filter-value]").forEach((option) => {
    option.classList.toggle("is-active", option.dataset.doubanFilterValue === state.genre);
  });

  const typeButton = filters.querySelector<HTMLElement>(
    '[data-repository-filter="douban-type"] [data-repository-filter-label]',
  );
  const statusButton = filters.querySelector<HTMLElement>(
    '[data-repository-filter="douban-status"] [data-repository-filter-label]',
  );
  const genreButton = filters.querySelector<HTMLElement>(
    '[data-repository-filter="douban-genre"] [data-repository-filter-label]',
  );

  if (typeButton) {
    typeButton.textContent = state.type ? `类型：${getTypeName(state.type)}` : "类型";
  }

  if (statusButton) {
    statusButton.textContent = state.status ? `状态：${statusLabels[state.status]}` : "状态";
  }

  if (genreButton) {
    genreButton.textContent = state.genre ? `题材：${state.genre}` : "题材";
  }

  filters
    .querySelector<HTMLElement>('[data-repository-filter="douban-type"]')
    ?.classList.toggle("is-active", Boolean(state.type));
  filters
    .querySelector<HTMLElement>('[data-repository-filter="douban-status"]')
    ?.classList.toggle("is-active", Boolean(state.status));
  filters
    .querySelector<HTMLElement>('[data-repository-filter="douban-genre"]')
    ?.classList.toggle("is-active", Boolean(state.genre));
};

const buildFilters = () => {
  const filters = createElement("div", "repository-filters");
  filters.setAttribute("aria-label", "豆瓣筛选");

  filters.append(createFilterButton("douban-type", "类型", Boolean(state.type)));
  filters.append(
    createFilterMenu("douban-type", [
      { label: "全部类型", value: "" },
      ...state.types.map((type) => ({ label: type.name, value: type.key })),
    ]),
  );

  const counts = getStatusCounts();
  const statusOptions = [{ label: "全部状态", value: "" }];

  statusOrder.forEach((status) => {
    const count = counts.get(status) || 0;

    if (!count) {
      return;
    }

    statusOptions.push({
      label: `${statusLabels[status]} ${count}`,
      value: status,
    });
  });

  filters.append(createFilterButton("douban-status", "状态", Boolean(state.status)));
  filters.append(createFilterMenu("douban-status", statusOptions));

  filters.append(createFilterButton("douban-genre", "题材", Boolean(state.genre)));
  filters.append(
    createFilterMenu("douban-genre", [
      { label: "全部题材", value: "" },
      ...state.genres.map((genre) => ({ label: genre, value: genre })),
    ]),
  );

  return filters;
};

const buildPagination = (totalPages: number) => {
  const nodes: HTMLElement[] = [];

  if (totalPages <= 1) {
    return nodes;
  }

  const createPageButton = (page: number, label: string, active = false, disabled = false) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.dataset.doubanPage = String(page);
    button.setAttribute("aria-label", `第 ${page} 页`);

    if (active) {
      button.classList.add("is-active");
      button.setAttribute("aria-current", "page");
    }

    if (disabled) {
      button.disabled = true;
    }

    return button;
  };

  nodes.push(createPageButton(state.page - 1, "上一页", false, state.page <= 1));

  const pages = new Set<number>([1, totalPages, state.page]);

  pages.add(state.page - 1);
  pages.add(state.page + 1);

  const visible = Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((left, right) => left - right);

  visible.forEach((page, index) => {
    const previous = visible[index - 1];

    if (previous && page - previous > 1) {
      nodes.push(createElement("span", "douban-pagination-gap", "…"));
    }

    nodes.push(createPageButton(page, String(page), page === state.page));
  });

  nodes.push(createPageButton(state.page + 1, "下一页", false, state.page >= totalPages));

  return nodes;
};

const updateUrl = () => {
  const params = new URLSearchParams();

  if (state.type) {
    params.set("type", state.type);
  }

  if (state.status) {
    params.set("status", state.status);
  }

  if (state.genre) {
    params.set("genre", state.genre);
  }

  if (state.page > 1) {
    params.set("page", String(state.page));
  }

  const query = params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ""}`;

  window.history.replaceState(null, "", url);
};

const loadDetailIntro = async (item: DoubanItem) => {
  const key = item.id || item.doubanId || "";

  if (!state.detailApi || !key) {
    return;
  }

  if (introCache.has(key)) {
    const cached = introCache.get(key);

    if (cached) {
      const desc = refs.list?.querySelector<HTMLElement>(`[data-douban-desc="${key}"]`);

      if (desc) {
        desc.textContent = cached;
      }
    }

    return;
  }

  const url = state.detailApi
    .replaceAll("{type}", encodeURIComponent(item.type || state.type))
    .replaceAll("{id}", encodeURIComponent(item.doubanId || key));

  try {
    const payload = await fetchJson<Record<string, unknown>>(url);
    const intro =
      (typeof payload.intro === "string" && payload.intro.trim()) ||
      (typeof payload.description === "string" && payload.description.trim()) ||
      "";

    introCache.set(key, intro);

    if (intro) {
      const desc = refs.list?.querySelector<HTMLElement>(`[data-douban-desc="${key}"]`);

      if (desc) {
        desc.textContent = intro;
      }
    }
  } catch {
    introCache.set(key, "");
  }
};

const renderItems = () => {
  const list = refs.list;

  if (!list) {
    return;
  }

  const items = getVisibleItems();
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(Math.max(state.page, 1), totalPages);
  state.page = currentPage;

  const pageItems = items.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  list.replaceChildren(...pageItems.map((item) => createListItem(item)));
  list.hidden = !pageItems.length;

  if (refs.empty) {
    refs.empty.hidden = pageItems.length > 0;
  }

  if (refs.pagination) {
    refs.pagination.replaceChildren(...buildPagination(totalPages));
    refs.pagination.hidden = totalPages <= 1;
  }

  pageItems.forEach((item) => {
    void loadDetailIntro(item);
  });

  updateUrl();
};

const renderPanel = () => {
  const root = refs.root;

  if (!root) {
    return;
  }

  const filters = buildFilters();
  refs.filters = filters;

  const list = createElement("ul", "repository-list douban-list");
  list.dataset.doubanList = "";
  refs.list = list;

  const empty = createEmptyState("暂无记录", "还没有符合当前筛选条件的豆瓣条目。");
  empty.hidden = true;
  refs.empty = empty;

  const pagination = createElement("nav", "douban-pagination");
  pagination.hidden = true;
  refs.pagination = pagination;

  root.replaceChildren(filters, list, empty, pagination);
  setupRepositoryFilters();
  syncFilterMenus();
  renderItems();
};

const loadType = async (type: string) => {
  state.type = type;
  state.status = "";
  state.genre = "";
  state.page = 1;
  state.items = [];

  const [list, genres] = await Promise.all([
    fetchJson<DoubanList>(`${apiBase}?page=0&size=100&type=${encodeURIComponent(type)}`).catch(
      () => ({ items: [] }) as DoubanList,
    ),
    fetchJson<string[]>(`${apiBase}/-/genres?type=${encodeURIComponent(type)}`).catch(() => []),
  ]);

  state.items = (list.items || []).sort((left, right) => {
    const leftTime = left.favesCreateTime || "";
    const rightTime = right.favesCreateTime || "";
    return rightTime.localeCompare(leftTime);
  });
  state.genres = (genres || []).filter(Boolean);

  if (refs.total) {
    refs.total.textContent = String(state.items.length);
  }

  renderPanel();
};

const setupDouban = () => {
  const root = document.querySelector<HTMLElement>("[data-douban-app]");

  if (!root) {
    return;
  }

  refs.root = root;
  refs.total = document.querySelector<HTMLElement>("[data-douban-total]");
  state.detailApi = root.dataset.doubanDetailApi?.trim() || "";

  const showError = (message: string) => {
    refs.filters = null;
    refs.list = null;
    refs.empty = null;
    refs.pagination = null;
    root.replaceChildren(createEmptyState("豆瓣记录读取失败", message));
  };

  root.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const option = target?.closest<HTMLElement>("[data-douban-filter]");
    const pageButton = target?.closest<HTMLButtonElement>("[data-douban-page]");

    if (option) {
      const kind = option.dataset.doubanFilter;
      const value = option.dataset.doubanFilterValue || "";

      if (kind === "douban-type") {
        if (value && value !== state.type) {
          void loadType(value).catch(() => {
            showError("请稍后重试。");
          });
        }

        return;
      }

      if (kind === "douban-status") {
        state.status = value;
      } else if (kind === "douban-genre") {
        state.genre = value;
      }

      state.page = 1;
      syncFilterMenus();
      renderItems();
      return;
    }

    if (pageButton && !pageButton.disabled) {
      const page = Number.parseInt(pageButton.dataset.doubanPage || "", 10);

      if (Number.isFinite(page) && page !== state.page) {
        state.page = page;
        renderItems();
        refs.root?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  });

  void (async () => {
    try {
      const types = await fetchJson<DoubanType[]>(`${apiBase}/-/types`);
      const available = (types || []).filter((type) => type.key);

      state.types = typeCatalog.map((type) => {
        const matched = available.find((item) => item.key === type.key);
        return matched
          ? { ...type, name: matched.name || type.name, doubanCount: matched.doubanCount }
          : type;
      });

      available.forEach((type) => {
        if (!state.types.some((item) => item.key === type.key)) {
          state.types.push(type);
        }
      });

      if (!state.types.length) {
        showError("未获取到可用的豆瓣类型。");
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const requestedType = params.get("type") || "";
      const initialType = state.types.some((type) => type.key === requestedType)
        ? requestedType
        : state.types[0].key;

      await loadType(initialType);

      const requestedStatus = params.get("status") || "";
      const requestedGenre = params.get("genre") || "";
      const requestedPage = Number.parseInt(params.get("page") || "1", 10);

      if (requestedStatus && statusLabels[requestedStatus]) {
        state.status = requestedStatus;
      }

      if (requestedGenre && state.genres.includes(requestedGenre)) {
        state.genre = requestedGenre;
      }

      if (Number.isFinite(requestedPage) && requestedPage > 1) {
        state.page = requestedPage;
      }

      syncFilterMenus();
      renderItems();
    } catch {
      showError("请确认已安装并启用豆瓣插件后重试。");
    }
  })();
};

setupDouban();
