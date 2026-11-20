/**
 * sessionStorage 上的短期缓存。
 *
 * 用于「每页都要、但很少变化」的数据（侧边栏标签 / 分类）：
 * 站内跳页时不必重复请求，后台改了内容最多等一个 TTL。
 *
 * 用 sessionStorage 而不是 localStorage：关掉标签页就自然失效，
 * 不会把过期数据留在访客的浏览器里。
 */

type CacheEntry<T> = {
  savedAt: number;
  value: T;
};

const readEntry = <T>(key: string): CacheEntry<T> | undefined => {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) {
      return undefined;
    }

    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (!entry || typeof entry.savedAt !== "number") {
      return undefined;
    }

    return entry;
  } catch {
    return undefined;
  }
};

/** 读取仍在有效期内（不超过 maxAgeMs）的缓存。 */
export const readCache = <T>(key: string, maxAgeMs: number): T | undefined => {
  const entry = readEntry<T>(key);

  if (!entry) {
    return undefined;
  }

  return Date.now() - entry.savedAt > maxAgeMs ? undefined : entry.value;
};

/** 读取已过期的缓存，用于请求失败时的兜底展示。 */
export const readStaleCache = <T>(key: string): T | undefined => readEntry<T>(key)?.value;

/** 写入缓存；存储不可用时静默忽略。 */
export const writeCache = <T>(key: string, value: T) => {
  try {
    sessionStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), value }));
  } catch {
    // 存储不可用时只是每次都重新请求。
  }
};
