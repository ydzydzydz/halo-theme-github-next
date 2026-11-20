/**
 * 侧边栏的站点标签云与站点分类。
 *
 * 两块数据「每页都要、但很少变化」，因此：
 * - 结果放进 sessionStorage，站内跳页时不必重复请求；
 * - 请求失败时回落到过期缓存，而不是把整块内容藏掉；
 * - 同一份数据若同页有多处要用，由 shared/api.ts 合并成一次请求。
 */
import { fetchAllPages } from "../shared/api";
import { readCache, readStaleCache, writeCache } from "../shared/cache";
import { createPolling } from "../shared/dom";

const mobileViewportQuery = "(max-width: 768px)";
const tagsEndpoint = "/apis/api.content.halo.run/v1alpha1/tags";
const categoriesEndpoint = "/apis/api.content.halo.run/v1alpha1/categories";
const tagsCacheKey = "theme-github-next-sidebar-tags";
const categoriesCacheKey = "theme-github-next-sidebar-categories";
// 侧栏数据变化很慢，五分钟过期足够，兼顾新鲜度与请求数。
const sidebarCacheTtl = 5 * 60 * 1000;

type TagItem = {
  name: string;
  permalink: string;
  postCount: number;
};

type CategoryItem = {
  name: string;
  permalink: string;
  postCount: number;
};

type TagListItem = {
  postCount?: number;
  spec?: { displayName?: string };
  status?: { permalink?: string; postCount?: number };
};

type CategoryListItem = {
  postCount?: number;
  spec?: { displayName?: string; hideFromList?: boolean };
  status?: { permalink?: string; postCount?: number };
};

// 窄屏隐藏整个侧边栏时，不请求侧边栏标签/分类数据，也不启动标签云动画；
// 视口变宽后自动补加载，保证旋转屏幕或调整窗口后内容依然完整。
const loadSidebarSectionWhenVisible = (load: () => void) => {
  const shell = document.querySelector<HTMLElement>("[data-hide-sidebar-mobile]");
  if (shell?.dataset.hideSidebarMobile !== "true") {
    load();
    return;
  }

  const query = window.matchMedia(mobileViewportQuery);
  if (!query.matches) {
    load();
    return;
  }

  const handleChange = (event: MediaQueryListEvent) => {
    if (!event.matches) {
      query.removeEventListener("change", handleChange);
      load();
    }
  };

  query.addEventListener("change", handleChange);
};

