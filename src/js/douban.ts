import "iconify-icon";
import { scrollBehavior } from "./shared/dom";
import { messages, formatMessage } from "./shared/i18n";
import { setupRepositoryFilters } from "./shared/repository-filters";
import { safeHref, safeSrc } from "./shared/url";

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
  mark: messages.douban.statusWant,
  doing: messages.douban.statusDoing,
  done: messages.douban.statusDone,
};

const statusOrder = ["mark", "doing", "done"];

// 插件 DoubanRequest.DoubanType 支持的完整分类维度。
// 接口只返回有数据的分类，这里补齐其余分类，保证分类维度完整。
const typeCatalog: DoubanType[] = [
  { key: "movie", name: messages.douban.movie },
  { key: "book", name: messages.douban.book },
  { key: "music", name: messages.douban.music },
  { key: "game", name: messages.douban.genreGame },
  { key: "drama", name: messages.douban.genreDrama },
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
};

const refs = {
  root: null as HTMLElement | null,
  total: null as HTMLElement | null,
  filters: null as HTMLElement | null,
  list: null as HTMLElement | null,
  empty: null as HTMLElement | null,
  pagination: null as HTMLElement | null,
  paginationHost: null as HTMLElement | null,
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

  wrapper.setAttribute(
    "title",
    filled ? formatMessage(messages.douban.myRating, filled) : messages.douban.unrated,
  );
  wrapper.setAttribute(
    "aria-label",
    filled ? formatMessage(messages.douban.myRating, filled) : messages.douban.unrated,
  );

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
  // 条目链接来自豆瓣插件，赋值前先做协议校验，避免 javascript: 之类的地址被点击执行。
  cover.href = safeHref(item.link);
  cover.target = "_blank";
  cover.rel = "noreferrer";
  cover.setAttribute("aria-hidden", "true");
  cover.tabIndex = -1;

  if (item.poster) {
    const image = document.createElement("img");
    const poster = safeSrc(item.poster);
    if (poster) {
      image.src = poster;
    }
    image.alt = "";
    image.loading = "lazy";
    cover.append(image);
  }

  const copy = createElement("div", "repository-list-copy");
  const heading = createElement("div", "repository-list-heading");
  const title = createElement("h2", "repository-list-title");

  const titleLink = document.createElement("a");
  titleLink.href = safeHref(item.link);
  titleLink.target = "_blank";
  titleLink.rel = "noreferrer";
  titleLink.textContent = (item.name || messages.common.noData)
    .replace(/[\u200e\u200f]/g, "")
    .trim();
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
  desc.textContent = (item.favesRemark || item.cardSubtitle || messages.common.noSummary).trim();
  copy.append(heading, desc);

  const meta = createElement("div", "repository-list-meta");

  const score = Number.parseFloat(item.score || "");

  if (!Number.isNaN(score) && score > 0) {
    const scoreBadge = createElement("span", "douban-list-score", score.toFixed(1));
    scoreBadge.title = formatMessage(messages.douban.scoreLabel, score.toFixed(1));
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
    // 只显示日期本身，避免为了一个前缀再引入一条需要翻译的文案。
    meta.append(createElement("span", "", markedAt));
  }

  copy.append(meta);

  const side = createElement("div", "douban-list-side");
  const status = item.favesStatus || "";

  side.append(
    createElement(
      "span",
      `douban-list-status douban-list-status--${status || "mark"}`,
      statusLabels[status] || messages.douban.unmarked,
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
    typeButton.textContent = state.type
      ? `${messages.douban.filterByType}: ${getTypeName(state.type)}`
      : messages.douban.filterByType;
  }

  if (statusButton) {
    statusButton.textContent = state.status
      ? `${messages.douban.filterByStatus}: ${statusLabels[state.status]}`
      : messages.douban.filterByStatus;
  }

  if (genreButton) {
    genreButton.textContent = state.genre
      ? `${messages.douban.filterByGenre}: ${state.genre}`
      : messages.douban.filterByGenre;
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
  const toolbar = createElement("div", "douban-toolbar");
  const filters = createElement("div", "repository-filters");
  filters.setAttribute("aria-label", messages.douban.filterLabel);

  filters.append(
    createFilterButton("douban-type", messages.douban.filterByType, Boolean(state.type)),
  );
  filters.append(
    createFilterMenu("douban-type", [
      { label: messages.douban.all, value: "" },
      ...state.types.map((type) => ({ label: type.name, value: type.key })),
    ]),
  );

  const counts = getStatusCounts();
  const statusOptions = [{ label: messages.douban.all, value: "" }];

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

  filters.append(
    createFilterButton("douban-status", messages.douban.filterByStatus, Boolean(state.status)),
  );
  filters.append(createFilterMenu("douban-status", statusOptions));

  filters.append(
    createFilterButton("douban-genre", messages.douban.filterByGenre, Boolean(state.genre)),
  );
  filters.append(
    createFilterMenu("douban-genre", [
      { label: messages.douban.all, value: "" },
      ...state.genres.map((genre) => ({ label: genre, value: genre })),
    ]),
  );

  // 筛选按钮靠右，与归档页工具栏保持同一套布局
  toolbar.append(filters);
  refs.filters = filters;

  return toolbar;
};

const buildPagination = (totalPages: number) => {
  const nodes: HTMLElement[] = [];

  if (totalPages <= 1) {
    return nodes;
  }

  const createNavButton = (page: number, label: string, disabled: boolean) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.disabled = disabled;
    button.dataset.doubanPage = String(page);
    button.setAttribute("aria-label", label);
    return button;
  };

  // 全站统一的翻页约定：上一页 - 当前页 / 总页数 - 下一页，
  // 没有可翻的一侧保持可见但禁用，而不是直接隐藏
  nodes.push(createNavButton(state.page - 1, messages.pagination.previous, state.page <= 1));

  nodes.push(createElement("span", "", `${state.page} / ${totalPages}`));

  nodes.push(createNavButton(state.page + 1, messages.pagination.next, state.page >= totalPages));

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

  if (refs.paginationHost) {
    refs.paginationHost.hidden = totalPages <= 1;
  }

  updateUrl();
};

const renderPanel = () => {
  const root = refs.root;

  if (!root) {
    return;
  }

  const toolbar = buildFilters();

  const list = createElement("ul", "repository-list douban-list");
  list.dataset.doubanList = "";
  refs.list = list;

  const empty = createEmptyState(messages.common.noData, messages.douban.empty);
  empty.hidden = true;
  refs.empty = empty;

  // 翻页复用归档页的分页组件，位置也放在面板之外，与其他页面保持一致
  const pagination = createElement("nav", "pagination");
  pagination.setAttribute("aria-label", messages.douban.paginationLabel);
  pagination.hidden = true;
  refs.pagination = pagination;

  // 翻页在面板之外，事件要单独绑定，不能依赖面板上的事件委托
  pagination.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const pageButton = target?.closest<HTMLButtonElement>("[data-douban-page]");

    if (!pageButton || pageButton.disabled) {
      return;
    }

    const page = Number.parseInt(pageButton.dataset.doubanPage || "", 10);

    if (Number.isFinite(page) && page !== state.page) {
      state.page = page;
      renderItems();
      refs.root?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    }
  });

  const paginationHost = document.querySelector<HTMLElement>("[data-douban-pagination]");

  if (paginationHost) {
    paginationHost.replaceChildren(pagination);
    paginationHost.hidden = true;
    refs.paginationHost = paginationHost;
    root.replaceChildren(toolbar, list, empty);
  } else {
    refs.paginationHost = null;
    root.replaceChildren(toolbar, list, empty, pagination);
  }

  setupRepositoryFilters();
  syncFilterMenus();
  renderItems();
};

