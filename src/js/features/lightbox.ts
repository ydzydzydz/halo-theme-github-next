/**
 * 图片灯箱：图库页、正文插图、瞬间配图共用同一套实现。
 *
 * 灯箱支持键盘翻页（← / →）、Esc 关闭与触摸滑动，
 * 并在关闭时把焦点还给刚才点击的那张图片。
 */
import { focusElement } from "../shared/dom";
import { messages } from "../shared/i18n";

type LightboxEntry = {
  alt: string;
  element?: HTMLElement;
  href: string;
  src: string;
  title: string;
};

/** 当前打开的灯箱，保证同一时刻只有一个能响应键盘。 */
let activeLightbox: { close: () => void } | undefined;

const createImageLightbox = (entries: LightboxEntry[]) => {
  if (!entries.length) {
    return undefined;
  }

  let index = 0;
  let touchStartX = 0;

  const createIcon = (name: string) => {
    const element = document.createElement("iconify-icon");
    element.setAttribute("icon", name);
    return element;
  };

  const image = document.createElement("img");
  image.className = "photo-lightbox-image";
  image.alt = "";

  const title = document.createElement("span");
  const counter = document.createElement("span");
  counter.className = "photo-lightbox-counter";
  const original = document.createElement("a");
  original.className = "photo-lightbox-original";
  original.textContent = messages.preview.original;
  original.target = "_blank";
  original.rel = "noreferrer";

  const caption = document.createElement("figcaption");
  caption.className = "photo-lightbox-caption";
  caption.append(title, counter, original);

  const figure = document.createElement("figure");
  figure.className = "photo-lightbox-figure";
  figure.append(image, caption);

  const closeButton = document.createElement("button");
  closeButton.className = "photo-lightbox-close";
  closeButton.type = "button";
  closeButton.title = messages.preview.close;
  closeButton.setAttribute("aria-label", messages.preview.close);
  closeButton.append(createIcon("material-symbols:close"));

  const prevButton = document.createElement("button");
  prevButton.className = "photo-lightbox-nav photo-lightbox-nav--prev";
  prevButton.type = "button";
  prevButton.title = messages.preview.previous;
  prevButton.setAttribute("aria-label", messages.preview.previous);
  prevButton.append(createIcon("material-symbols:chevron-left"));

  const nextButton = document.createElement("button");
  nextButton.className = "photo-lightbox-nav photo-lightbox-nav--next";
  nextButton.type = "button";
  nextButton.title = messages.preview.next;
  nextButton.setAttribute("aria-label", messages.preview.next);
  nextButton.append(createIcon("material-symbols:chevron-right"));

  const overlay = document.createElement("div");
  overlay.className = "photo-lightbox";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", messages.preview.label);
  overlay.hidden = true;
  overlay.append(figure, closeButton, prevButton, nextButton);
  document.body.append(overlay);

  const preload = (offset: number) => {
    const item = entries[(index + offset + entries.length) % entries.length];

    if (item) {
      const loader = new Image();
      loader.src = item.src;
    }
  };

  const render = () => {
    const item = entries[index];

    image.src = item.src;
    image.alt = item.alt;
    title.textContent = item.title;
    counter.textContent = `${index + 1} / ${entries.length}`;
    original.href = item.href;
    original.hidden = !item.href;
    prevButton.hidden = entries.length < 2;
    nextButton.hidden = entries.length < 2;
    preload(1);
    preload(-1);
  };

  const open = (start: number) => {
    // 同时只保留一个灯箱，避免两个实例同时响应键盘
    activeLightbox?.close();
    activeLightbox = { close };

    index = (start + entries.length) % entries.length;
    render();
    overlay.hidden = false;
    document.documentElement.classList.add("photo-lightbox-open");
    focusElement(closeButton);
  };

  const close = () => {
    overlay.hidden = true;
    document.documentElement.classList.remove("photo-lightbox-open");

    if (activeLightbox?.close === close) {
      activeLightbox = undefined;
    }

    focusElement(entries[index]?.element);
  };

  const step = (delta: number) => {
    index = (index + delta + entries.length) % entries.length;
    render();
  };

  closeButton.addEventListener("click", close);
  prevButton.addEventListener("click", () => step(-1));
  nextButton.addEventListener("click", () => step(1));
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      close();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (overlay.hidden) {
      return;
    }

    if (event.key === "Escape") {
      close();
      return;
    }

    if (event.key === "ArrowLeft") {
      step(-1);
      return;
    }

    if (event.key === "ArrowRight") {
      step(1);
    }
  });

  overlay.addEventListener(
    "touchstart",
    (event) => {
      touchStartX = event.changedTouches[0]?.clientX ?? 0;
    },
    { passive: true },
  );

  overlay.addEventListener(
    "touchend",
    (event) => {
      const delta = (event.changedTouches[0]?.clientX ?? 0) - touchStartX;

      if (Math.abs(delta) > 48) {
        step(delta < 0 ? 1 : -1);
      }
    },
    { passive: true },
  );

  return { close, open };
};

/** 图库页：卡片缩略图。 */
export const setupPhotoLightbox = () => {
  const grid = document.querySelector<HTMLElement>("[data-photo-gallery]");

  if (!grid) {
    return;
  }

  const entries = Array.from(grid.querySelectorAll<HTMLAnchorElement>(".photo-card"))
    .map((card) => {
      const image = card.querySelector<HTMLImageElement>("img");
      const title = card.querySelector<HTMLElement>(".photo-card-title span");
      const src = image?.currentSrc || image?.src || "";

      return {
        element: card,
        src,
        alt: image?.alt ?? "",
        title: title?.textContent?.trim() ?? "",
        href: card.getAttribute("href") || src,
      };
    })
    .filter((item) => item.src);

  const lightbox = createImageLightbox(entries);

  if (!lightbox) {
    return;
  }

  entries.forEach((entry, entryIndex) => {
    entry.element?.addEventListener("click", (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      event.preventDefault();
      lightbox.open(entryIndex);
    });
  });
};

/** 正文插图：不在链接里的图片。 */
export const setupArticleImageLightbox = () => {
  const images = Array.from(
    document.querySelectorAll<HTMLImageElement>(".article-content img"),
  ).filter((image) => !image.closest("a"));

  const entries = images
    .map((image) => {
      const src = image.currentSrc || image.src || "";
      const caption = image.closest("figure")?.querySelector("figcaption");

      return {
        element: image,
        src,
        alt: image.alt ?? "",
        title: caption?.textContent?.trim() || image.alt || "",
        href: src,
      };
    })
    .filter((item) => item.src);

  const lightbox = createImageLightbox(entries);

  if (!lightbox) {
    return;
  }

  entries.forEach((entry, entryIndex) => {
    entry.element?.addEventListener("click", () => {
      lightbox.open(entryIndex);
    });
  });
};

/** 瞬间配图：与图库、正文共用同一套灯箱，交互保持一致。 */
export const setupMomentImageLightbox = () => {
  const images = Array.from(document.querySelectorAll<HTMLImageElement>("img[data-moment-image]"));

  if (!images.length) {
    return;
  }

  const entries = images
    .map((image) => ({
      element: image,
      src: image.currentSrc || image.src || "",
      alt: image.alt ?? "",
      title: image.alt ?? "",
      href: image.currentSrc || image.src || "",
    }))
    .filter((item) => item.src);

  const lightbox = createImageLightbox(entries);

  if (!lightbox) {
    return;
  }

  entries.forEach((entry, entryIndex) => {
    entry.element?.addEventListener("click", () => {
      lightbox.open(entryIndex);
    });
  });
};
