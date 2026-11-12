/**
 * 外部数据的 URL 安全处理。
 *
 * 豆瓣插件、Halo 搜索索引、留言板等第三方数据里的链接可能带 `javascript:` 协议，
 * 直接赋给 `href` 就能执行脚本，所以外部数据赋给 `href` / `src` 前统一走这里。
 */

/**
 * 含空白或控制字符的地址一律拒绝：浏览器会忽略换行与制表符，`java\nscript:` 仍会执行。
 */
// eslint-disable-next-line no-control-regex -- 匹配控制字符正是此处的目的
const unsafeCharacters = /[\s\u0000-\u001f]/;

/** 站内相对路径：以单个斜杠开头，且不是协议相对地址（`//host`）。 */
const isSiteRelative = (value: string) => value.startsWith("/") && !value.startsWith("//");

/**
 * 只允许 `http:` / `https:` 与站内相对路径，其余回退到 `#`。
 *
 * @param value 待校验的地址，通常来自第三方接口。
 */
export const safeHref = (value: string | undefined | null) => {
  const raw = (value || "").trim();

  if (!raw || unsafeCharacters.test(raw)) {
    return "#";
  }

  if (isSiteRelative(raw)) {
    return raw;
  }

  // 没有协议分隔符的字符串按站内相对路径处理（`archives/2024` 之类）。
  if (!raw.includes(":")) {
    return raw;
  }

  try {
    const url = new URL(raw);

    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
  } catch {
    // 解析失败按非法地址处理
  }

  return "#";
};

/**
 * 图片地址：与链接同样的协议校验，非法时返回空串，调用方据此跳过设置 `src`。
 */
export const safeSrc = (value: string | undefined | null) => {
  const href = safeHref(value);
  return href === "#" ? "" : href;
};
