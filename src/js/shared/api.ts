/**
 * Halo 列表接口的通用分页拉取。
 *
 * 主题里有多处「翻完所有页」的写法，各自复制了一遍分页循环，
 * 错误信息还写死成「Unable to load posts」，拉标签时也这么报错。
 * 这里收敛成一份实现，错误信息按接口路径动态生成。
 */

type ListResponse<T> = {
  items?: T[];
  total?: number;
  totalPages?: number;
};

export type PagedResult<T> = {
  /** 全部页合并后的条目。 */
  items: T[];
  /** 接口返回的总数，接口没给时退化为已拉取条数。 */
  total: number;
  totalPages: number;
};

export type FetchAllPagesOptions = {
  /** 分页参数之外的查询参数，例如评论接口的 group/kind/name。 */
  params?: Record<string, string>;
  /** 每页条数，默认 100。 */
  size?: number;
  /** 缓存策略，默认 no-store。 */
  cache?: RequestCache;
  /** 取消信号。 */
  signal?: AbortSignal;
};

/** 从接口路径里取一个可读的资源名，用于拼接错误信息。 */
const resourceName = (endpoint: string) => {
  const path = endpoint.split("?")[0] || "";
  const name = path.split("/").filter(Boolean).pop();
  return name || endpoint;
};

/** 发一次请求并解析 JSON，失败时抛出带资源名的错误。 */
const fetchJson = async <T>(url: string, init: RequestInit): Promise<T> => {
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(`Unable to load ${resourceName(url)}: ${response.status}`);
  }

  return (await response.json()) as T;
};

/**
 * 在途读请求表：同一个「缓存策略 + URL」在同时刻只发一次。
 *
 * 同一页里常有多个模块要同一份数据 —— 例如首页的贡献图与侧边栏标签云
 * 都要标签列表，两边各自发一次会拿到两份完全相同的响应。
 * 这里按 URL 合并在途请求，后到的调用方直接复用先到者的 Promise。
 *
 * 只合并「读」请求：带 AbortSignal 的请求不参与合并，
 * 否则一个调用方取消会连带把另一个调用方的请求也取消掉。
 */
const inflightReads = new Map<string, Promise<unknown>>();

/** 拉取一页列表；相同 URL 的并发读请求会被合并成一次。 */
const fetchPage = <T>(
  url: string,
  cache: RequestCache,
  signal?: AbortSignal,
): Promise<ListResponse<T>> => {
  if (signal) {
    return fetchJson<ListResponse<T>>(url, { cache, signal });
  }

  const key = `${cache}|${url}`;
  const existing = inflightReads.get(key);

  if (existing) {
    return existing as Promise<ListResponse<T>>;
  }

  const request = fetchJson<ListResponse<T>>(url, { cache });
  inflightReads.set(key, request);

  void request
    .finally(() => {
      // 只清理自己登记的那条，避免误删后来者
      if (inflightReads.get(key) === request) {
        inflightReads.delete(key);
      }
    })
    .catch(() => {
      // 这里是清理用的派生 Promise，错误已经由原始 Promise 抛给调用方，吞掉即可
    });

  return request;
};

/**
 * 拉取列表接口的全部分页并合并结果。
 *
 * @throws 接口返回非 2xx 时抛出，错误信息形如 `Unable to load tags: 404`。
 */
export const fetchAllPages = async <T>(
  endpoint: string,
  options: FetchAllPagesOptions = {},
): Promise<PagedResult<T>> => {
  const size = options.size ?? 100;
  const cache = options.cache ?? "no-store";
  const items: T[] = [];
  let page = 1;
  let totalPages = 1;
  let total = 0;

  do {
    const query = new URLSearchParams({
      ...options.params,
      page: String(page),
      size: String(size),
    });
    const result = await fetchPage<T>(`${endpoint}?${query}`, cache, options.signal);

    items.push(...(result.items || []));
    total = result.total ?? total;
    totalPages = Math.max(1, result.totalPages || 1);
    page += 1;
  } while (page <= totalPages);

  return { items, total: total || items.length, totalPages };
};
