/**
 * 评论组件（PluginCommentWidget）内部是 Shadow DOM，主题的普通样式穿不进去，
 * 只能靠 CSS 变量换色，换不了尺寸和字重。
 *
 * 这里把「提交评论」按钮对齐到主题的主按钮规格（申请友链按钮），
 * 颜色、圆角、高度、字重全部走 --button-primary-* 令牌，两处不会各自跑偏。
 *
 * 插件升级后若内部类名有变，覆盖会自然失效，只是不再贴合主按钮，不影响评论功能。
 */

const widgetSelector = "comment-widget";

const styleMark = "data-theme-github-next";

/* 用双类选择器把优先级抬到工具类之上，免用 !important 也能盖住组件的 h-12 / text-sm 等 */
const submitButtonStyle = `
.form-submit.form-submit {
  height: var(--button-primary-height, 32px);
  padding: 0 12px;
  border: 1px solid var(--button-primary-border, rgb(27 31 36 / 0.15));
  border-radius: var(--button-primary-radius, 6px);
  background: var(--button-primary-bg, #1f883d);
  color: #ffffff;
  font-size: var(--button-primary-font-size, 13px);
  font-weight: var(--button-primary-weight, 600);
}
.form-submit.form-submit:hover {
  background: var(--button-primary-hover-bg, #1a7f37);
  opacity: 1;
}
`;

/* 组件是异步挂载的：先记下来，等 Shadow 根就绪再注入 */
const pending = new Set<Element>();

const inject = (root: ShadowRoot) => {
  if (root.querySelector(`style[${styleMark}]`)) {
    return;
  }

  const style = document.createElement("style");
  style.setAttribute(styleMark, "");
  style.textContent = submitButtonStyle;
  root.append(style);
};

const flush = () => {
  pending.forEach((widget) => {
    const root = (widget as HTMLElement).shadowRoot;

    if (!root) {
      return;
    }

    inject(root);
    pending.delete(widget);
  });

  if (pending.size) {
    window.requestAnimationFrame(flush);
  }
};

const track = (node: Element) => {
  if (node.matches(widgetSelector)) {
    pending.add(node);
  }

  node.querySelectorAll(widgetSelector).forEach((widget) => {
    pending.add(widget);
  });

  if (pending.size) {
    flush();
  }
};

export const setupCommentWidgetStyle = () => {
  if (!document.body) {
    return;
  }

  document.querySelectorAll(widgetSelector).forEach((widget) => {
    pending.add(widget);
  });

  /* 插件脚本与主题脚本的加载顺序不固定，且 Halo 站内跳转会整块替换 DOM，都要覆盖到 */
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof Element) {
          track(node);
        }
      });
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });

  flush();
};
