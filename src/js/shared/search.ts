/**
 * 站内搜索接口。
 *
 * 顶栏搜索弹窗与归档页内联搜索共用这一份请求逻辑：
 * 打到 Halo 的搜索索引接口，只返回已发布、未回收且已公开的内容。
 */

/** Halo 搜索索引接口。 */
export const searchEndpoint = "/apis/api.halo.run/v1alpha1/indices/-/search";

export type SearchHit = {
  title?: string;
  description?: string;
  content?: string;
  permalink?: string;
  metadataName?: string;
  type?: string;
  /** 标签的 metadata.name 列表。 */
  tags?: string[];
  /** 分类的 metadata.name 列表。 */
  categories?: string[];
  creationTimestamp?: string;
};

export type SearchResult = {
  hits?: SearchHit[];
  total?: number;
};

export type SearchOptions = {
  /** 最多返回多少条。 */
  limit?: number;
  /** 外部取消信号。 */
  signal?: AbortSignal;
};

/**
 * 按关键词搜索站内内容。
 *
 * @throws 请求失败或响应不是 JSON 时抛出，由调用方决定如何提示。
 */
export const querySiteSearch = async (
  keyword: string,
  options: SearchOptions = {},
): Promise<SearchResult> => {
  const response = await fetch(searchEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      keyword,
      limit: options.limit ?? 20,
      // 命中词标记直接要求返回 <mark>，前端再套上主题的高亮样式，
      // 免得接口默认的 <B> 被当成普通标签丢掉
      highlightPreTag: "<mark>",
      highlightPostTag: "</mark>",
      filterExposed: true,
      filterPublished: true,
      filterRecycled: false,
      includeTypes: ["post.content.halo.run", "singlepage.content.halo.run"],
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(`Search failed: ${response.status}`);
  }

  return (await response.json()) as SearchResult;
};

// ---------------------------------------------------------------------------
// 命中词高亮
// ---------------------------------------------------------------------------

/** 命中词高亮元素，样式在 _repository-list.scss / _header.scss 里。 */
const hitClass = "repository-search-hit";

/**
 * 把文本按关键词切成「普通片段 / 命中片段」。
 *
 * 关键词为空或文本里没有出现时返回 null，表示整段当作普通文本处理。
 */
const splitByKeyword = (text: string, keyword: string) => {
  const needle = keyword.trim().toLowerCase();

  if (!needle || !text) {
    return null;
  }

  const haystack = text.toLowerCase();
  const parts: { text: string; hit: boolean }[] = [];
  let cursor = 0;
  let found = haystack.indexOf(needle);

  if (found < 0) {
    return null;
  }

  while (found >= 0) {
    if (found > cursor) {
      parts.push({ text: text.slice(cursor, found), hit: false });
    }

    parts.push({ text: text.slice(found, found + needle.length), hit: true });
    cursor = found + needle.length;
    found = haystack.indexOf(needle, cursor);
  }

  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor), hit: false });
  }

  return parts;
};

/** 追加一段文本，命中关键词的部分套上高亮。 */
const appendText = (target: Node, text: string, keyword: string, doc: Document) => {
  const parts = splitByKeyword(text, keyword);

  if (!parts) {
    target.appendChild(doc.createTextNode(text));
    return;
  }

  parts.forEach((part) => {
    if (!part.hit) {
      target.appendChild(doc.createTextNode(part.text));
      return;
    }

    const mark = doc.createElement("mark");
    mark.className = hitClass;
    mark.textContent = part.text;
    target.appendChild(mark);
  });
};

/**
 * 逐节点搬运解析结果。
 *
 * 接口把命中词包在 <mark> 里（例如 "Golang <mark>中的</mark> Option 模式"）：
 *   - <mark> 变成高亮元素；
 *   - <b> / <strong> 是正文自己的加粗，保留加粗语义，不当作命中标记；
 *   - 其余标签只取文字，避免把接口返回的 HTML 直接塞进页面；
 *   - 接口没标出、但正文里确实出现的关键词，再补一层高亮。
 */
const appendNode = (
  target: Node,
  node: Node,
  keyword: string,
  doc: Document,
  insideHit = false,
) => {
  if (node.nodeType === Node.TEXT_NODE) {
    // 已经在接口标记的片段里就不再做关键词匹配，否则会套出两层高亮
    if (insideHit) {
      target.appendChild(doc.createTextNode(node.textContent ?? ""));
      return;
    }

    appendText(target, node.textContent ?? "", keyword, doc);
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  const element = node as Element;
  const tag = element.tagName.toLowerCase();

  // 正文里的加粗：接口标记命中词时会把原文的 <strong> 一起包进 <mark>，
  // 这里若再把 <strong> 当成命中标记，就会套出内外两层高亮。
  if (tag === "b" || tag === "strong") {
    const strong = doc.createElement("strong");
    Array.from(element.childNodes).forEach((child) => {
      appendNode(strong, child, keyword, doc, insideHit);
    });
    target.appendChild(strong);
    return;
  }

  if (tag === "mark") {
    const mark = doc.createElement("mark");
    mark.className = hitClass;

    // 先把子节点复制成数组再搬：childNodes 是活集合，边搬边遍历会漏掉节点
    Array.from(element.childNodes).forEach((child) => {
      appendNode(mark, child, keyword, doc, true);
    });

    target.appendChild(mark);
    return;
  }

  if (tag === "br") {
    target.appendChild(doc.createElement("br"));
    return;
  }

  Array.from(element.childNodes).forEach((child) => {
    appendNode(target, child, keyword, doc, insideHit);
  });
};

/** 片段超过上限时截断，末尾补省略号。 */
const truncateFragment = (fragment: DocumentFragment, maxLength: number) => {
  let length = 0;
  let truncated = false;

  const walk = (node: Node) => {
    if (truncated) {
      return;
    }

    Array.from(node.childNodes).forEach((child) => {
      if (truncated) {
        return;
      }

      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent ?? "";

        if (length + text.length <= maxLength) {
          length += text.length;
          return;
        }

        child.textContent = `${text.slice(0, Math.max(0, maxLength - length))}...`;
        length = maxLength;
        truncated = true;
        return;
      }

      walk(child);
    });
  };

  walk(fragment);
};

/**
 * 把搜索接口返回的标题 / 摘要渲染到元素里，命中词带高亮。
 *
 * 接口返回的是带 <B> 标记的 HTML 片段，这里用 DOMParser 解析后逐节点搬运：
 * 既不会把 <B> 当成文字露出来，也不会把接口内容直接当 HTML 插入。
 *
 * @param maxLength 纯文本长度上限，0 表示不截断。
 */
export const renderSearchText = (
  target: HTMLElement,
  html: string,
  keyword: string,
  maxLength = 0,
) => {
  const doc = new DOMParser().parseFromString(html || "", "text/html");
  const fragment = doc.createDocumentFragment();

  Array.from(doc.body?.childNodes ?? []).forEach((child) => {
    appendNode(fragment, child, keyword, doc);
  });

  if (maxLength > 0) {
    truncateFragment(fragment, maxLength);
  }

  target.replaceChildren(fragment);
};
