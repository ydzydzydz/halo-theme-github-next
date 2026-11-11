import { setupReadme } from "./shared/readme";

type Post = {
  metadata?: Metadata;
  spec?: {
    publishTime?: string;
    title?: string;
  };
  status?: {
    lastModifyTime?: string;
    permalink?: string;
  };
};

type Metadata = {
  creationTimestamp?: string;
};

type ContentTaxonomy = {
  metadata?: Metadata;
  spec?: {
    displayName?: string;
  };
  status?: {
    permalink?: string;
  };
};

type Moment = {
  metadata?: Metadata;
  spec?: {
    content?: {
      html?: string;
      raw?: string;
    };
    releaseTime?: string;
  };
};

type Photo = {
  metadata?: Metadata;
  spec?: {
    displayName?: string;
    url?: string;
  };
  status?: {
    permalink?: string;
  };
};

type ListResult<T> = {
  items?: T[];
  totalPages?: number;
};

type ContributionKind = "published" | "updated";

type Contribution = {
  date: Date;
  dateKey: string;
  kind: ContributionKind;
  permalink: string;
  title: string;
};

type ActivityKind =
  | ContributionKind
  | "category-created"
  | "moment-published"
  | "photo-added"
  | "tag-created";

type SiteActivity = Omit<Contribution, "kind"> & {
  kind: ActivityKind;
};

type DateRange = {
  end: Date;
  start: Date;
};

type ContributionFormatters = {
  activityMonth: Intl.DateTimeFormat;
  displayDate: Intl.DateTimeFormat;
  month: Intl.DateTimeFormat;
  selectedDate: Intl.DateTimeFormat;
};

const postsEndpoint = "/apis/api.content.halo.run/v1alpha1/posts";
const tagsEndpoint = "/apis/api.content.halo.run/v1alpha1/tags";
const categoriesEndpoint = "/apis/api.content.halo.run/v1alpha1/categories";
const momentsEndpoint = "/apis/api.moment.halo.run/v1alpha1/moments";
const photosEndpoint = "/apis/api.photo.halo.run/v1alpha1/photos";
const getContributionFormatters = (isChinese: boolean): ContributionFormatters => {
  const locale = isChinese ? "zh-CN" : "en";

  return {
    month: new Intl.DateTimeFormat(locale, { month: "short" }),
    activityMonth: new Intl.DateTimeFormat(locale, {
      month: "long",
      year: "numeric",
    }),
    displayDate: new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
    selectedDate: new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
  };
};

const atNoon = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);

const addDays = (date: Date, amount: number) => {
  const result = atNoon(date);
  result.setDate(result.getDate() + amount);
  return result;
};

const dateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parsePostDate = (value: string | undefined) => {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : atNoon(parsed);
};

const getRange = (year: number, currentYear: number): DateRange => {
  if (year === currentYear) {
    const today = atNoon(new Date());
    const currentWeekStart = addDays(today, -today.getDay());
    return {
      start: addDays(currentWeekStart, -52 * 7),
      end: addDays(currentWeekStart, 6),
    };
  }

  const firstDay = new Date(year, 0, 1, 12);
  const lastDay = new Date(year, 11, 31, 12);
  return {
    start: addDays(firstDay, -firstDay.getDay()),
    end: addDays(lastDay, 6 - lastDay.getDay()),
  };
};

const getRangeDays = ({ start, end }: DateRange) => {
  const days: Date[] = [];

  for (let day = start; day <= end; day = addDays(day, 1)) {
    days.push(day);
  }

  return days;
};

const fetchAll = async <T>(endpoint: string) => {
  const items: T[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const query = new URLSearchParams({ page: String(page), size: "100" });
    const response = await fetch(`${endpoint}?${query}`);

    if (!response.ok) {
      throw new Error(`Unable to load posts: ${response.status}`);
    }

    const result = (await response.json()) as ListResult<T>;
    items.push(...(result.items || []));
    totalPages = Math.max(1, result.totalPages || 1);
    page += 1;
  } while (page <= totalPages);

  return items;
};

const fetchOptional = async <T>(endpoint: string) => {
  try {
    return await fetchAll<T>(endpoint);
  } catch {
    return [];
  }
};

const getMomentTitle = (moment: Moment, isChinese: boolean) => {
  const container = document.createElement("div");
  container.innerHTML = moment.spec?.content?.html || moment.spec?.content?.raw || "";
  const content = container.textContent?.replace(/\s+/g, " ").trim();

  if (!content) {
    return isChinese ? "一条瞬间" : "A moment";
  }

  return content.length > 60 ? `${content.slice(0, 60)}...` : content;
};