export const setupSidebarTags = () => {
  const root = document.querySelector<HTMLElement>("[data-sidebar-tags]");
  const cloud = root?.querySelector<HTMLElement>("[data-sidebar-tag-cloud]");
  const empty = root?.querySelector<HTMLElement>("[data-sidebar-tags-empty]");

  if (!root || !cloud || !empty) {
    return;
  }

  const tagLimit = Math.min(
    80,
    Math.max(1, Number.parseInt(root.dataset.tagLimit || "40", 10) || 40),
  );
  const configuredAnimation = root.dataset.tagAnimation;
  const animation = ["globe", "float", "marquee", "wave", "shuffle"].includes(
    configuredAnimation || "",
  )
    ? configuredAnimation!
    : "globe";
  root.dataset.tagAnimation = animation;
  cloud.classList.add(`sidebar-tag-cloud--${animation}`);

  const loadTags = async () => {
    const cached = readCache<TagItem[]>(tagsCacheKey, sidebarCacheTtl);

    if (cached) {
      renderTags(cached);
      return;
    }

    let tags: TagItem[];

    try {
      const result = await fetchAllPages<TagListItem>(tagsEndpoint);
      tags = result.items
        .map((tag) => ({
          name: tag.spec?.displayName?.trim() || "",
          permalink: tag.status?.permalink || "/tags",
          postCount: tag.status?.postCount ?? tag.postCount ?? 0,
        }))
        .filter((tag) => tag.name);
    } catch {
      // 请求失败时先用过期缓存兜底，实在没有才隐藏整块。
      const stale = readStaleCache<TagItem[]>(tagsCacheKey);

      if (!stale?.length) {
        root.hidden = true;
        return;
      }

      tags = stale;
    }

    writeCache(tagsCacheKey, tags);
    renderTags(tags);
  };

  const renderTags = (allTags: TagItem[]) => {
    if (!allTags.length) {
      return;
    }

    const popularTags = allTags
      .sort(
        (left, right) =>
          right.postCount - left.postCount || left.name.localeCompare(right.name, "zh-CN"),
      )
      .slice(0, tagLimit);
    const links = popularTags.map((tag, index) => {
      const link = document.createElement("a");
      link.href = tag.permalink;
      link.textContent = tag.name;
      link.style.setProperty("--tag-index", String(index));
      link.style.setProperty("--tag-delay", `${(index % 10) * -0.42}s`);
      cloud.append(link);
      return link;
    });

    if (animation !== "globe") {
      if (animation === "marquee") {
        links.forEach((link, index) => {
          const angle = (Math.PI * 2 * index) / links.length - Math.PI / 2;
          link.style.left = `${50 + Math.cos(angle) * 41}%`;
          link.style.top = `${50 + Math.sin(angle) * 41}%`;
        });
      }

      if (animation === "shuffle") {
        const shuffle = () => {
          cloud.classList.add("is-shuffling");
          window.setTimeout(() => {
            // Fisher–Yates 洗牌：sort(() => Math.random() - 0.5) 的分布不均匀，
            // 标签多时会出现明显的偏序。
            const shuffled = [...links];

            for (let index = shuffled.length - 1; index > 0; index -= 1) {
              const target = Math.floor(Math.random() * (index + 1));
              [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
            }

            shuffled.forEach((link) => cloud.append(link));
            cloud.classList.remove("is-shuffling");
          }, 180);
        };
        // 切到后台标签页时自动暂停，回到前台再继续。
        createPolling(shuffle, 6000, { immediate: false });
      }

      empty.hidden = true;
      return;
    }

    const tagPoints = popularTags.map((_, index) => {
      const phi = Math.acos(1 - (2 * (index + 0.5)) / popularTags.length);
      const theta = Math.PI * (1 + Math.sqrt(5)) * index;
      return {
        x: Math.sin(phi) * Math.cos(theta),
        y: Math.cos(phi),
        z: Math.sin(phi) * Math.sin(theta),
      };
    });

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let paused = motionQuery.matches;
    let rotation = 0;
    let frame = 0;

    const applyPositions = () => {
      const sin = Math.sin(rotation);
      const cos = Math.cos(rotation);

      tagPoints.forEach((tag, index) => {
        const x = tag.x * cos - tag.z * sin;
        const z = tag.x * sin + tag.z * cos;
        const y = tag.y * 0.9 + z * 0.18;
        const depth = (z + 1) / 2;
        const scale = 0.72 + depth * 0.48;
        const link = links[index];
        link.style.left = `${50 + x * 39}%`;
        link.style.top = `${50 - y * 38}%`;
        link.style.transform = `translate(-50%, -50%) scale(${scale})`;
        link.style.opacity = String(0.24 + depth * 0.76);
        link.style.zIndex = String(Math.round(depth * 100));
      });
    };

    const loop = () => {
      rotation += 0.003;
      applyPositions();
      frame = window.requestAnimationFrame(loop);
    };

    const startLoop = () => {
      if (frame || paused || document.hidden) {
        return;
      }

      frame = window.requestAnimationFrame(loop);
    };

    const stopLoop = () => {
      if (!frame) {
        return;
      }

      window.cancelAnimationFrame(frame);
      frame = 0;
    };

    // 先摆一次位置：暂停或「减少动效」状态下标签也有正确的落点，
    // 不至于全部叠在左上角。
    applyPositions();
    startLoop();

    root.addEventListener("pointerenter", () => {
      paused = true;
      stopLoop();
    });

    root.addEventListener("pointerleave", () => {
      paused = motionQuery.matches;
      startLoop();
    });

    // 后台标签页里没必要继续转，省下整条主线程
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        stopLoop();
        return;
      }

      startLoop();
    });

    empty.hidden = true;
  };

  loadSidebarSectionWhenVisible(() => void loadTags());
};

export const setupSidebarCategories = () => {
  const root = document.querySelector<HTMLElement>("[data-sidebar-categories]");
  const list = root?.querySelector<HTMLUListElement>("[data-sidebar-category-list]");
  const empty = root?.querySelector<HTMLElement>("[data-sidebar-categories-empty]");

  if (!root || !list || !empty) {
    return;
  }

  const categoryLimit = Math.min(
    50,
    Math.max(1, Number.parseInt(root.dataset.categoryLimit || "20", 10) || 20),
  );

  const renderCategories = (categories: CategoryItem[]) => {
    if (!categories.length) {
      return;
    }

    list.replaceChildren(
      ...categories
        .sort(
          (left, right) =>
            right.postCount - left.postCount || left.name.localeCompare(right.name, "zh-CN"),
        )
        .slice(0, categoryLimit)
        .map((category) => {
          const item = document.createElement("li");
          const link = document.createElement("a");
          const name = document.createElement("span");
          name.textContent = category.name;
          link.href = category.permalink;
          link.append(name);

          item.append(link);
          return item;
        }),
    );
    empty.hidden = true;
  };

  const loadCategories = async () => {
    const cached = readCache<CategoryItem[]>(categoriesCacheKey, sidebarCacheTtl);

    if (cached) {
      renderCategories(cached);
      return;
    }

    let categories: CategoryItem[];

    try {
      const result = await fetchAllPages<CategoryListItem>(categoriesEndpoint);
      categories = result.items
        .filter((category) => !category.spec?.hideFromList)
        .map((category) => ({
          name: category.spec?.displayName?.trim() || "",
          permalink: category.status?.permalink || "/categories",
          postCount: category.status?.postCount ?? category.postCount ?? 0,
        }))
        .filter((category) => category.name);
    } catch {
      const stale = readStaleCache<CategoryItem[]>(categoriesCacheKey);

      if (!stale?.length) {
        root.hidden = true;
        return;
      }

      categories = stale;
    }

    writeCache(categoriesCacheKey, categories);
    renderCategories(categories);
  };

  loadSidebarSectionWhenVisible(() => void loadCategories());
};
