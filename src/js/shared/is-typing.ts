/**
 * 判断键盘事件是否发生在输入控件里。
 *
 * 快捷键（如 `/` 打开搜索）需要在用户正在打字时让位，
 * 免得输入框里敲一个斜杠就被弹窗打断。
 */
export const isTypingEvent = (event: KeyboardEvent) =>
  event
    .composedPath()
    .some(
      (target) =>
        target instanceof HTMLElement &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable),
    );
