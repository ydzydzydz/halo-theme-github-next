import { fetchAllPages } from "./shared/api";
import { pageLocale, plainTextFromHtml, scrollBehavior, truncateText } from "./shared/dom";
import { messages, formatMessage } from "./shared/i18n";
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

/**
 * 贡献图 / 站点动态模块使用的文案集合。
 *
 * 模块的语言有两个来源：
 * 1. 跟随页面语言（Halo 协商出的 `<html lang>`）；
 * 2. 后台「动态贡献图开启英文显示」开关打开时固定英文。
 *
 * 两种情况都从 i18n 消息表取值，脚本里不写死任何中英文字面量。
 */
type ContributionCopy = {
  heading: string;
  headingSelected: string;
  tooltip: string;
  yearTotal: string;
  total: string;
  kinds: Record<ActivityKind, string>;
};

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
const getContributionFormatters = (locale: string): ContributionFormatters => {
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

const fetchOptional = async <T>(endpoint: string) => {
  try {
    const result = await fetchAllPages<T>(endpoint);
    return result.items;
  } catch {
    return [];
  }
};

const getMomentTitle = (moment: Moment) => {
  // 瞬间正文是用户撰写的 HTML，只取纯文本：
  // 用 DOMParser 解析不会发起任何网络请求，也不会让每条瞬间都跑一遍完整的 DOM 构建。
  const content = plainTextFromHtml(moment.spec?.content?.html || moment.spec?.content?.raw || "");

  if (!content) {
    return messages.common.noData;
  }

  return truncateText(content, 60);
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
) => {
  const activities: Array<SiteActivity | undefined> = [
    ...posts.map((post) =>
      createSiteActivity(
        post.spec?.publishTime,
        "published",
        post.spec?.title?.trim() || messages.common.noData,
        post.status?.permalink || "/archives",
      ),
    ),
    ...moments.map((moment) =>
      createSiteActivity(
        moment.spec?.releaseTime || moment.metadata?.creationTimestamp,
        "moment-published",
        getMomentTitle(moment),
        "/moments",
      ),
    ),
    ...tags.map((tag) =>
      createSiteActivity(
        tag.metadata?.creationTimestamp,
        "tag-created",
        tag.spec?.displayName?.trim() || messages.common.noData,
        tag.status?.permalink || "/tags",
      ),
    ),
    ...categories.map((category) =>
      createSiteActivity(
        category.metadata?.creationTimestamp,
        "category-created",
        category.spec?.displayName?.trim() || messages.common.noData,
        category.status?.permalink || "/categories",
      ),
    ),
    ...photos.map((photo) =>
      createSiteActivity(
        photo.metadata?.creationTimestamp,
        "photo-added",
        photo.spec?.displayName?.trim() || messages.common.noData,
        photo.spec?.url || photo.status?.permalink || "/photos",
      ),
    ),
  ];

  return activities
    .filter((activity): activity is SiteActivity => Boolean(activity))
    .sort((left, right) => right.date.getTime() - left.date.getTime());
};

const activityIcons: Record<ActivityKind, string> = {
  "category-created": "lucide:folder-plus",
  "moment-published": "lucide:message-circle-plus",
  "photo-added": "lucide:image-plus",
  published: "lucide:file-plus-2",
  "tag-created": "lucide:tag",
  updated: "lucide:file-pen-line",
};

/**
 * 取贡献图与站点动态使用的文案。
 *
 * 语言跟随 Halo 协商出的页面语言（`<html lang>`），与模板里的 `#{...}` 保持一致，
 * 主题不再提供「强制英文」开关 —— 需要英文时切换站点语言即可。
 */
const getContributionCopy = (): ContributionCopy => ({
  heading: messages.activity.heading,
  headingSelected: messages.activity.headingSelected,
  tooltip: messages.activity.tooltip,
  yearTotal: messages.activity.yearTotal,
  total: messages.activity.total,
  kinds: {
    "category-created": messages.activity.kindCategoryCreated,
    "moment-published": messages.activity.kindMomentPublished,
    "photo-added": messages.activity.kindPhotoAdded,
    published: messages.activity.kindPublished,
    "tag-created": messages.activity.kindTagCreated,
    updated: messages.activity.kindUpdated,
  },
});

const createActivityItem = (
  activity: SiteActivity,
  displayDateFormatter: Intl.DateTimeFormat,
  copy: ContributionCopy,
) => {
  const item = document.createElement("div");
  item.className = "activity-item";

  const icon = document.createElement("span");
  icon.className = "activity-icon";
  icon.setAttribute("aria-hidden", "true");
  const iconElement = document.createElement("iconify-icon");
  iconElement.setAttribute("icon", activityIcons[activity.kind]);
  icon.append(iconElement);

  const copy_ = document.createElement("div");
  copy_.className = "activity-copy";

  const heading = document.createElement("h3");
  heading.textContent = copy.kinds[activity.kind];

  const link = document.createElement("a");
  link.href = activity.permalink;
  link.textContent = activity.title;
  copy_.append(heading, link);

  const time = document.createElement("time");
  time.dateTime = activity.dateKey;
  time.textContent = displayDateFormatter.format(activity.date);

  item.append(icon, copy_, time);
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
  formatters: ContributionFormatters,
  copy: ContributionCopy,
) => {
  const visible = activities.filter(
    (activity) =>
      (!selectedDateKey || activity.dateKey === selectedDateKey) &&
      activity.date >= range.start &&
      activity.date <= range.end &&
      // 活动时间统一归一化到当天 12:00，「今天」的基准也要用同一个口径，
      // 否则上午发布的内容会被精确的 new Date() 过滤掉，
      // 还会出现「贡献图有今天的方块、动态列表却是空的」。
      activity.date <= atNoon(new Date()) &&
      (selectedYear === currentYear || activity.date.getFullYear() === selectedYear),
  );
  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const displayed = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  container.replaceChildren();

  if (!displayed.length) {
    const empty = document.createElement("p");
    empty.className = "activity-empty";
    empty.textContent = messages.activity.empty;
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
      ...items.map((activity) => createActivityItem(activity, formatters.displayDate, copy)),
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
  formatters: ContributionFormatters,
  copy: ContributionCopy,
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
      ? formatMessage(copy.total, totalCount)
      : formatMessage(copy.yearTotal, selectedYear, totalCount);

  days.forEach((day) => {
    const key = dateKey(day);
    const items = byDay.get(key) || [];
    const cell = document.createElement("button");
    const isOutside = day.getFullYear() !== selectedYear && selectedYear !== currentYear;
    const isFuture = day > today;
    const level =
      items.length && maximum ? Math.max(1, Math.ceil((items.length / maximum) * 4)) : 0;
    const titles = items.map(({ title }) => title).join(", ");
    const description = formatMessage(
      copy.tooltip,
      formatters.displayDate.format(day),
      items.length,
      titles,
    );

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
  // 贡献图与站点动态跟随 Halo 协商出的页面语言。
  const locale = pageLocale();
  const formatters = getContributionFormatters(locale);
  const copy = getContributionCopy();

  try {
    const [posts, moments, tags, categories, photos] = await Promise.all([
      fetchAllPages<Post>(postsEndpoint).then((result) => result.items),
      fetchOptional<Moment>(momentsEndpoint),
      fetchOptional<ContentTaxonomy>(tagsEndpoint),
      fetchOptional<ContentTaxonomy>(categoriesEndpoint),
      fetchOptional<Photo>(photosEndpoint),
    ]);
    const siteActivities = getSiteActivities(posts, moments, tags, categories, photos);
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
        formatters,
        copy,
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
        formatters,
        copy,
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
        activityHeading.textContent = formatMessage(copy.headingSelected, selectedDate);
      } else {
        activityHeading.textContent = copy.heading;
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
      activityHeading.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    });
    nextButton.addEventListener("click", () => {
      activityPage += 1;
      render();
      activityHeading.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    });

    render();
  } catch {
    total.textContent = messages.activity.failed;
    const failed = document.createElement("p");
    failed.className = "activity-empty";
    failed.textContent = messages.activity.failed;
    activity.replaceChildren(failed);
  }
};

void setupContributions();
setupReadme();
