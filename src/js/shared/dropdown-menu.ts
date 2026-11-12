/**
 * 下拉菜单：桌面端鼠标悬浮打开，触屏端点击打开。
 *
 * 触屏的一次点按同样会触发 pointerenter / pointerleave，而且 pointerleave 紧跟在
 * pointerup 之后触发（手指离开屏幕，指针随之消失）。如果照搬悬浮逻辑，
 * 菜单会在手指刚抬起时就被自动关掉，用户根本点不到「控制台」「退出」这类菜单项，
 * 表现为「刚弹出来就没了」。所以这里按指针类型区分两种交互：
 * 只有真正的鼠标指针才走悬浮开关，触屏一律交给 click 处理。
 *
 * 判定「这次点击是不是手指点的」不能只看 click 事件自己的 pointerType：
 * 触摸合成的 click 在部分浏览器（iOS Safari、各种 WebView）里 pointerType 是 "mouse"，
 * 会被误当成鼠标操作，导致再点一次头像收不回菜单。
 * 因此这里以「本次点击前那一次 pointerdown / touchstart 的指针类型」为准。
 */

/** 触摸发生后的一小段时间内，忽略浏览器补发的兼容鼠标悬浮事件。 */
const TOUCH_GRACE_MS = 700;

export type DropdownMenuOptions = {
  /** 触发按钮与菜单的共同容器。 */
  container: HTMLElement;
  /** 触发按钮。 */
  trigger: HTMLElement;
  /** 菜单本体。 */
  menu: HTMLElement;
  /** 鼠标移出容器后的关闭延时，给鼠标移动到菜单上留出时间。 */
  closeDelay?: number;
};

/** 触屏与触控笔：这类指针没有真正的悬浮，交互只能靠点击。 */
const isTouchPointer = (pointerType: string) => pointerType === "touch" || pointerType === "pen";

export const setupDropdownMenu = ({
  container,
  trigger,
  menu,
  closeDelay = 120,
}: DropdownMenuOptions) => {
  let closeTimer = 0;
  /**
   * 本次点击对应的指针类型。
   *
   * 只认「这次点击前的那一次 pointerdown」：键盘触发按钮时压根没有 pointerdown，
   * 如果一直记着上一次触摸的 pointerType，键盘用户就会被误判成手指操作。
   */
  let pendingPointerType: string | null = null;
  /** 最近一次触摸的时间，用来挡掉触摸之后浏览器补发的兼容鼠标悬浮事件。 */
  let lastTouchTime = 0;

  const closeMenu = (restoreFocus = false) => {
    window.clearTimeout(closeTimer);
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");

    // 焦点还留在菜单里（键盘 Tab 进来后按 Esc、或点中菜单项）时把焦点还给触发按钮，
    // 否则焦点会掉回 body，键盘用户下次就找不到这个菜单的入口了。
    if (restoreFocus || menu.contains(document.activeElement)) {
      trigger.focus({ preventScroll: true });
    }
  };

  const openMenu = (focusFirstItem = false) => {
    window.clearTimeout(closeTimer);
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");

    if (focusFirstItem) {
      menu.querySelector<HTMLElement>("a, button")?.focus({ preventScroll: true });
    }
  };

  /** 触摸刚发生过时，浏览器补发的兼容鼠标悬浮事件一律忽略。 */
  const inTouchGrace = () => Date.now() - lastTouchTime < TOUCH_GRACE_MS;

  container.addEventListener("pointerdown", (event) => {
    pendingPointerType = event.pointerType;

    if (isTouchPointer(event.pointerType)) {
      lastTouchTime = Date.now();
    }
  });

  // 老浏览器没有 PointerEvent，用 touchstart 兜底标记「这次交互来自手指」
  container.addEventListener(
    "touchstart",
    () => {
      pendingPointerType = "touch";
      lastTouchTime = Date.now();
    },
    { passive: true },
  );

  // 容器上的任何点击（含菜单项）都会把这次按下的指针类型消费掉，避免残留到下一次键盘操作
  container.addEventListener("click", () => {
    pendingPointerType = null;
  });

  container.addEventListener("pointerenter", (event) => {
    // 触屏没有悬浮，点按交给 click 处理
    if (event.pointerType !== "mouse") {
      return;
    }

    // 触摸之后浏览器可能补发 pointerType 为 "mouse" 的悬浮事件，此时不能被悬浮逻辑带开
    if (inTouchGrace()) {
      return;
    }

    openMenu();
  });

  container.addEventListener("pointerleave", (event) => {
    // 手指抬起就会触发 pointerleave，据此关闭会让菜单刚出现就消失
    if (event.pointerType !== "mouse") {
      return;
    }

    if (inTouchGrace()) {
      return;
    }

    closeTimer = window.setTimeout(() => closeMenu(), closeDelay);
  });

  trigger.addEventListener("click", (event) => {
    // 以本次按下（pointerdown / touchstart）的指针类型为准：
    // 触摸合成的 click 在部分浏览器里 pointerType 会是 "mouse"，不能作为判据
    const pointerType =
      pendingPointerType ?? (event instanceof PointerEvent ? event.pointerType : "");
    const touched = isTouchPointer(pointerType);
    // detail 为 0 表示由键盘（Enter / Space）触发
    const keyboard = !touched && event instanceof MouseEvent && event.detail === 0;

    if (keyboard) {
      openMenu(true);
      return;
    }

    if (menu.hidden) {
      // 触屏点开时不抢焦点，避免页面被滚动到菜单的位置
      openMenu(!touched);
      return;
    }

    // 触屏：再次点击头像收起菜单；鼠标：菜单是悬浮打开的，点击保持打开
    if (touched) {
      closeMenu();
    }
  });

  menu.addEventListener("click", (event) => {
    // 点了菜单项（「控制台」「退出」）就收起菜单，避免跳转后菜单还挂在页面上
    if (event.target instanceof Element && event.target.closest("a")) {
      closeMenu();
    }
  });

  document.addEventListener("click", (event) => {
    if (!menu.hidden && event.target instanceof Node && !container.contains(event.target)) {
      closeMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) {
      closeMenu(true);
    }
  });
};