// 每次切换类型都会递增序号：只有最后一次请求的结果才允许写进 state，
// 否则快速切换时「后发先至」会用旧类型的数据覆盖新类型。
let loadTypeRequestId = 0;

const loadType = async (type: string) => {
  const requestId = ++loadTypeRequestId;
  const [list, genres] = await Promise.all([
    // 列表请求失败必须往上抛，否则「加载失败」会被显示成「没有数据」。
    fetchJson<DoubanList>(`${apiBase}?page=0&size=100&type=${encodeURIComponent(type)}`),
    // 题材只是筛选项，拿不到时退化成「全部题材」，不影响主列表。
    fetchJson<string[]>(`${apiBase}/-/genres?type=${encodeURIComponent(type)}`).catch(() => []),
  ]);

  if (requestId !== loadTypeRequestId) {
    // 过期响应直接丢弃。
    return;
  }

  // 类型等筛选状态推迟到请求成功后再写入，避免加载期间就切走了旧筛选。
  state.type = type;
  state.status = "";
  state.genre = "";
  state.page = 1;
  state.items = (list.items || []).sort((left, right) => {
    const leftTime = left.favesCreateTime || "";
    const rightTime = right.favesCreateTime || "";
    return rightTime.localeCompare(leftTime);
  });
  state.genres = (genres || []).filter(Boolean);

  if (refs.total) {
    // 接口只返回前 100 条，计数要用接口给的总数，否则超过 100 条时会显示成 100。
    refs.total.textContent = String(list.total ?? state.items.length);
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

  const showError = (message: string) => {
    refs.filters = null;
    refs.list = null;
    refs.empty = null;
    refs.pagination = null;
    refs.paginationHost?.replaceChildren();
    refs.paginationHost = null;
    root.replaceChildren(createEmptyState(messages.toast.loadFailed, message));
  };

  root.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const option = target?.closest<HTMLElement>("[data-douban-filter]");

    if (option) {
      const kind = option.dataset.doubanFilter;
      const value = option.dataset.doubanFilterValue || "";

      if (kind === "douban-type") {
        if (value && value !== state.type) {
          void loadType(value).catch(() => {
            showError(messages.toast.networkError);
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
        showError(messages.douban.failed);
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
      showError(messages.douban.failed);
    }
  })();
};

setupDouban();
