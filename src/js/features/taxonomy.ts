/**
 * 分类 / 标签总览页：把分类与标签渲染成卡片。
 *
 * 分类卡片要展示浏览量、点赞数与评论数，这些统计只在文章列表接口里，
 * 因此分类总览页需要把文章全量拉下来在浏览器里聚合。
 */
import { fetchAllPages } from "../shared/api";
import { formatMessage, messages } from "../shared/i18n";

type Taxonomy = {
  metadata?: { name?: string };
  postCount?: number;
  spec?: {
    cover?: string;
    description?: string;
    displayName?: string;
    hideFromList?: boolean;
  };
  status?: { permalink?: string; postCount?: number; visiblePostCount?: number };
};

type Post = {
  categories?: Array<{ metadata?: { name?: string } }>;
  spec?: { cover?: string };
  stats?: { comment?: number; upvote?: number; visit?: number };
};

export const setupTaxonomyPage = () => {
  const list = document.querySelector<HTMLUListElement>("[data-taxonomy-page-list]");
  const empty = document.querySelector<HTMLElement>("[data-taxonomy-page-empty]");
  const kind = list?.dataset.taxonomyKind;

  if (!list || !empty || (kind !== "categories" && kind !== "tags")) {
    return;
  }

  const createMetric = (iconName: string, label: string) => {
    const metric = document.createElement("span");
    const icon = document.createElement("iconify-icon");
    const text = document.createElement("span");

    metric.className = "category-directory-metric";
    icon.setAttribute("icon", iconName);
    icon.setAttribute("aria-hidden", "true");
    text.textContent = label;
    metric.append(icon, text);
    return metric;
  };

  const createCategoryDirectoryItem = (category: Taxonomy, posts: Post[]) => {
    const item = document.createElement("li");
    const link = document.createElement("a");
    const cover = document.createElement("span");
    const fallback = document.createElement("span");
    const content = document.createElement("span");
    const title = document.createElement("strong");
    const description = document.createElement("span");
    const metrics = document.createElement("span");
    const name = category.spec?.displayName?.trim() || messages.taxonomy.untitled;
    const categoryPosts = posts.filter((post) =>
      post.categories?.some(
        (postCategory) => postCategory.metadata?.name === category.metadata?.name,
      ),
    );
    const stats = categoryPosts.reduce(
      (total, post) => ({
        comment: total.comment + (post.stats?.comment || 0),
        upvote: total.upvote + (post.stats?.upvote || 0),
        visit: total.visit + (post.stats?.visit || 0),
      }),
      { comment: 0, upvote: 0, visit: 0 },
    );
    const coverUrl =
      category.spec?.cover || categoryPosts.find((post) => post.spec?.cover)?.spec?.cover;
    const postCount =
      categoryPosts.length ||
      category.status?.visiblePostCount ||
      category.status?.postCount ||
      category.postCount ||
      0;

    item.className = "category-directory-item";
    link.className = "category-directory-card";
    link.href = category.status?.permalink || "/categories";
    cover.className = "category-directory-cover";
    fallback.className = "category-directory-cover-fallback";
    fallback.textContent = name.slice(0, 1);
    content.className = "category-directory-content";
    title.className = "category-directory-title";
    title.textContent = name;
    description.className = "category-directory-description";
    description.textContent =
      category.spec?.description?.trim() || messages.taxonomy.defaultDescription;
    metrics.className = "category-directory-metrics";
    metrics.append(
      createMetric("octicon:repo-16", formatMessage(messages.taxonomy.postsMetric, postCount)),
      createMetric("octicon:eye-16", formatMessage(messages.taxonomy.viewsMetric, stats.visit)),
      createMetric(
        "octicon:heart-16",
        formatMessage(messages.taxonomy.upvotesMetric, stats.upvote),
      ),
      createMetric(
        "octicon:comment-16",
        formatMessage(messages.taxonomy.commentsMetric, stats.comment),
      ),
    );

    if (coverUrl) {
      const image = document.createElement("img");
      image.src = coverUrl;
      image.alt = formatMessage(messages.taxonomy.coverAlt, name);
      image.loading = "lazy";
      image.addEventListener("error", () => image.replaceWith(fallback));
      cover.append(image);
    } else {
      cover.append(fallback);
    }

    content.append(title, description, metrics);
    link.append(cover, content);
    item.append(link);
    return item;
  };

  const loadTaxonomy = async () => {
    try {
      const taxonomies = (
        await fetchAllPages<Taxonomy>(`/apis/api.content.halo.run/v1alpha1/${kind}`)
      ).items;
      const posts =
        kind === "categories"
          ? (
              await fetchAllPages<Post>("/apis/api.content.halo.run/v1alpha1/posts").catch(() => ({
                items: [] as Post[],
                total: 0,
                totalPages: 0,
              }))
            ).items
          : [];

      const visibleTaxonomies = taxonomies.filter(
        (taxonomy) =>
          taxonomy.spec?.displayName?.trim() &&
          (kind !== "categories" || !taxonomy.spec.hideFromList),
      );

      if (!visibleTaxonomies.length) {
        empty.hidden = false;
        return;
      }

      visibleTaxonomies.sort((left, right) => {
        if (kind === "categories") {
          const countDifference =
            (right.status?.postCount ?? right.postCount ?? 0) -
            (left.status?.postCount ?? left.postCount ?? 0);

          if (countDifference) {
            return countDifference;
          }
        }

        return (left.spec?.displayName || "").localeCompare(right.spec?.displayName || "", "zh-CN");
      });

      list.replaceChildren(
        ...visibleTaxonomies.map((taxonomy) => {
          if (kind === "categories") {
            return createCategoryDirectoryItem(taxonomy, posts);
          }

          const item = document.createElement("li");
          const link = document.createElement("a");
          const title = document.createElement("strong");
          const meta = document.createElement("span");

          link.className = "tag taxonomy-card";
          link.href = taxonomy.status?.permalink || "/tags";
          title.className = "taxonomy-card-title";
          title.textContent = taxonomy.spec?.displayName?.trim() || "";
          meta.className = "taxonomy-card-meta";
          meta.textContent = messages.taxonomy.tags;
          link.append(title, meta);
          item.append(link);
          return item;
        }),
      );
      empty.hidden = true;
    } catch {
      list.replaceChildren();
      empty.textContent =
        kind === "categories"
          ? messages.taxonomy.categoriesLoadFailed
          : messages.taxonomy.tagsLoadFailed;
      empty.hidden = false;
    }
  };

  void loadTaxonomy();
};
