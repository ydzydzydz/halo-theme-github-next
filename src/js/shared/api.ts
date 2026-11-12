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
    const response = await fetch(`${endpoint}?${query}`, {
      cache: options.cache ?? "no-store",
      signal: options.signal,
    });

    if (!response.ok) {
      throw new Error(`Unable to load ${resourceName(endpoint)}: ${response.status}`);
    }

    const result = (await response.json()) as ListResponse<T>;
    items.push(...(result.items || []));
    total = result.total ?? total;
    totalPages = Math.max(1, result.totalPages || 1);
    page += 1;
  } while (page <= totalPages);

  return { items, total: total || items.length, totalPages };
};
