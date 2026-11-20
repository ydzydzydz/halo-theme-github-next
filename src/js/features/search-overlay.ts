import { formatMessage, messages } from "../shared/i18n";
/**
 * 顶栏搜索弹窗：输入关键词实时查询站内内容。
 */
import { isTypingEvent } from "../shared/is-typing";
import { querySiteSearch, renderSearchText, type SearchHit } from "../shared/search";

const createResultItem = (hit: SearchHit, keyword: string) => {
  const link = document.createElement("a");
  link.className = "search-result-item";
  link.href = hit.permalink || "#";

  const title = document.createElement("span");
  title.className = "search-result-title";
  // 接口把命中词包在 <mark> 里，交给 renderSearchText 转成高亮元素
  renderSearchText(title, hit.title || "", keyword);

  if (!title.textContent) {
    title.textContent = "Untitled";
  }

  const description = document.createElement("span");
  description.className = "search-result-desc";
  renderSearchText(description, hit.description || hit.content || "", keyword, 160);

  if (!description.textContent) {
    description.textContent = "No description provided.";
  }

  link.append(title, description);
  return link;
};

export const setupSearch = () => {
  const triggers = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-search-trigger]"),
  );
  const overlay = document.querySelector<HTMLElement>("[data-search-overlay]");
  const form = document.querySelector<HTMLFormElement>("[data-search-form]");
  const input = document.querySelector<HTMLInputElement>("[data-search-input]");
  const closeButton = document.querySelector<HTMLButtonElement>("[data-search-close]");
  const status = document.querySelector<HTMLElement>("[data-search-status]");
  const results = document.querySelector<HTMLElement>("[data-search-results]");

  if (!triggers.length || !overlay || !form || !input || !closeButton || !status || !results) {
    return;
  }

  let debounceTimer = 0;
  let controller: AbortController | undefined;

  const openSearch = () => {
    overlay.hidden = false;
    document.documentElement.classList.add("search-open");
    input.focus();
  };

  const closeSearch = () => {
    overlay.hidden = true;
    document.documentElement.classList.remove("search-open");
    input.value = "";
    status.textContent = messages.search.status;
    results.replaceChildren();
    controller?.abort();
  };

  const renderResults = (data: { hits?: SearchHit[]; total?: number }, keyword: string) => {
    results.replaceChildren();

    if (!data.hits?.length) {
      status.textContent = formatMessage(messages.search.noResultWithKeyword, keyword);
      return;
    }

    status.textContent = formatMessage(messages.search.resultCount, data.total ?? data.hits.length);
    results.append(...data.hits.map((hit) => createResultItem(hit, keyword)));
  };

  const search = async () => {
    const keyword = input.value.trim();
    controller?.abort();

    if (!keyword) {
      status.textContent = messages.search.status;
      results.replaceChildren();
      return;
    }

    controller = new AbortController();
    status.textContent = messages.search.searching;

    try {
      const data = await querySiteSearch(keyword, { limit: 8, signal: controller.signal });

      renderResults(data, keyword);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      status.textContent = messages.search.temporarilyUnavailable;
    }
  };

  triggers.forEach((trigger) => trigger.addEventListener("click", openSearch));
  closeButton.addEventListener("click", closeSearch);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeSearch();
    }
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void search();
  });
  input.addEventListener("input", () => {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => void search(), 220);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.hidden) {
      closeSearch();
    }

    if (
      event.key === "/" &&
      overlay.hidden &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !isTypingEvent(event)
    ) {
      event.preventDefault();
      openSearch();
    }
  });
};
