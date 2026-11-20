/**
 * 首页 README 卡片：把后台配置的 Markdown 渲染成 HTML。
 *
 * Halo 主题模板没有服务端 Markdown 渲染能力，因此在前端完成渲染，
 * 渲染结果再交给 DOMPurify 清洗，避免内容里的危险标签与事件注入页面。
 *
 * marked 与 DOMPurify 体积不小（合计约 50 KB），而这张卡片只有站点
 * 开启了「README」时才会出现，所以用动态引入：
 * 没有卡片时这两个依赖根本不会下载。
 */

// 提前发起加载，让它与首页其余脚本并行下载，而不是等卡片出现后才开始。
const markdownRuntime = Promise.all([import("marked"), import("dompurify")]);

export const setupReadme = async () => {
  const card = document.querySelector<HTMLElement>("[data-readme-card]");

  if (!card) {
    return;
  }

  const body = card.querySelector<HTMLElement>("[data-readme-body]");
  const content = (card.dataset.readmeContent || "").trim();

  // 内容为空时整块移除，避免首页留下一个只有标题的空卡片
  if (!body || !content) {
    card.remove();
    return;
  }

  const [{ marked }, { default: DOMPurify }] = await markdownRuntime;
  const html = marked.parse(content, { async: false, gfm: true, breaks: false });

  body.innerHTML = DOMPurify.sanitize(html);

  // 外链统一在新标签页打开，并补上 noopener 防止反向劫持
  body.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((link) => {
    const href = link.getAttribute("href") || "";

    if (!href || href.startsWith("#") || href.startsWith("/")) {
      return;
    }

    link.target = "_blank";
    link.rel = "noopener noreferrer";
  });
};