const createSiteActivity = (
  value: string | undefined,
  kind: ActivityKind,
  title: string,
  permalink: string,
) => {
  const date = parsePostDate(value);

  if (!date) {
    return undefined;
  }

  return { date, dateKey: dateKey(date), kind, permalink, title } satisfies SiteActivity;
};

const getSiteActivities = (
  posts: Post[],
  moments: Moment[],
  tags: ContentTaxonomy[],
  categories: ContentTaxonomy[],
  photos: Photo[],
  isChinese: boolean,
) => {
  const activities: Array<SiteActivity | undefined> = [
    ...posts.map((post) =>
      createSiteActivity(
        post.spec?.publishTime,
        "published",
        post.spec?.title?.trim() || (isChinese ? "未命名文章" : "Untitled post"),
        post.status?.permalink || "/archives",
      ),
    ),
    ...moments.map((moment) =>
      createSiteActivity(
        moment.spec?.releaseTime || moment.metadata?.creationTimestamp,
        "moment-published",
        getMomentTitle(moment, isChinese),
        "/moments",
      ),
    ),
    ...tags.map((tag) =>
      createSiteActivity(
        tag.metadata?.creationTimestamp,
        "tag-created",
        tag.spec?.displayName?.trim() || (isChinese ? "未命名标签" : "Untitled tag"),
        tag.status?.permalink || "/tags",
      ),
    ),
    ...categories.map((category) =>
      createSiteActivity(
        category.metadata?.creationTimestamp,
        "category-created",
        category.spec?.displayName?.trim() || (isChinese ? "未命名分类" : "Untitled category"),
        category.status?.permalink || "/categories",
      ),
    ),
    ...photos.map((photo) =>
      createSiteActivity(
        photo.metadata?.creationTimestamp,
        "photo-added",
        photo.spec?.displayName?.trim() || (isChinese ? "未命名图片" : "Untitled photo"),
        photo.spec?.url || photo.status?.permalink || "/photos",
      ),
    ),
  ];

  return activities
    .filter((activity): activity is SiteActivity => Boolean(activity))
    .sort((left, right) => right.date.getTime() - left.date.getTime());
};

const getActivityLabels = (isChinese: boolean): Record<ActivityKind, string> =>
  isChinese
    ? {
        "category-created": "创建了分类",
        "moment-published": "发布了瞬间",
        "photo-added": "添加了图库内容",
        published: "发布了文章",
        "tag-created": "创建了标签",
        updated: "更新了文章",
      }
    : {
        "category-created": "Created a category",
        "moment-published": "Published a moment",
        "photo-added": "Added a photo",
        published: "Published a post",
        "tag-created": "Created a tag",
        updated: "Updated a post",
      };

const activityIcons: Record<ActivityKind, string> = {
  "category-created": "lucide:folder-plus",
  "moment-published": "lucide:message-circle-plus",
  "photo-added": "lucide:image-plus",
  published: "lucide:file-plus-2",
  "tag-created": "lucide:tag",
  updated: "lucide:file-pen-line",
};

const createActivityItem = (
  activity: SiteActivity,
  isChinese: boolean,
  displayDateFormatter: Intl.DateTimeFormat,
) => {
  const item = document.createElement("div");
  item.className = "activity-item";

  const icon = document.createElement("span");
  icon.className = "activity-icon";
  icon.setAttribute("aria-hidden", "true");
  const iconElement = document.createElement("iconify-icon");
  iconElement.setAttribute("icon", activityIcons[activity.kind]);
  icon.append(iconElement);

  const copy = document.createElement("div");
  copy.className = "activity-copy";

  const heading = document.createElement("h3");
  heading.textContent = getActivityLabels(isChinese)[activity.kind];

  const link = document.createElement("a");
  link.href = activity.permalink;
  link.textContent = activity.title;
  copy.append(heading, link);

  const time = document.createElement("time");
  time.dateTime = activity.dateKey;
  time.textContent = displayDateFormatter.format(activity.date);

  item.append(icon, copy, time);
  return item;
};

