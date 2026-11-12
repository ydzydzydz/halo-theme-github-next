/**
 * 评论组件（PluginCommentWidget）内部是多层 Shadow DOM：
 * comment-widget → comment-form / base-form → comment-editor。
 * 主题的普通样式穿不进去，只能靠 CSS 变量换色，
 * 换不了尺寸、字重和聚焦光晕。
 *
 * 这里做两件事：
 *
 * 1. 往每一层 Shadow Root 里注入样式：
 *    - 「提交评论」按钮对齐主题的主按钮规格（申请友链按钮）
 *    - 昵称 / 邮箱 / 网站 / 验证码等输入框，以及评论编辑框，
 *      统一成全站同一套 GitHub 风格边框：
 *      1px 细边框 + 6px 圆角，聚焦时蓝边框 + 3px 蓝色光晕。
 * 2. 颜色、圆角、字形继续走 CSS 变量，插件升级后不会失效。
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

/*
 * 输入框统一外观：与主题里其它输入框（归档页搜索框、申请友链表单）同一套，
 * 做法照抄 GitHub / Primer 的 .form-control：
 * 默认 1px 细边框 + 6px 圆角，聚焦时边框变蓝并加一圈 1px 内描边
 * （视觉上是 2px 蓝边框，不会向外溢出光晕）。
 */
const inputStyle = `
.input.input {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--canvas);
  color: var(--fg);
  box-shadow: var(--shadow-inset, inset 0 1px 0 rgb(31 35 40 / 0.04));
  transition:
    border-color 80ms cubic-bezier(0.33, 1, 0.68, 1),
    box-shadow 80ms cubic-bezier(0.33, 1, 0.68, 1);
}
.input.input:focus {
  border-color: var(--accent);
  outline: none;
  box-shadow: inset 0 0 0 1px var(--accent);
}

/* 评论编辑框：编辑器挂在外框的 #editor-container 里，用 :has() 精确定位外框 */
:has(> #editor-container) {
  border-color: var(--border);
  border-radius: 6px;
  background: var(--canvas);
}
:has(> #editor-container):focus-within {
  border-color: var(--accent);
  outline: none;
  box-shadow: inset 0 0 0 1px var(--accent);
}

/* 组件按钮的聚焦提示改用主题统一的 outline 焦点环，不再用外圈光晕 */
button:focus-visible {
  outline: var(--focus-ring-width, 2px) solid var(--accent);
  outline-offset: var(--focus-ring-offset, 2px);
}
`;

const widgetStyle = `${submitButtonStyle}${inputStyle}`;

/* 已注入过的 Shadow Root，避免重复插入 <style> */
const injected = new WeakSet<ShadowRoot>();

/* 每个 Shadow Root 上的观察者：组件后加载的回复框等子组件也会带自己的 Shadow Root */
const observers = new WeakMap<ShadowRoot, MutationObserver>();

/* 还没处理完的评论组件 */
const pending = new Set<Element>();

/* 连续多少帧没有发现新的 Shadow Root，超过就不再重试 */
const misses = new WeakMap<Element, number>();

const inject = (root: ShadowRoot): boolean => {
  if (injected.has(root)) {
    return false;
  }

  injected.add(root);

  const style = document.createElement("style");
  style.setAttribute(styleMark, "");
  style.textContent = widgetStyle;
  root.append(style);

  observe(root);

  return true;
};

/** 收集 Shadow Root 下所有子 Shadow Root（Lit 子组件各自带一层） */
const collectRoots = (root: ShadowRoot): ShadowRoot[] => {
  const roots: ShadowRoot[] = [];

  root.querySelectorAll("*").forEach((element) => {
    const shadow = (element as HTMLElement).shadowRoot;

    if (!shadow) {
      return;
    }

    roots.push(shadow);
    roots.push(...collectRoots(shadow));
  });

  return roots;
};

function observe(root: ShadowRoot): void {
  if (observers.has(root)) {
    return;
  }

  const observer = new MutationObserver(() => {
    collectRoots(root).forEach((child) => {
      inject(child);
    });
  });

  observer.observe(root, { childList: true, subtree: true });
  observers.set(root, observer);
}

/** 扫描一个评论组件：自身 + 内部各层 Shadow Root 全部注入样式 */
const scan = (widget: Element): boolean => {
  const root = (widget as HTMLElement).shadowRoot;

  if (!root) {
    return false;
  }

  let added = inject(root);

  collectRoots(root).forEach((child) => {
    if (inject(child)) {
      added = true;
    }
  });

  return added;
};

const flush = () => {
  let working = false;

  pending.forEach((widget) => {
    const added = scan(widget);

    if (added) {
      misses.set(widget, 0);
      working = true;
      return;
    }

    const count = misses.get(widget) ?? 0;

    /* 子组件是 Lit 组件，自带的 Shadow Root 可能晚一两帧才挂上，
       连续多帧没找到新层再放弃，避免漏掉输入框的样式 */
    if (count < 30) {
      misses.set(widget, count + 1);
      working = true;
      return;
    }

    misses.delete(widget);
    pending.delete(widget);
  });

  if (working) {
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
