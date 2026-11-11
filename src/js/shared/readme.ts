import DOMPurify from "dompurify";
import { marked } from "marked";

// 首页 README 卡片：把后台配置的 Markdown 渲染成 HTML。
// Halo 主题模板没有服务端 Markdown 渲染能力，因此在前端完成渲染，
// 渲染结果再交给 DOMPurify 清洗，避免内容里的危险标签与事件注入页面。
const renderMarkdown = (content: string) => {
  const html = marked.parse(content, { async: false, gfm: true, breaks: false });
  return DOMPurify.sanitize(html);
};

export const setupReadme = () => {
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

  body.innerHTML = renderMarkdown(content);

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