const renderActivity = (
  container: HTMLElement,
  activities: SiteActivity[],
  range: DateRange,
  selectedYear: number,
  currentYear: number,
  page: number,
  pageSize: number,
  selectedDateKey: string | undefined,
  isChinese: boolean,
  formatters: ContributionFormatters,
) => {
  const visible = activities.filter(
    (activity) =>
      (!selectedDateKey || activity.dateKey === selectedDateKey) &&
      activity.date >= range.start &&
      activity.date <= range.end &&
      activity.date <= new Date() &&
      (selectedYear === currentYear || activity.date.getFullYear() === selectedYear),
  );
  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const displayed = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  container.replaceChildren();

  if (!displayed.length) {
    const empty = document.createElement("p");
    empty.className = "activity-empty";
    empty.textContent = selectedDateKey
      ? isChinese
        ? "该日期暂无站点动态。"
        : "No site activity on this date."
      : isChinese
        ? "这个时间段暂无站点动态。"
        : "No site activity for this period.";
    container.append(empty);
    return { currentPage: 1, totalPages: 1, totalItems: 0 };
  }

  const groups = new Map<string, SiteActivity[]>();
  displayed.forEach((activity) => {
    const key = `${activity.date.getFullYear()}-${activity.date.getMonth()}`;
    const group = groups.get(key) || [];
    group.push(activity);
    groups.set(key, group);
  });

  groups.forEach((items) => {
    const section = document.createElement("section");
    section.className = "activity-group";

    const month = document.createElement("div");
    month.className = "activity-month";
    const heading = document.createElement("h3");
    heading.textContent = formatters.activityMonth.format(items[0].date);
    const rule = document.createElement("span");
    month.append(heading, rule);

    section.append(
      month,
      ...items.map((activity) => createActivityItem(activity, isChinese, formatters.displayDate)),
    );
    container.append(section);
  });

  return { currentPage, totalPages, totalItems: visible.length };
};

const renderContributionGraph = (
  graph: HTMLElement,
  months: HTMLElement,
  total: HTMLElement,
  activities: SiteActivity[],
  range: DateRange,
  selectedYear: number,
  currentYear: number,
  selectedDateKey: string | undefined,
  onSelectDate: (dateKey: string) => void,
  isChinese: boolean,
  formatters: ContributionFormatters,
) => {
  const days = getRangeDays(range);
  const today = atNoon(new Date());
  const byDay = new Map<string, SiteActivity[]>();

  activities.forEach((activity) => {
    const items = byDay.get(activity.dateKey) || [];
    items.push(activity);
    byDay.set(activity.dateKey, items);
  });

  const visibleDays = days.filter(
    (day) => day <= today && (selectedYear === currentYear || day.getFullYear() === selectedYear),
  );
  const maximum = Math.max(0, ...visibleDays.map((day) => byDay.get(dateKey(day))?.length || 0));
  const totalCount = visibleDays.reduce(
    (sum, day) => sum + (byDay.get(dateKey(day))?.length || 0),
    0,
  );
  const weeks = Math.ceil(days.length / 7);

  graph.style.setProperty("--contribution-weeks", String(weeks));
  months.style.setProperty("--contribution-weeks", String(weeks));
  graph.replaceChildren();
  months.replaceChildren();
  total.textContent =
    selectedYear === currentYear
      ? isChinese
        ? `过去一年有 ${totalCount} 次站点互动`
        : `${totalCount} contributions in the last year`
      : isChinese
        ? `${selectedYear} 年有 ${totalCount} 次站点互动`
        : `${totalCount} contributions in ${selectedYear}`;

  days.forEach((day) => {
    const key = dateKey(day);
    const items = byDay.get(key) || [];
    const cell = document.createElement("button");
    const isOutside = day.getFullYear() !== selectedYear && selectedYear !== currentYear;
    const isFuture = day > today;
    const level =
      items.length && maximum ? Math.max(1, Math.ceil((items.length / maximum) * 4)) : 0;
    const titles = items.map(({ title }) => title).join(", ");
    const description = isChinese
      ? `${formatters.displayDate.format(day)}有 ${items.length} 次站点互动${titles ? `：${titles}` : ""}`
      : `${items.length} contribution${items.length === 1 ? "" : "s"} on ${formatters.displayDate.format(day)}${titles ? `: ${titles}` : ""}`;

    const isSelected = key === selectedDateKey;
    cell.type = "button";
    cell.className = `day level-${level}${isOutside || isFuture ? " is-outside" : ""}${isSelected ? " is-selected" : ""}`;
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("aria-label", description);
    cell.setAttribute("aria-selected", String(isSelected));
    cell.disabled = isOutside || isFuture;
    cell.title = description;
    cell.addEventListener("click", () => onSelectDate(key));
    graph.append(cell);
  });

  let previousMonth = -1;
  days.forEach((day, index) => {
    if (day > today || day.getMonth() === previousMonth || day.getDate() > 7) {
      return;
    }

    previousMonth = day.getMonth();
    const label = document.createElement("span");
    label.textContent = formatters.month.format(day);
    label.style.gridColumn = String(Math.floor(index / 7) + 1);
    months.append(label);
  });
};

