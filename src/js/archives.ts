/**
 * 归档页内联搜索。
 *
 * 交互对齐 GitHub 的仓库页：搜索框常驻工具栏，输入关键词后
 * 下方列表直接换成全站搜索结果，不再弹出遮罩层；
 * 清空输入（或点「退出搜索」）即恢复服务端渲染的原始列表与分页。
 */
import { pageLocale } from "./shared/dom";
import { formatMessage, messages } from "./shared/i18n";
import { querySiteSearch, renderSearchText, type SearchHit } from "./shared/search";

/** 单次搜索最多展示多少条结果。 */
const resultLimit = 20;
/** 输入停顿多久后发起搜索。 */
const debounceDelay = 260;
/** 结果摘要的最大长度。 */
const excerptLength = 120;

type TaxonomyEntry = {
  display: string;
  permalink: string;
};

const input = document.querySelector<HTMLInputElement>("[data-archive-search-input]");
const clearButton = document.querySelector<HTMLButtonElement>("[data-archive-search-clear]");
const statusBox = document.querySelector<HTMLElement>("[data-archive-search-status]");
const statusText = document.querySelector<HTMLElement>("[data-archive-search-status-text]");
const exitButton = document.querySelector<HTMLButtonElement>("[data-archive-search-exit]");
const list = document.querySelector<HTMLElement>("[data-archive-search-list]");
const pagination = document.querySelector<HTMLElement>("[data-archive-pagination]");
const taxonomyBox = document.querySelector<HTMLElement>("[data-archive-taxonomy]");
const field = document.querySelector<HTMLElement>("[data-archive-search-field]");

if (input && list) {
  const categories = new Map<string, TaxonomyEntry>();
  const tags = new Map<string, TaxonomyEntry>();

  taxonomyBox?.querySelectorAll<HTMLElement>("span[data-name]").forEach((node) => {
    const name = node.dataset.name;
    const display = node.dataset.display;

    if (!name || !display) {
      return;
    }

    const entry: TaxonomyEntry = { display, permalink: node.dataset.permalink || "" };

    if (node.dataset.kind === "tag") {
      tags.set(name, entry);
    } else {
      categories.set(name, entry);
    }
  });

  /** 服务端渲染的原始列表，退出搜索时原样放回。 */
  const originalItems = Array.from(list.childNodes);

  let controller: AbortController | undefined;
  let debounceTimer = 0;

  /** 搜索进行中：输入框外层加标记，边框转为强调色（与主题其它控件一致，不用阴影）。 */
  const setSearching = (searching: boolean) => {
    field?.classList.toggle("is-searching", searching);
  };

  const showStatus = (text: string) => {
    if (!statusText) {
      return;
    }

    statusText.textContent = text;
    statusBox?.removeAttribute("hidden");
  };

  const syncClearButton = () => {
    if (clearButton) {
      clearButton.hidden = !input.value.trim();
    }
  };

  /** 退出搜索模式：还原原始列表与分页。 */
  const exitSearch = () => {
    controller?.abort();
    controller = undefined;
    list.replaceChildren(...originalItems);
    statusBox?.setAttribute("hidden", "");
    pagination?.removeAttribute("hidden");
    setSearching(false);
  };

  /** 与服务端 #temporals.format(..., 'MMM d') 保持一致：3月 22 / Mar 22 */
  const formatDate = (value?: string) => {
    if (!value) {
      return "";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    try {
      const locale = pageLocale();
      const month = new Intl.DateTimeFormat(locale, { month: "short" }).format(date);

      // Intl 的 day 在中文下会带「日」后缀，这里取纯数字，与服务端保持一致
      return `${month} ${date.getDate()}`;
    } catch {
      return "";
    }
  };

  const buildResultItem = (hit: SearchHit, keyword: string) => {
    const item = document.createElement("li");
    item.className = "repository-list-item repository-list-item--search";

    const copy = document.createElement("div");
    copy.className = "repository-list-copy";

    const heading = document.createElement("div");
    heading.className = "repository-list-heading";

    const title = document.createElement("h2");
    title.className = "repository-list-title";

    const link = document.createElement("a");
    link.href = hit.permalink || "#";
    renderSearchText(link, hit.title || "", keyword);
    title.append(link);
    heading.append(title);

    const tagBox = document.createElement("span");
    tagBox.className = "repository-title-tags";

    (hit.tags || []).forEach((name) => {
      const entry = tags.get(name);

      if (!entry) {
        return;
      }

      const tagLink = document.createElement("a");
      tagLink.className = "repository-title-tag";
      tagLink.href = entry.permalink || "#";
      tagLink.textContent = entry.display;
      tagBox.append(tagLink);
    });

    if (tagBox.childElementCount) {
      heading.append(tagBox);
    }

    const desc = document.createElement("p");
    desc.className = "repository-list-desc";
    renderSearchText(desc, hit.description || hit.content || "", keyword, excerptLength);

    const meta = document.createElement("div");
    meta.className = "repository-list-meta";

    const dot = document.createElement("span");
    dot.className = "language-dot";
    meta.append(dot);

    const category = (hit.categories || [])
      .map((name) => categories.get(name))
      .find((entry) => Boolean(entry));

    if (category) {
      const categoryLink = document.createElement("a");
      categoryLink.href = category.permalink || "#";
      categoryLink.textContent = category.display;
      meta.append(categoryLink);
    }

    const date = formatDate(hit.creationTimestamp);

    if (date) {
      const time = document.createElement("time");
      time.dateTime = hit.creationTimestamp || "";
      time.textContent = `${messages.common.updated} ${date}`;
      meta.append(time);
    }

    copy.append(heading, desc, meta);
    item.append(copy);

    return item;
  };

  const runSearch = async (keyword: string) => {
    controller?.abort();
    controller = new AbortController();

    showStatus(messages.search.searching);
    setSearching(true);

    try {
      const data = await querySiteSearch(keyword, {
        limit: resultLimit,
        signal: controller.signal,
      });
      const hits = data.hits || [];
      const total = data.total ?? hits.length;

      pagination?.setAttribute("hidden", "");

      if (!hits.length) {
        list.replaceChildren();
        showStatus(formatMessage(messages.search.noResultWithKeyword, keyword));
        return;
      }

      list.replaceChildren(...hits.map((hit) => buildResultItem(hit, keyword)));

      const count = formatMessage(messages.search.resultCount, total);

      showStatus(
        total > hits.length
          ? `${count}（${formatMessage(messages.archives.searchTruncated, hits.length)}）`
          : count,
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      list.replaceChildren();
      showStatus(messages.search.temporarilyUnavailable);
    }
  };

  const scheduleSearch = () => {
    window.clearTimeout(debounceTimer);
    syncClearButton();

    const keyword = input.value.trim();

    if (!keyword) {
      exitSearch();
      return;
    }

    debounceTimer = window.setTimeout(() => void runSearch(keyword), debounceDelay);
  };

  input.addEventListener("input", scheduleSearch);

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      window.clearTimeout(debounceTimer);

      const keyword = input.value.trim();

      if (keyword) {
        void runSearch(keyword);
      } else {
        exitSearch();
      }

      return;
    }

    if (event.key === "Escape" && input.value) {
      event.preventDefault();
      input.value = "";
      scheduleSearch();
    }
  });

  clearButton?.addEventListener("click", () => {
    input.value = "";
    syncClearButton();
    exitSearch();
    input.focus();
  });

  exitButton?.addEventListener("click", () => {
    input.value = "";
    syncClearButton();
    exitSearch();
    input.focus();
  });
}