const setupContributions = async () => {
  const root = document.querySelector<HTMLElement>("[data-contribution-root]");
  const graph = root?.querySelector<HTMLElement>("[data-contribution-graph]");
  const months = root?.querySelector<HTMLElement>("[data-contribution-months]");
  const total = root?.querySelector<HTMLElement>("[data-contribution-total]");
  const years = root?.querySelector<HTMLElement>("[data-contribution-years]");
  const activityHeading = root?.querySelector<HTMLElement>("[data-activity-heading]");
  const activity = document.querySelector<HTMLElement>("[data-contribution-activity]");
  const pagination = root?.querySelector<HTMLElement>("[data-activity-pagination]");
  const previousButton = pagination?.querySelector<HTMLButtonElement>("[data-activity-previous]");
  const nextButton = pagination?.querySelector<HTMLButtonElement>("[data-activity-next]");
  const pageLabel = pagination?.querySelector<HTMLElement>("[data-activity-page]");

  if (
    !root ||
    !graph ||
    !months ||
    !total ||
    !years ||
    !activityHeading ||
    !activity ||
    !pagination ||
    !previousButton ||
    !nextButton ||
    !pageLabel
  ) {
    return;
  }

  const configuredLimit = Number.parseInt(root.dataset.activityLimit || "6", 10);
  const activityLimit = Number.isNaN(configuredLimit)
    ? 6
    : Math.min(Math.max(configuredLimit, 1), 50);
  const isChinese = root.dataset.contributionLanguage === "zh-CN";
  const formatters = getContributionFormatters(isChinese);

  try {
    const [posts, moments, tags, categories, photos] = await Promise.all([
      fetchAll<Post>(postsEndpoint),
      fetchOptional<Moment>(momentsEndpoint),
      fetchOptional<ContentTaxonomy>(tagsEndpoint),
      fetchOptional<ContentTaxonomy>(categoriesEndpoint),
      fetchOptional<Photo>(photosEndpoint),
    ]);
    const siteActivities = getSiteActivities(posts, moments, tags, categories, photos, isChinese);
    const currentYear = new Date().getFullYear();
    const earliestYear = Math.min(
      currentYear,
      ...siteActivities.map(({ date }) => date.getFullYear()),
    );
    const availableYears = Array.from(
      { length: currentYear - earliestYear + 1 },
      (_, index) => currentYear - index,
    );
    let selectedYear = currentYear;
    let selectedDateKey: string | undefined;
    let activityPage = 1;

    const render = () => {
      const range = getRange(selectedYear, currentYear);
      renderContributionGraph(
        graph,
        months,
        total,
        siteActivities,
        range,
        selectedYear,
        currentYear,
        selectedDateKey,
        (key) => {
          selectedDateKey = selectedDateKey === key ? undefined : key;
          activityPage = 1;
          render();
        },
        isChinese,
        formatters,
      );
      const pageResult = renderActivity(
        activity,
        siteActivities,
        range,
        selectedYear,
        currentYear,
        activityPage,
        activityLimit,
        selectedDateKey,
        isChinese,
        formatters,
      );
      activityPage = pageResult.currentPage;
      pagination.hidden = pageResult.totalPages <= 1;
      // 全站统一的翻页约定：没有可翻的一侧保持可见但禁用，而不是直接隐藏
      previousButton.disabled = activityPage <= 1;
      nextButton.disabled = activityPage >= pageResult.totalPages;
      pageLabel.textContent = `${activityPage} / ${pageResult.totalPages}`;
      if (selectedDateKey) {
        const [year, month, day] = selectedDateKey.split("-").map(Number);
        const selectedDate = formatters.selectedDate.format(new Date(year, month - 1, day, 12));
        activityHeading.textContent = isChinese
          ? `${selectedDate}站点动态`
          : `Site activity on ${selectedDate}`;
      } else {
        activityHeading.textContent = isChinese ? "站点动态" : "Site activity";
      }
      years.querySelectorAll("button").forEach((button) => {
        const isActive = Number((button as HTMLButtonElement).dataset.year) === selectedYear;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
      });
    };

    availableYears.forEach((year) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.year = String(year);
      button.textContent = String(year);
      button.addEventListener("click", () => {
        selectedYear = year;
        selectedDateKey = undefined;
        activityPage = 1;
        render();
      });
      years.append(button);
    });

    previousButton.addEventListener("click", () => {
      activityPage -= 1;
      render();
      activityHeading.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    nextButton.addEventListener("click", () => {
      activityPage += 1;
      render();
      activityHeading.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    render();
  } catch {
    total.textContent = isChinese ? "无法加载贡献图" : "Contribution activity unavailable";
    activity.innerHTML = `<p class="activity-empty">${isChinese ? "无法加载站点动态。" : "Unable to load site activity."}</p>`;
  }
};

void setupContributions();
setupReadme();
