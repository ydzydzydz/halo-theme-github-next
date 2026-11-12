import "../css/main.scss";
import "../css/about.scss";
import "iconify-icon";
import { setupBackToTop } from "./shared/back-to-top";
import { setupCommentWidgetStyle } from "./shared/comment-widget";
import { pageLocale, showInlineHint } from "./shared/dom";
import { messages, formatMessage } from "./shared/i18n";
import { setupRepositoryFilters } from "./shared/repository-filters";

type SearchHit = {
  title?: string;
  description?: string;
  content?: string;
  permalink?: string;
};

type SearchResult = {
  hits?: SearchHit[];
  total?: number;
};

type CurrentUserDetail = {
  user?: {
    metadata?: {
      name?: string;
    };
    spec?: {
      avatar?: string;
      displayName?: string;
    };
  };
};

type NotificationList = {
  items?: unknown[];
  total?: number;
};

type OpenMeteoResponse = {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
  };
};

type WeatherCoordinates = {
  label: string;
  latitude: number;
  longitude: number;
};

const searchEndpoint = "/apis/api.halo.run/v1alpha1/indices/-/search";
const currentUserEndpoint = "/apis/api.console.halo.run/v1alpha1/users/-";
const momentUpvoteEndpoint = "/apis/api.halo.run/v1alpha1/trackers/upvote";
const colorSchemeStorageKey = "theme-github-next-color-scheme";
let currentUserRequest: Promise<CurrentUserDetail | undefined> | undefined;

const getWeatherMeta = (code: number) => {
  if (code === 0) {
    return { icon: "solar:sun-2-linear", label: messages.weather.conditionClear };
  }

  if ([1, 2].includes(code)) {
    return { icon: "solar:cloud-sun-2-linear", label: messages.weather.conditionMostlyClear };
  }

  if (code === 3) {
    return { icon: "solar:cloud-linear", label: messages.weather.conditionOvercast };
  }

  if ([45, 48].includes(code)) {
    return { icon: "solar:cloud-fog-linear", label: messages.weather.conditionFog };
  }

  if ([51, 53, 55, 56, 57].includes(code)) {
    return { icon: "solar:cloud-sun-rain-linear", label: messages.weather.conditionDrizzle };
  }

  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
    return { icon: "solar:cloud-rain-linear", label: messages.weather.conditionRain };
  }

  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return { icon: "solar:cloud-snowfall-linear", label: messages.weather.conditionSnow };
  }

  if ([95, 96, 99].includes(code)) {
    return { icon: "solar:cloud-bolt-linear", label: messages.weather.conditionThunderstorm };
  }

  return { icon: "solar:cloud-linear", label: messages.weather.conditionCloudy };
};

const setupWeather = () => {
  const widget = document.querySelector<HTMLElement>("[data-weather-widget]");
  const icon = widget?.querySelector<HTMLElement>("[data-weather-icon]");
  const location = widget?.querySelector<HTMLElement>("[data-weather-location-label]");
  const temperature = widget?.querySelector<HTMLElement>("[data-weather-temperature]");

  if (!widget || !icon || !location || !temperature) {
    widget?.setAttribute("hidden", "");
    return;
  }

  const fallback: WeatherCoordinates = {
    label: widget.dataset.weatherLocation?.trim() || messages.weather.defaultLabel,
    latitude: Number(widget.dataset.weatherLatitude),
    longitude: Number(widget.dataset.weatherLongitude),
  };
  const preferVisitorLocation = widget.dataset.weatherAutoLocation !== "false";

  if (!Number.isFinite(fallback.latitude) || !Number.isFinite(fallback.longitude)) {
    widget.setAttribute("hidden", "");
    return;
  }

  const loadWeather = (coordinates: WeatherCoordinates, fallBackOnFailure: boolean) => {
    location.textContent = coordinates.label;
    const params = new URLSearchParams({
      current: "temperature_2m,weather_code",
      latitude: String(coordinates.latitude),
      longitude: String(coordinates.longitude),
      timezone: "auto",
    });

    void fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Weather API failed: ${response.status}`);
        }

        return response.json() as Promise<OpenMeteoResponse>;
      })
      .then((payload) => {
        const value = payload.current?.temperature_2m;
        const code = payload.current?.weather_code;

        if (
          typeof value !== "number" ||
          typeof code !== "number" ||
          !Number.isFinite(value) ||
          !Number.isFinite(code)
        ) {
          throw new Error("Weather API returned incomplete data");
        }

        const weather = getWeatherMeta(code);
        const roundedTemperature = Math.round(value);
        icon.setAttribute("icon", weather.icon);
        temperature.textContent = `${roundedTemperature}°`;
        widget.setAttribute(
          "aria-label",
          formatMessage(
            messages.weather.summary,
            coordinates.label,
            weather.label,
            String(roundedTemperature),
          ),
        );
      })
      .catch(() => {
        if (fallBackOnFailure) {
          loadWeather(fallback, false);
          return;
        }

        widget.setAttribute("hidden", "");
      });
  };

  if (!preferVisitorLocation || !("geolocation" in navigator)) {
    loadWeather(fallback, false);
    return;
  }

  location.textContent = messages.weather.locating;
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        loadWeather(fallback, false);
        return;
      }

      loadWeather({ label: messages.weather.currentLocation, latitude, longitude }, true);
    },
    () => loadWeather(fallback, false),
    { enableHighAccuracy: false, maximumAge: 900000, timeout: 6000 },
  );
};

const getCurrentUser = () => {
  currentUserRequest ??= fetch(currentUserEndpoint)
    .then((response) => (response.ok ? (response.json() as Promise<CurrentUserDetail>) : undefined))
    .catch(() => undefined);

  return currentUserRequest;
};

const setupThemeToggle = () => {
  const trigger = document.querySelector<HTMLButtonElement>("[data-theme-toggle]");
  const icon = trigger?.querySelector<HTMLElement>("iconify-icon");

  if (!trigger) {
    return;
  }

  // 三种状态：system（跟随系统）/ light / dark。
  // 只有用户显式选择过 light 或 dark 时才写入 <html data-color-scheme>，
  // 这样未选择过的访客能由 CSS 的 prefers-color-scheme 规则接管，跟随系统外观。
  type ColorScheme = "system" | "light" | "dark";

  const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)");

  let preference: ColorScheme = "system";

  try {
    const stored = localStorage.getItem(colorSchemeStorageKey);
    if (stored === "dark" || stored === "light") {
      preference = stored;
    }
  } catch {
    // 存储不可用时保持 system，由 CSS 媒体查询决定实际外观。
  }

  const resolveScheme = (value: ColorScheme): "light" | "dark" => {
    if (value === "dark") return "dark";
    if (value === "light") return "light";
    return systemPrefersDark.matches ? "dark" : "light";
  };

  // 三态循环：跟随系统 -> 白色 -> 夜间 -> 跟随系统。
  // 这样用户可以回到「跟随系统」，不必清缓存才能恢复默认行为。
  const nextScheme = (value: ColorScheme): ColorScheme => {
    if (value === "system") return "light";
    if (value === "light") return "dark";
    return "system";
  };

  // 图标按「用户选择的模式」取，而不是按「当前实际生效的外观」取。
  //
  // 原因：跟随系统时实际外观由操作系统决定，若图标跟着实际外观走，
  // 系统为暗色时「跟随系统」和「夜间」会渲染成完全一样的月亮图标，
  // 用户点击后看不出自己已经切回了跟随系统。这里用显示器图标表示
  // 「跟随设备 / 跟随系统设置」，太阳与月亮分别表示白色与夜间。
  const colorSchemeIcons: Record<ColorScheme, string> = {
    system: "solar:monitor-linear",
    light: "solar:sun-linear",
    dark: "solar:moon-line-duotone",
  };

  const colorSchemeModeLabels: Record<ColorScheme, string> = {
    system: messages.theme.modeSystem,
    light: messages.theme.modeLight,
    dark: messages.theme.modeDark,
  };

  const colorSchemeActionLabels: Record<ColorScheme, string> = {
    system: messages.theme.switchToSystem,
    light: messages.theme.switchToLight,
    dark: messages.theme.switchToDark,
  };

  const applyColorScheme = (preferenceValue: ColorScheme) => {
    const scheme = resolveScheme(preferenceValue);
    const root = document.documentElement;

    // 始终把「实际生效的配色」写到 <html data-color-scheme>，跟随系统时也不例外。
    //
    // 原因是站点里的插件（代码高亮 shiki、文章摘要、评论组件、搜索组件……）
    // 都以 html[data-color-scheme="dark"] 判断是否暗色。如果跟随系统时把这个
    // 属性删掉，主题自己会按 prefers-color-scheme 变暗，插件却仍是浅色，
    // 暗色页面上就会浮着几张白色卡片。
    //
    // CSS 里的 @media (prefers-color-scheme: dark) 分支保留给没有 JS 的访客。
    root.dataset.colorScheme = scheme;

    // 无障碍名称同时说明「当前是什么模式」和「点下去会切到什么模式」，
    // 光靠图标传达不了三态之间的区别。
    const label = `${formatMessage(
      messages.theme.modeLabel,
      colorSchemeModeLabels[preferenceValue],
    )}, ${colorSchemeActionLabels[nextScheme(preferenceValue)]}`;

    trigger.setAttribute("aria-label", label);
    trigger.title = label;
    trigger.dataset.colorMode = preferenceValue;
    icon?.setAttribute("icon", colorSchemeIcons[preferenceValue]);
  };

  applyColorScheme(preference);

  trigger.addEventListener("click", () => {
    preference = nextScheme(preference);
    applyColorScheme(preference);

    try {
      if (preference === "system") {
        localStorage.removeItem(colorSchemeStorageKey);
      } else {
        localStorage.setItem(colorSchemeStorageKey, preference);
      }
    } catch {
      // 存储不可用时，本次页面仍然按所选模式生效。
    }
  });

  // 用户未显式选择时，系统外观变化应实时反映到页面。
  const onSystemChange = () => {
    if (preference === "system") {
      applyColorScheme(preference);
    }
  };

  if (typeof systemPrefersDark.addEventListener === "function") {
    systemPrefersDark.addEventListener("change", onSystemChange);
  } else if (typeof systemPrefersDark.addListener === "function") {
    systemPrefersDark.addListener(onSystemChange);
  }
};

// 一年按 365.2425 天计算，站点运行时间与建站历程进度条保持一致。
const averageYearMs = 365.2425 * 86_400_000;

const setupSiteTimeline = () => {
  const timeline = document.querySelector<HTMLElement>("[data-site-timeline]");
  const progress = timeline?.querySelector<HTMLElement>("[data-site-progress]");
  const percent = timeline?.querySelector<HTMLElement>("[data-site-percent]");
  const age = timeline?.querySelector<HTMLElement>("[data-site-age]");
  const target = timeline?.querySelector<HTMLElement>("[data-site-target]");

  if (!timeline || !progress || !percent || !age || !target) {
    return;
  }

  const start = new Date(`${timeline.dataset.start}T00:00:00`);
  const end = new Date(`${timeline.dataset.end}T00:00:00`);
  const now = new Date();

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return;
  }

  const elapsed = Math.max(0, now.getTime() - start.getTime());
  const duration = end.getTime() - start.getTime();
  const elapsedDays = Math.floor(elapsed / 86_400_000);
  const durationYears = duration / averageYearMs;
  const progressValue = Math.min(100, Math.max(0, (elapsed / duration) * 100));

  progress.style.width = `${progressValue}%`;
  percent.textContent = `${progressValue.toFixed(2)}%`;
  age.textContent = formatMessage(messages.timeline.elapsedDays, elapsedDays);
  target.textContent = formatMessage(
    messages.timeline.target,
    Number.isInteger(durationYears) ? durationYears : durationYears.toFixed(1),
  );
};

const setupSiteRuntime = () => {
  const runtime = document.querySelector<HTMLElement>("[data-site-runtime]");
  const startValue = runtime?.dataset.start?.trim();

  if (!runtime || !startValue) {
    return;
  }

  const start = new Date(startValue);

  if (Number.isNaN(start.getTime())) {
    return;
  }

  const pad = (value: number) => String(value).padStart(2, "0");
  const updateRuntime = () => {
    const elapsed = Math.max(0, Date.now() - start.getTime());
    const years = Math.floor(elapsed / averageYearMs);
    const rest = elapsed - years * averageYearMs;
    const days = Math.floor(rest / 86_400_000);
    const hours = Math.floor((rest % 86_400_000) / 3_600_000);
    const minutes = Math.floor((rest % 3_600_000) / 60_000);
    const seconds = Math.floor((rest % 60_000) / 1_000);
    const segments: string[] = [];

    // 不足一年时不展示年份，避免出现「0 年」。
    if (years > 0) {
      segments.push(formatMessage(messages.timeline.years, years));
    }

    segments.push(
      formatMessage(messages.timeline.days, days),
      formatMessage(messages.timeline.hours, pad(hours)),
      formatMessage(messages.timeline.minutes, pad(minutes)),
      formatMessage(messages.timeline.seconds, pad(seconds)),
    );
    runtime.textContent = segments.join(" ");
  };

  updateRuntime();
  window.setInterval(updateRuntime, 1_000);
};

const setupHeaderClock = () => {
  const clock = document.querySelector<HTMLTimeElement>("[data-header-clock]");

  if (!clock) {
    return;
  }

  // 中英文的日期顺序与月份写法差异很大，交给 Intl 按页面语言格式化。
  const formatter = new Intl.DateTimeFormat(pageLocale(), {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const pad = (value: number) => String(value).padStart(2, "0");
  const updateClock = () => {
    const now = new Date();
    const dateTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;

    clock.dateTime = dateTime;
    clock.textContent = formatter.format(now);
  };

  const scheduleNextUpdate = () => {
    updateClock();
    const now = new Date();
    const delay = 60_000 - now.getSeconds() * 1_000 - now.getMilliseconds() + 20;

    window.setTimeout(scheduleNextUpdate, delay);
  };

  scheduleNextUpdate();
};

const normalizeMenuPath = (path: string | null | undefined) => {
  const value = (path || "").trim();

  if (!value) {
    return "/";
  }

  try {
    const url = new URL(value, window.location.origin);
    const pathname = url.pathname || "/";
    return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  } catch {
    const pathname = value.startsWith("/") ? value : `/${value}`;
    return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  }
};

const setupCustomMenuIcons = () => {
  const rules = new Map<string, string>();

  document
    .querySelectorAll<HTMLElement>("[data-menu-icon-rules] [data-menu-path][data-menu-icon]")
    .forEach((rule) => {
      const icon = rule.dataset.menuIcon?.trim();

      if (!icon) {
        return;
      }

      rules.set(normalizeMenuPath(rule.dataset.menuPath), icon);
    });

  if (!rules.size) {
    return;
  }

  document
    .querySelectorAll<HTMLAnchorElement>(".profile-tabs a[data-menu-href]")
    .forEach((item) => {
      const icon = rules.get(normalizeMenuPath(item.dataset.menuHref || item.getAttribute("href")));
      const iconElement = item.querySelector("iconify-icon");

      if (icon && iconElement) {
        iconElement.setAttribute("icon", icon);
      }
    });
};

const setupActiveMenuItem = () => {
  const currentPath = normalizeMenuPath(window.location.pathname);

  document
    .querySelectorAll<HTMLAnchorElement>(".profile-tabs a[data-menu-href]")
    .forEach((item) => {
      const menuPath = normalizeMenuPath(item.dataset.menuHref || item.getAttribute("href"));
      const isCurrent =
        menuPath === "/"
          ? currentPath === "/"
          : currentPath === menuPath || currentPath.startsWith(`${menuPath}/`);

      if (isCurrent) {
        item.classList.add("is-active");
      }
    });
};

const setupLinkLogoFallbacks = () => {
  document.querySelectorAll<HTMLImageElement>("img[data-link-logo]").forEach((image) => {
    const fallback = image.dataset.linkFallback?.trim();
    let fallbackAttempted = !fallback || image.getAttribute("src") === fallback;

    const showFallback = () => {
      if (!fallbackAttempted && fallback) {
        fallbackAttempted = true;
        image.src = fallback;
        return;
      }

      image.classList.add("is-invalid");
    };

    image.addEventListener("error", showFallback);

    if (image.complete && image.naturalWidth === 0) {
      showFallback();
    }
  });
};

const commentEndpoint = "/apis/api.halo.run/v1alpha1/comments";
const singlePageEndpoint = "/apis/api.content.halo.run/v1alpha1/singlepages?page=1&size=1000";

type SinglePageSummary = {
  metadata?: { name?: string };
  spec?: { template?: string };
};

const escapeCommentHtml = (value: string) =>
  value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character];
  });

const normalizeHttpUrl = (value: string, label: string) => {
  if (!value) {
    return "";
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error();
    }
    return url.toString();
  } catch {
    throw new Error(formatMessage(messages.links.invalidUrl, label));
  }
};

const formatFriendLinkApplication = (payload: {
  siteName: string;
  url: string;
  logo: string;
  email: string;
  description: string;
  backlinkUrl: string;
  rssUrl: string;
}) => {
  const row = (label: string, value: string) =>
    value
      ? `<p><strong>${label}${messages.links.rowSeparator}</strong>${escapeCommentHtml(value)}</p>`
      : "";
  const safeUrl = escapeCommentHtml(payload.url);

  return [
    `<p><strong>[${messages.links.linkApplication}]</strong></p>`,
    row(messages.links.rowSiteName, payload.siteName),
    `<p><strong>${messages.links.rowSiteUrl}${messages.links.rowSeparator}</strong>${safeUrl}</p>`,
    row(messages.links.rowSiteLogo, payload.logo),
    row(messages.links.rowSiteDescription, payload.description),
    row(messages.links.rowContactEmail, payload.email),
    row(messages.links.rowBacklinkUrl, payload.backlinkUrl),
    row(messages.links.rowRssUrl, payload.rssUrl),
  ]
    .filter(Boolean)
    .join("");
};

const findMessageBoardName = async () => {
  const response = await fetch(singlePageEndpoint, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(messages.links.boardFetchFailed);
  }

  const result = (await response.json()) as { items?: SinglePageSummary[] };
  const messageBoard = result.items?.find((page) => page.spec?.template === "message.html");
  if (!messageBoard?.metadata?.name) {
    throw new Error(messages.links.boardMissing);
  }
  return messageBoard.metadata.name;
};

const setupFriendLinkApplication = () => {
  const root = document.querySelector<HTMLElement>("[data-friend-link-application]");
  const trigger = root?.querySelector<HTMLButtonElement>("[data-friend-link-open]");
  const form = root?.querySelector<HTMLFormElement>("[data-friend-link-form]");
  const submit = root?.querySelector<HTMLButtonElement>("[data-friend-link-submit]");
  const status = root?.querySelector<HTMLElement>("[data-friend-link-status]");

  if (!root || !trigger || !form || !submit || !status) {
    return;
  }

  trigger.addEventListener("click", () => {
    form.hidden = false;
    trigger.hidden = true;
    form.querySelector<HTMLInputElement>('input[name="siteName"]')?.focus();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const values = new FormData(form);
    const valueOf = (name: string) => {
      const value = values.get(name);
      return typeof value === "string" ? value.trim() : "";
    };
    const payload = {
      siteName: valueOf("siteName"),
      url: valueOf("url"),
      logo: valueOf("logo"),
      email: valueOf("email"),
      description: valueOf("description"),
      backlinkUrl: valueOf("backlinkUrl"),
      rssUrl: valueOf("rssUrl"),
    };

    submit.disabled = true;
    status.classList.remove("is-error");
    status.classList.remove("is-success");
    status.textContent = messages.links.submitting;

    void Promise.resolve()
      .then(() => {
        payload.url = normalizeHttpUrl(payload.url, messages.links.rowSiteUrl);
        payload.logo = normalizeHttpUrl(payload.logo, messages.links.rowSiteLogo);
        payload.backlinkUrl = normalizeHttpUrl(payload.backlinkUrl, messages.links.rowBacklinkUrl);
        payload.rssUrl = normalizeHttpUrl(payload.rssUrl, messages.links.rowRssUrl);
        return findMessageBoardName();
      })
      .then((messageBoardName) => {
        const content = formatFriendLinkApplication(payload);
        return fetch(commentEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            raw: content,
            content,
            allowNotification: false,
            subjectRef: {
              group: "content.halo.run",
              kind: "SinglePage",
              name: messageBoardName,
              version: "",
            },
            owner: {
              displayName: payload.siteName,
              email: payload.email,
              website: payload.url,
            },
          }),
        });
      })
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json().catch(() => undefined)) as
            | { detail?: string; message?: string }
            | undefined;
          throw new Error(body?.message || body?.detail || messages.links.failed);
        }

        form.reset();
        status.classList.add("is-success");
        status.textContent = messages.links.submittedToBoard;
      })
      .catch((error: unknown) => {
        status.classList.add("is-error");
        status.textContent = error instanceof Error ? error.message : messages.links.failed;
      })
      .finally(() => {
        submit.disabled = false;
      });
  });
};

const formatEngagementCount = (count: number) => (count > 99 ? "99+" : String(Math.max(0, count)));

const setupRepositoryEngagement = () => {
  document
    .querySelectorAll<HTMLElement>("[data-engagement-kind][data-engagement-count]")
    .forEach((metric) => {
      const count = Number.parseInt(metric.dataset.engagementCount || "0", 10);
      const normalizedCount = Number.isNaN(count) ? 0 : count;
      const value = metric.querySelector<HTMLElement>(".repository-engagement-value");

      if (value) {
        value.textContent = formatEngagementCount(normalizedCount);
      }
    });
};

type MusicTrack = {
  artist: string;
  cover: string;
  lyric: string;
  title: string;
  url: string;
};

type MusicPlaybackMode = "sequence" | "shuffle";

type MusicLyricLine = {
  text: string;
  time: number;
};

type MusicPlayerState = {
  api: string;
  index: number;
  mode: MusicPlaybackMode;
  playlistId: string;
  time: number;
  track: Pick<MusicTrack, "artist" | "title">;
  wasPlaying: boolean;
  // 用户是否在前台主动开启过播放，用于区分「后台自动播放」与「用户手动播放」。
  userInitiated: boolean;
};

const musicFallbackApi = "https://api.i-meto.com/meting/api?server=netease&type=playlist&id={id}";
const musicPlayerStorageKey = "theme-github-next-music-player";

const getRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const getText = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number") {
      return String(value);
    }
  }

  return "";
};

const getLyricsFromPayload = (payload: unknown) => {
  if (typeof payload === "string") {
    return payload.trim();
  }

  const data = getRecord(payload);
  const lrc = getRecord(data?.lrc);
  const lyric = getRecord(data?.lyric);

  return getText(
    data?.lrc,
    data?.lyric,
    data?.lyrics,
    lrc?.lyric,
    lrc?.lrc,
    lyric?.lyric,
    lyric?.lrc,
  );
};

const parseTimedLyrics = (source: string): MusicLyricLine[] => {
  const timestamp = /\[(\d{1,2}):(\d{2}(?:\.\d{1,3})?)\]/g;
  const lines: MusicLyricLine[] = [];

  for (const sourceLine of source.split(/\r?\n/)) {
    const matches = [...sourceLine.matchAll(timestamp)];
    const text = sourceLine.replace(timestamp, "").trim();

    if (!text || !matches.length) {
      continue;
    }

    for (const match of matches) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);

      if (Number.isFinite(minutes) && Number.isFinite(seconds)) {
        lines.push({ text, time: minutes * 60 + seconds });
      }
    }
  }

  return lines.sort((left, right) => left.time - right.time);
};

const getMusicPlayerState = (): MusicPlayerState | undefined => {
  try {
    const value = getRecord(JSON.parse(sessionStorage.getItem(musicPlayerStorageKey) || ""));
    const track = getRecord(value?.track);
    const index = Number(value?.index);
    const time = Number(value?.time);

    if (
      !value ||
      !track ||
      !Number.isInteger(index) ||
      !Number.isFinite(time) ||
      typeof value.api !== "string" ||
      typeof value.playlistId !== "string" ||
      typeof value.wasPlaying !== "boolean" ||
      typeof track.artist !== "string" ||
      typeof track.title !== "string"
    ) {
      return undefined;
    }

    return {
      api: value.api,
      index,
      mode: value.mode === "shuffle" ? "shuffle" : "sequence",
      playlistId: value.playlistId,
      time: Math.max(0, time),
      track: {
        artist: track.artist,
        title: track.title,
      },
      wasPlaying: value.wasPlaying,
      // 旧版本没有记录用户意图，此时按「离开页面时正在播放」处理，避免升级后丢失续播。
      userInitiated:
        typeof value.userInitiated === "boolean" ? value.userInitiated : value.wasPlaying,
    };
  } catch {
    return undefined;
  }
};

const getArtistName = (value: unknown) => {
  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => getText(getRecord(item)?.name, getRecord(item)?.title, item))
      .filter(Boolean)
      .join(" / ");
  }

  const artist = getRecord(value);
  return getText(artist?.name, artist?.title);
};

const getMusicItems = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  const data = getRecord(payload);
  if (!data) {
    return [];
  }

  for (const key of ["data", "list", "songs", "tracks", "playlist", "result"]) {
    const candidate = data[key];

    if (Array.isArray(candidate)) {
      return candidate;
    }

    const nested = getRecord(candidate);
    if (nested) {
      const items = getMusicItems(nested);
      if (items.length) {
        return items;
      }
    }
  }

  return [];
};

const normalizeMusicTrack = (value: unknown): MusicTrack | undefined => {
  const track = getRecord(value);
  if (!track) {
    return undefined;
  }

  const album = getRecord(track.al);
  const nestedAlbum = getRecord(track.album);
  const url = getText(track.url, track.src, track.audio);

  if (!url) {
    return undefined;
  }

  return {
    title: getText(track.title, track.name, track.songname) || messages.music.untitled,
    artist:
      getArtistName(track.artist ?? track.author ?? track.ar ?? track.artists ?? track.singer) ||
      messages.music.unknownArtist,
    lyric: getText(track.lrc, track.lyric, track.lyrics),
    url,
    cover: getText(
      track.cover,
      track.coverUrl,
      track.image,
      track.pic,
      track.picUrl,
      album?.picUrl,
      nestedAlbum?.picUrl,
    ),
  };
};

const mobileViewportQuery = "(max-width: 768px)";
const musicPlayerPositionStorageKey = "theme-github-next-music-player-position";
const musicPlayerEdgeGap = 16;
const musicPlayerSnapThreshold = 56;

type MusicPlayerPosition = {
  left: number;
  top: number;
};

// 移动端隐藏播放器时不应该自动播放，避免出现「看不见却在放歌」的情况。
const isMusicHiddenOnMobile = (player: HTMLElement) => {
  if (player.dataset.musicHideMobile !== "true") {
    return false;
  }

  return window.matchMedia(mobileViewportQuery).matches;
};

// 后台的「自动播放」开关只决定「首次进入页面时是否自动播放」；
// 用户在前台手动播放过后，切换页面应当继续播放，不再受该开关限制。
const shouldResumeMusicPlayback = ({
  autoplayEnabled,
  hiddenOnMobile,
  state,
}: {
  autoplayEnabled: boolean;
  hiddenOnMobile: boolean;
  state?: MusicPlayerState;
}) => {
  if (hiddenOnMobile) {
    return false;
  }

  // 没有历史状态时，只能由后台的自动播放开关决定。
  if (!state) {
    return autoplayEnabled;
  }

  // 用户主动开启过播放：切换页面后继续播放。
  if (state.userInitiated) {
    return true;
  }

  // 其余情况沿用后台开关，且离开页面时本来就在播放才续播。
  return autoplayEnabled && state.wasPlaying;
};

const readMusicPlayerPosition = (key: string): MusicPlayerPosition | undefined => {
  try {
    const value = getRecord(
      JSON.parse(localStorage.getItem(`${musicPlayerPositionStorageKey}:${key}`) || ""),
    );
    const left = Number(value?.left);
    const top = Number(value?.top);

    if (!Number.isFinite(left) || !Number.isFinite(top)) {
      return undefined;
    }

    return { left, top };
  } catch {
    return undefined;
  }
};

const writeMusicPlayerPosition = (key: string, position: MusicPlayerPosition) => {
  try {
    localStorage.setItem(`${musicPlayerPositionStorageKey}:${key}`, JSON.stringify(position));
  } catch {
    // 浏览器禁用本地存储时，播放器位置仅在当前页面生效。
  }
};

// 悬浮播放器：按住封面或歌曲信息即可拖动，松手后自动吸附到最近的边缘。
const setupMusicPlayerDrag = (player: HTMLElement, storageKey: string) => {
  if (player.classList.contains("music-player--header")) {
    return;
  }

  const handles = Array.from(
    player.querySelectorAll<HTMLElement>(".music-player-cover, .music-player-info"),
  );

  if (!handles.length) {
    return;
  }

  const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), Math.max(min, max));

  let positioned = false;
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;
  let currentLeft = 0;
  let currentTop = 0;

  const applyPosition = (left: number, top: number) => {
    const rect = player.getBoundingClientRect();
    const maxLeft = Math.max(0, window.innerWidth - rect.width);
    const maxTop = Math.max(0, window.innerHeight - rect.height);

    currentLeft = clamp(left, 0, maxLeft);
    currentTop = clamp(top, 0, maxTop);

    player.style.bottom = "auto";
    player.style.left = `${currentLeft}px`;
    player.style.top = `${currentTop}px`;
    positioned = true;
  };

  const saved = readMusicPlayerPosition(storageKey);

  if (saved) {
    applyPosition(saved.left, saved.top);
  }

  handles.forEach((handle) => {
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }

      const target = event.target as HTMLElement | null;

      if (target?.closest("button, a, input")) {
        return;
      }

      const rect = player.getBoundingClientRect();

      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      startLeft = rect.left;
      startTop = rect.top;

      player.classList.add("is-dragging");
      player.style.bottom = "auto";
      player.style.left = `${rect.left}px`;
      player.style.top = `${rect.top}px`;
      positioned = true;

      handle.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    handle.addEventListener("pointermove", (event) => {
      if (!dragging) {
        return;
      }

      applyPosition(startLeft + (event.clientX - startX), startTop + (event.clientY - startY));
      event.preventDefault();
    });

    const finishDrag = (event: PointerEvent) => {
      if (!dragging) {
        return;
      }

      dragging = false;
      player.classList.remove("is-dragging");

      const rect = player.getBoundingClientRect();
      const gap = musicPlayerEdgeGap;
      // 横向吸附到更近的一侧，纵向贴近上下边缘时同样吸附。
      const left =
        currentLeft + rect.width / 2 < window.innerWidth / 2
          ? gap
          : Math.max(gap, window.innerWidth - rect.width - gap);

      let top = currentTop;

      if (top < musicPlayerSnapThreshold) {
        top = gap;
      } else if (top + rect.height > window.innerHeight - musicPlayerSnapThreshold) {
        top = window.innerHeight - rect.height - gap;
      }

      applyPosition(left, top);
      writeMusicPlayerPosition(storageKey, { left: currentLeft, top: currentTop });

      if (handle.hasPointerCapture(event.pointerId)) {
        handle.releasePointerCapture(event.pointerId);
      }
    };

    handle.addEventListener("pointerup", finishDrag);
    handle.addEventListener("pointercancel", finishDrag);
  });

  window.addEventListener("resize", () => {
    if (!positioned || dragging) {
      return;
    }

    // 使用记录下来的落点位置，避免读取动画中的位置覆盖吸附结果。
    applyPosition(currentLeft, currentTop);
  });
};

const setupMusicPlayer = () => {
  const player = document.querySelector<HTMLElement>("[data-music-player]");
  const audio = player?.querySelector<HTMLAudioElement>("[data-music-audio]");
  const title = player?.querySelector<HTMLElement>("[data-music-title]");
  const artist = player?.querySelector<HTMLElement>("[data-music-artist]");
  const lyrics = player?.querySelector<HTMLElement>("[data-music-lyrics]");
  const cover = player?.querySelector<HTMLImageElement>("[data-music-cover]");
  const coverPlaceholder = player?.querySelector<HTMLElement>("[data-music-cover-placeholder]");
  const progress = player?.querySelector<HTMLInputElement>("[data-music-progress]");
  const previous = player?.querySelector<HTMLButtonElement>("[data-music-previous]");
  const toggle = player?.querySelector<HTMLButtonElement>("[data-music-toggle]");
  const next = player?.querySelector<HTMLButtonElement>("[data-music-next]");
  const playbackMode = player?.querySelector<HTMLButtonElement>("[data-music-playback-mode]");
  const playlistToggle = player?.querySelector<HTMLButtonElement>("[data-music-playlist-toggle]");
  const playlistPanel = player?.querySelector<HTMLElement>("[data-music-playlist]");
  const toggleIcon = toggle?.querySelector<HTMLElement>("iconify-icon");
  const playbackModeIcon = playbackMode?.querySelector<HTMLElement>("iconify-icon");
  const playlistId = player?.dataset.musicPlaylistId?.trim();

  if (
    !player ||
    !audio ||
    !title ||
    !artist ||
    !lyrics ||
    !cover ||
    !coverPlaceholder ||
    !progress ||
    !previous ||
    !toggle ||
    !next ||
    !playbackMode ||
    !playlistId
  ) {
    return;
  }

  const configuredApi = player.dataset.musicApi?.trim();
  const sourceApi =
    configuredApi || (player.dataset.musicSource === "netease" ? musicFallbackApi : "");
  const defaultPlaybackMode: MusicPlaybackMode =
    player.dataset.musicPlaybackMode === "shuffle" ? "shuffle" : "sequence";
  const hiddenOnMobile = isMusicHiddenOnMobile(player);
  const autoplayEnabled = player.dataset.musicAutoplay === "true" && !hiddenOnMobile;
  let tracks: MusicTrack[] = [];
  let index = 0;
  let playbackModeValue: MusicPlaybackMode = "sequence";
  let playbackHistory: number[] = [];
  let resumeOnInteraction = false;
  let interactionListenerBound = false;
  let lyricLines: MusicLyricLine[] = [];
  let lyricRequestId = 0;
  let displayedLyric = "";
  let playlistItems: HTMLButtonElement[] = [];
  let userInitiated = false;

  const setControlsEnabled = (enabled: boolean) => {
    previous.disabled = !enabled;
    toggle.disabled = !enabled;
    next.disabled = !enabled;
    playbackMode.disabled = !enabled;
    progress.disabled = !enabled;

    if (playlistToggle) {
      playlistToggle.disabled = !enabled;
    }
  };

  if (!sourceApi) {
    title.textContent = messages.music.apiRequired;
    artist.textContent = messages.music.customApiHint;
    setControlsEnabled(false);
    return;
  }

  setupMusicPlayerDrag(player, playlistId);

  const api = sourceApi.includes("{id}")
    ? sourceApi.replaceAll("{id}", encodeURIComponent(playlistId))
    : sourceApi;
  const savedState = getMusicPlayerState();
  const canRestore =
    savedState?.api === api && savedState.playlistId === playlistId ? savedState : undefined;
  playbackModeValue = canRestore?.mode || defaultPlaybackMode;
  // 继承上一页的用户意图：用户手动播放过时，切换页面后继续播放。
  userInitiated = canRestore?.userInitiated ?? false;
  let lastPersistedTime = -1;

  const persistState = () => {
    const track = tracks[index];

    if (!track) {
      return;
    }

    try {
      const state: MusicPlayerState = {
        api,
        index,
        mode: playbackModeValue,
        playlistId,
        time: Number.isFinite(audio.currentTime) ? Math.max(0, audio.currentTime) : 0,
        track: {
          artist: track.artist,
          title: track.title,
        },
        wasPlaying: !audio.paused,
        userInitiated,
      };
      sessionStorage.setItem(musicPlayerStorageKey, JSON.stringify(state));
      lastPersistedTime = state.time;
    } catch {
      // The player remains usable when browser storage is unavailable.
    }
  };

  const updatePlayState = () => {
    const isPlaying = !audio.paused;
    toggle.setAttribute("aria-label", isPlaying ? messages.music.pause : messages.music.play);
    toggle.title = isPlaying ? messages.music.pause : messages.music.play;
    toggleIcon?.setAttribute("icon", isPlaying ? "octicon:pause-16" : "octicon:play-16");
  };

  const updatePlaybackMode = () => {
    const isShuffle = playbackModeValue === "shuffle";
    playbackMode.setAttribute(
      "aria-label",
      isShuffle ? messages.music.shuffle : messages.music.playbackMode,
    );
    playbackMode.setAttribute("aria-pressed", String(isShuffle));
    playbackMode.title = isShuffle ? messages.music.shuffle : messages.music.playbackMode;
    playbackModeIcon?.setAttribute("icon", isShuffle ? "lucide:shuffle" : "lucide:list-ordered");
  };

  const updatePlaylistCurrent = () => {
    playlistItems.forEach((item, itemIndex) => {
      item.classList.toggle("is-current", itemIndex === index);
    });
  };

  const buildPlaylist = () => {
    if (!playlistPanel) {
      return;
    }

    playlistPanel.replaceChildren();
    playlistItems = [];

    if (!tracks.length) {
      const empty = document.createElement("p");
      empty.className = "music-player-playlist-empty";
      empty.textContent = messages.music.emptyPlaylist;
      playlistPanel.append(empty);
      return;
    }

    const items = tracks.map((track, trackIndex) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "music-player-playlist-item";

      const title = document.createElement("span");
      title.className = "music-player-playlist-title";
      title.textContent = track.title;

      const artist = document.createElement("span");
      artist.className = "music-player-playlist-artist";
      artist.textContent = track.artist;

      item.append(title, artist);
      item.addEventListener("click", () => {
        userInitiated = true;
        loadTrack(trackIndex);
        closePlaylist();
      });

      playlistItems.push(item);
      return item;
    });

    playlistPanel.append(...items);
    updatePlaylistCurrent();
  };

  const closePlaylist = () => {
    if (!playlistPanel || !playlistToggle) {
      return;
    }

    playlistPanel.hidden = true;
    playlistToggle.setAttribute("aria-expanded", "false");
  };

  const togglePlaylist = () => {
    if (!playlistPanel || !playlistToggle) {
      return;
    }

    const willOpen = playlistPanel.hidden;
    playlistPanel.hidden = !willOpen;
    playlistToggle.setAttribute("aria-expanded", String(willOpen));
  };

  const setLyrics = (value: string) => {
    if (value !== displayedLyric) {
      lyrics.textContent = value;
      displayedLyric = value;
    }
  };

  const updateLyrics = () => {
    const fallback = tracks[index]?.title || messages.music.lyricsFallback;
    const currentTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    let currentLine: MusicLyricLine | undefined;

    for (const line of lyricLines) {
      if (line.time > currentTime) {
        break;
      }

      currentLine = line;
    }

    setLyrics(currentLine?.text || fallback);
  };

  const loadLyrics = async (track: MusicTrack) => {
    const requestId = ++lyricRequestId;
    lyricLines = [];
    displayedLyric = "";
    setLyrics(track.lyric ? messages.music.lyricsFallback : track.title);

    try {
      const source = track.lyric;
      const lyricSource = /^https?:\/\//i.test(source)
        ? await fetch(source, { headers: { Accept: "application/json, text/plain" } }).then(
            async (response) => {
              if (!response.ok) {
                throw new Error(`Lyrics API failed: ${response.status}`);
              }

              const contentType = response.headers.get("content-type") || "";
              return contentType.includes("application/json")
                ? getLyricsFromPayload(await response.json())
                : await response.text();
            },
          )
        : source;

      if (requestId !== lyricRequestId) {
        return;
      }

      lyricLines = parseTimedLyrics(lyricSource);
      updateLyrics();
    } catch {
      if (requestId === lyricRequestId) {
        setLyrics(track.title);
      }
    }
  };

  const play = async () => {
    try {
      await audio.play();
      resumeOnInteraction = false;
      // 播放成功后恢复歌曲信息，覆盖此前「点击页面后继续」的提示。
      artist.textContent = tracks[index]?.artist || "";
      updatePlayState();
    } catch {
      resumeOnInteraction = true;
      artist.textContent = messages.music.autoplayBlocked;
      updatePlayState();

      if (!interactionListenerBound) {
        interactionListenerBound = true;
        document.addEventListener(
          "pointerdown",
          () => {
            interactionListenerBound = false;
            if (resumeOnInteraction && audio.paused) {
              void play();
            }
          },
          { once: true },
        );
      }
    }
  };

  const loadTrack = (nextIndex: number, shouldPlay = true, resumeAt = 0) => {
    if (!tracks.length) {
      return;
    }

    index = (nextIndex + tracks.length) % tracks.length;
    const track = tracks[index];
    title.textContent = track.title;
    artist.textContent = track.artist;
    void loadLyrics(track);
    progress.value = "0";
    updatePlaylistCurrent();

    if (track.cover) {
      cover.src = track.cover;
      cover.hidden = false;
      coverPlaceholder.hidden = true;
    } else {
      cover.removeAttribute("src");
      cover.hidden = true;
      coverPlaceholder.hidden = false;
    }

    if (resumeAt > 0) {
      audio.addEventListener(
        "loadedmetadata",
        () => {
          if (Number.isFinite(audio.duration)) {
            audio.currentTime = Math.min(resumeAt, Math.max(0, audio.duration - 0.25));
            updateLyrics();
          }
        },
        { once: true },
      );
    }

    audio.src = track.url;
    audio.load();
    lastPersistedTime = -1;
    persistState();

    if (shouldPlay) {
      void play();
    }
  };

  const goToPrevious = () => {
    if (playbackModeValue === "shuffle" && playbackHistory.length) {
      const previousIndex = playbackHistory.pop();

      if (previousIndex !== undefined) {
        loadTrack(previousIndex);
        return;
      }
    }

    loadTrack(index - 1);
  };

  const goToNext = () => {
    if (playbackModeValue !== "shuffle" || tracks.length < 2) {
      loadTrack(index + 1);
      return;
    }

    let nextIndex = index;
    while (nextIndex === index) {
      nextIndex = Math.floor(Math.random() * tracks.length);
    }

    playbackHistory.push(index);
    loadTrack(nextIndex);
  };

  previous.addEventListener("click", () => {
    userInitiated = true;
    goToPrevious();
  });
  next.addEventListener("click", () => {
    userInitiated = true;
    goToNext();
  });
  playbackMode.addEventListener("click", () => {
    playbackModeValue = playbackModeValue === "sequence" ? "shuffle" : "sequence";
    playbackHistory = [];
    updatePlaybackMode();
    persistState();
  });
  playlistToggle?.addEventListener("click", togglePlaylist);
  document.addEventListener("click", (event) => {
    if (!playlistPanel || playlistPanel.hidden || !player) {
      return;
    }

    const target = event.target;

    if (target instanceof Node && player.contains(target)) {
      return;
    }

    closePlaylist();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closePlaylist();
    }
  });
  toggle.addEventListener("click", () => {
    if (audio.paused) {
      // 用户主动播放：切换页面后应继续播放，不受后台自动播放开关影响。
      userInitiated = true;
      void play();
    } else {
      // 用户主动暂停：切换页面后不再自动续播。
      userInitiated = false;
      audio.pause();
    }
  });
  progress.addEventListener("input", () => {
    if (Number.isFinite(audio.duration)) {
      audio.currentTime = (Number(progress.value) / 100) * audio.duration;
      updateLyrics();
      persistState();
    }
  });
  audio.addEventListener("play", () => {
    updatePlayState();
    persistState();
  });
  audio.addEventListener("pause", () => {
    updatePlayState();
    persistState();
  });
  audio.addEventListener("ended", goToNext);
  audio.addEventListener("timeupdate", () => {
    updateLyrics();

    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      progress.value = String((audio.currentTime / audio.duration) * 100);

      if (audio.currentTime - lastPersistedTime >= 1) {
        lastPersistedTime = audio.currentTime;
        persistState();
      }
    }
  });
  audio.addEventListener("error", () => {
    artist.textContent = messages.music.playbackFailed;
    if (tracks.length > 1) {
      window.setTimeout(goToNext, 500);
    }
  });
  window.addEventListener("pagehide", persistState);
  void fetch(api, { headers: { Accept: "application/json" } })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Music API failed: ${response.status}`);
      }

      return response.json() as Promise<unknown>;
    })
    .then((payload) => {
      tracks = getMusicItems(payload)
        .map(normalizeMusicTrack)
        .filter((track): track is MusicTrack => Boolean(track));

      if (!tracks.length) {
        throw new Error("Music API returned no playable tracks");
      }

      setControlsEnabled(true);
      updatePlaybackMode();
      buildPlaylist();
      const matchingTrackIndex = canRestore
        ? tracks.findIndex(
            (track) =>
              track.title === canRestore.track.title && track.artist === canRestore.track.artist,
          )
        : -1;
      const restoredIndex =
        matchingTrackIndex >= 0
          ? matchingTrackIndex
          : Math.min(Math.max(canRestore?.index || 0, 0), tracks.length - 1);
      const shouldPlay = shouldResumeMusicPlayback({
        autoplayEnabled,
        hiddenOnMobile,
        state: canRestore,
      });
      loadTrack(restoredIndex, shouldPlay, canRestore?.time || 0);
    })
    .catch(() => {
      title.textContent = messages.music.unavailableTitle;
      artist.textContent = messages.music.unavailableHint;
      setControlsEnabled(false);
    });
};

const setupMomentImagePreview = () => {
  const images = document.querySelectorAll<HTMLImageElement>("img[data-moment-image]");

  if (!images.length) {
    return;
  }

  let preview: HTMLElement | undefined;

  const closePreview = () => {
    preview?.remove();
    preview = undefined;
    document.documentElement.classList.remove("image-preview-open");
  };

  images.forEach((image) => {
    image.addEventListener("click", () => {
      const source = image.currentSrc || image.src;

      if (!source) {
        return;
      }

      closePreview();
      preview = document.createElement("div");
      preview.className = "image-preview";
      preview.setAttribute("role", "dialog");
      preview.setAttribute("aria-modal", "true");
      preview.setAttribute("aria-label", messages.preview.label);

      const previewImage = document.createElement("img");
      previewImage.src = source;
      previewImage.alt = image.alt;

      const closeButton = document.createElement("button");
      closeButton.className = "image-preview-close";
      closeButton.type = "button";
      closeButton.title = messages.preview.close;
      closeButton.setAttribute("aria-label", messages.preview.close);
      const closeIcon = document.createElement("iconify-icon");
      closeIcon.setAttribute("icon", "material-symbols:close");
      closeButton.append(closeIcon);
      closeButton.addEventListener("click", closePreview);

      preview.append(previewImage, closeButton);
      preview.addEventListener("click", (event) => {
        if (event.target === preview) {
          closePreview();
        }
      });
      document.body.append(preview);
      document.documentElement.classList.add("image-preview-open");
      closeButton.focus();
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && preview) {
      closePreview();
    }
  });
};

type LightboxEntry = {
  alt: string;
  element?: HTMLElement;
  href: string;
  src: string;
  title: string;
};

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
    index = (start + entries.length) % entries.length;
    render();
    overlay.hidden = false;
    document.documentElement.classList.add("photo-lightbox-open");
    closeButton.focus();
  };

  const close = () => {
    overlay.hidden = true;
    document.documentElement.classList.remove("photo-lightbox-open");
    entries[index]?.element?.focus();
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

const setupPhotoLightbox = () => {
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

const setupArticleImageLightbox = () => {
  const images = Array.from(
    document.querySelectorAll<HTMLImageElement>(".article-content img"),
  ).filter((image) => !image.closest("a") && !image.closest(".image-preview"));

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

const setupMomentUpvotes = () => {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-moment-upvote]"));

  if (!buttons.length) {
    return;
  }

  buttons.forEach((button) => {
    const name = button.dataset.momentUpvote;

    if (!name) {
      return;
    }

    button.addEventListener("click", async () => {
      if (button.disabled) {
        return;
      }

      button.disabled = true;

      try {
        const response = await fetch(momentUpvoteEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            group: "moment.halo.run",
            plural: "moments",
            name,
          }),
        });

        if (!response.ok) {
          throw new Error(`Moment upvote failed: ${response.status}`);
        }

        buttons
          .filter((item) => item.dataset.momentUpvote === name)
          .forEach((item) => {
            const count = item.querySelector<HTMLElement>("[data-moment-upvote-count]");
            const current = Number.parseInt(count?.textContent || "0", 10);

            if (count) {
              count.textContent = String(Number.isNaN(current) ? 1 : current + 1);
            }

            item.classList.add("is-upvoted");
          });
      } catch {
        showInlineHint(button, messages.toast.likeFailed);
      } finally {
        button.disabled = false;
      }
    });
  });
};

const setupPostUpvotes = () => {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-post-upvote]"));

  if (!buttons.length) {
    return;
  }

  buttons.forEach((button) => {
    const name = button.dataset.postUpvote;

    if (!name) {
      return;
    }

    button.addEventListener("click", async () => {
      if (button.disabled) {
        return;
      }

      button.disabled = true;

      try {
        const response = await fetch(momentUpvoteEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            group: "content.halo.run",
            plural: "posts",
            name,
          }),
        });

        if (!response.ok) {
          throw new Error(`Post upvote failed: ${response.status}`);
        }

        buttons
          .filter((item) => item.dataset.postUpvote === name)
          .forEach((item) => {
            const count = item.querySelector<HTMLElement>("[data-post-upvote-count]");
            const current = Number.parseInt(count?.textContent || "0", 10);

            if (count) {
              count.textContent = String(Number.isNaN(current) ? 1 : current + 1);
            }

            item.classList.add("is-upvoted");
          });

        document
          .querySelectorAll<HTMLElement>(
            `.repository-engagement[data-repository-post-name="${CSS.escape(name)}"]`,
          )
          .forEach((summary) => {
            const metric = summary.querySelector<HTMLElement>('[data-engagement-kind="upvote"]');
            const count = Number.parseInt(metric?.dataset.engagementCount || "0", 10);

            if (metric) {
              const upvotes = Number.isNaN(count) ? 1 : count + 1;
              metric.dataset.engagementCount = String(upvotes);
              const value = metric.querySelector<HTMLElement>(".repository-engagement-value");
              if (value) {
                value.textContent = formatEngagementCount(upvotes);
              }
            }
          });
        setupRepositoryEngagement();
      } catch {
        showInlineHint(button, messages.toast.likeFailed);
      } finally {
        button.disabled = false;
      }
    });
  });
};

const setupNotificationIndicator = () => {
  const link = document.querySelector<HTMLAnchorElement>("[data-notification-link]");
  const dot = link?.querySelector<HTMLElement>("[data-notification-dot]");

  if (!link || !dot) {
    return;
  }

  let username: string | undefined;
  let checking = false;

  const setUnreadState = (hasUnread: boolean) => {
    dot.hidden = !hasUnread;

    if (hasUnread) {
      link.title = messages.notification.unread;
    } else {
      link.removeAttribute("title");
    }
  };

  const getCurrentUsername = async () => {
    if (username) {
      return username;
    }

    const currentUser = await getCurrentUser();
    const name = currentUser?.user?.metadata?.name;

    if (!name || name === "anonymousUser") {
      return undefined;
    }

    username = name;
    return username;
  };

  const checkUnreadNotifications = async () => {
    if (checking) {
      return;
    }

    checking = true;

    try {
      const currentUsername = await getCurrentUsername();
      if (!currentUsername) {
        setUnreadState(false);
        return;
      }

      const endpoint =
        `/apis/api.notification.halo.run/v1alpha1/userspaces/${encodeURIComponent(currentUsername)}` +
        "/notifications?page=1&size=1&fieldSelector=spec.unread%3Dtrue";
      const response = await fetch(endpoint);

      if (!response.ok) {
        setUnreadState(false);
        return;
      }

      const notifications = (await response.json()) as NotificationList;
      setUnreadState((notifications.total ?? notifications.items?.length ?? 0) > 0);
    } catch {
      setUnreadState(false);
    } finally {
      checking = false;
    }
  };

  void checkUnreadNotifications();
  window.setInterval(() => void checkUnreadNotifications(), 30_000);
  window.addEventListener("focus", () => void checkUnreadNotifications());
};

const setupUserMenu = async () => {
  const container = document.querySelector<HTMLElement>("[data-user-menu]");
  const loginLink = container?.querySelector<HTMLAnchorElement>("[data-login-link]");
  const trigger = container?.querySelector<HTMLButtonElement>("[data-user-menu-trigger]");
  const menu = container?.querySelector<HTMLElement>("[data-user-menu-list]");
  const avatar = trigger?.querySelector<HTMLImageElement>("[data-user-avatar]");

  if (!container || !loginLink || !trigger || !menu || !avatar) {
    return;
  }

  loginLink.href = `/login?redirect_uri=${encodeURIComponent(window.location.href)}`;

  const currentUser = await getCurrentUser();
  const username = currentUser?.user?.metadata?.name;

  if (!username || username === "anonymousUser") {
    return;
  }

  const fallbackAvatar = avatar.currentSrc || avatar.src;
  avatar.removeAttribute("srcset");
  avatar.removeAttribute("sizes");
  avatar.src = currentUser.user?.spec?.avatar || fallbackAvatar;
  avatar.alt = currentUser.user?.spec?.displayName || username;
  avatar.addEventListener("error", () => {
    if (avatar.src !== fallbackAvatar) {
      avatar.src = fallbackAvatar;
    }
  });
  loginLink.hidden = true;
  trigger.hidden = false;

  let closeTimer = 0;

  const closeMenu = (restoreFocus = false) => {
    window.clearTimeout(closeTimer);
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");

    if (restoreFocus) {
      trigger.focus();
    }
  };

  const openMenu = (focusFirstItem = false) => {
    window.clearTimeout(closeTimer);
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");

    if (focusFirstItem) {
      menu.querySelector<HTMLAnchorElement>("a")?.focus();
    }
  };

  container.addEventListener("pointerenter", () => openMenu());
  container.addEventListener("pointerleave", () => {
    closeTimer = window.setTimeout(() => closeMenu(), 120);
  });
  trigger.addEventListener("click", () => {
    if (menu.hidden) {
      openMenu(true);
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

const setupPublishMenu = () => {
  const trigger = document.querySelector<HTMLButtonElement>("[data-publish-menu-trigger]");
  const menu = document.querySelector<HTMLElement>("[data-publish-menu]");
  const container = trigger?.closest<HTMLElement>(".publish-menu");

  if (!trigger || !menu || !container) {
    return;
  }

  let closeTimer = 0;

  const closeMenu = (restoreFocus = false) => {
    window.clearTimeout(closeTimer);
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");

    if (restoreFocus) {
      trigger.focus();
    }
  };

  const openMenu = (focusFirstItem = false) => {
    window.clearTimeout(closeTimer);
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");

    if (focusFirstItem) {
      menu.querySelector<HTMLAnchorElement>("a")?.focus();
    }
  };

  trigger.addEventListener("click", () => {
    if (menu.hidden) {
      openMenu(true);
    }
  });

  container.addEventListener("pointerenter", () => openMenu());
  container.addEventListener("pointerleave", () => {
    closeTimer = window.setTimeout(() => closeMenu(), 120);
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

const isTypingEvent = (event: KeyboardEvent) =>
  event
    .composedPath()
    .some(
      (target) =>
        target instanceof HTMLElement &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable),
    );

const createResultItem = (hit: SearchHit) => {
  const link = document.createElement("a");
  link.className = "search-result-item";
  link.href = hit.permalink || "#";

  const title = document.createElement("span");
  title.className = "search-result-title";
  title.textContent = hit.title || "Untitled";

  const description = document.createElement("span");
  description.className = "search-result-desc";
  description.textContent = hit.description || hit.content || "No description provided.";

  link.append(title, description);
  return link;
};

const setupSearch = () => {
  const triggers = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-search-trigger]"),
  );
  const overlay = document.querySelector<HTMLElement>("[data-search-overlay]");
  const form = document.querySelector<HTMLFormElement>("[data-search-form]");
  const input = document.querySelector<HTMLInputElement>("[data-search-input]");
  const closeButton = document.querySelector<HTMLButtonElement>("[data-search-close]");
  const status = document.querySelector<HTMLElement>("[data-search-status]");
  const results = document.querySelector<HTMLElement>("[data-search-results]");

  if (!triggers.length || !overlay || !form || !input || !closeButton || !status || !results) {
    return;
  }

  let debounceTimer = 0;
  let controller: AbortController | undefined;

  const openSearch = () => {
    overlay.hidden = false;
    document.documentElement.classList.add("search-open");
    input.focus();
  };

  const closeSearch = () => {
    overlay.hidden = true;
    document.documentElement.classList.remove("search-open");
    input.value = "";
    status.textContent = messages.search.status;
    results.replaceChildren();
    controller?.abort();
  };

  const renderResults = (data: SearchResult, keyword: string) => {
    results.replaceChildren();

    if (!data.hits?.length) {
      status.textContent = formatMessage(messages.search.noResultWithKeyword, keyword);
      return;
    }

    status.textContent = formatMessage(messages.search.resultCount, data.total ?? data.hits.length);
    results.append(...data.hits.map(createResultItem));
  };

  const search = async () => {
    const keyword = input.value.trim();
    controller?.abort();

    if (!keyword) {
      status.textContent = messages.search.status;
      results.replaceChildren();
      return;
    }

    controller = new AbortController();
    status.textContent = messages.search.searching;

    try {
      const response = await fetch(searchEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          keyword,
          limit: 8,
          filterExposed: true,
          filterPublished: true,
          filterRecycled: false,
          includeTypes: ["post.content.halo.run", "singlepage.content.halo.run"],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }

      renderResults((await response.json()) as SearchResult, keyword);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      status.textContent = messages.search.temporarilyUnavailable;
    }
  };

  triggers.forEach((trigger) => trigger.addEventListener("click", openSearch));
  closeButton.addEventListener("click", closeSearch);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeSearch();
    }
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void search();
  });
  input.addEventListener("input", () => {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => void search(), 220);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.hidden) {
      closeSearch();
    }

    if (
      event.key === "/" &&
      overlay.hidden &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !isTypingEvent(event)
    ) {
      event.preventDefault();
      openSearch();
    }
  });
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

const setupSidebarTags = () => {
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

  const endpoint = "/apis/api.content.halo.run/v1alpha1/tags";

  const loadTags = async () => {
    const tags: { name: string; permalink: string; postCount: number }[] = [];
    let page = 1;
    let totalPages = 1;

    try {
      do {
        const response = await fetch(`${endpoint}?page=${page}&size=100`);

        if (!response.ok) {
          throw new Error(`Unable to load tags: ${response.status}`);
        }

        const result = (await response.json()) as {
          items?: {
            postCount?: number;
            spec?: { displayName?: string };
            status?: { permalink?: string; postCount?: number };
          }[];
          totalPages?: number;
        };
        tags.push(
          ...(result.items || [])
            .map((tag) => ({
              name: tag.spec?.displayName?.trim() || "",
              permalink: tag.status?.permalink || "/tags",
              postCount: tag.status?.postCount ?? tag.postCount ?? 0,
            }))
            .filter((tag) => tag.name),
        );
        totalPages = Math.max(1, result.totalPages || 1);
        page += 1;
      } while (page <= totalPages);
    } catch {
      root.hidden = true;
      return;
    }

    if (!tags.length) {
      return;
    }

    const popularTags = tags
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
            [...links].sort(() => Math.random() - 0.5).forEach((link) => cloud.append(link));
            cloud.classList.remove("is-shuffling");
          }, 180);
        };
        window.setInterval(shuffle, 6000);
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
    let paused = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let rotation = 0;
    const render = () => {
      if (!paused) {
        rotation += 0.003;
      }

      tagPoints.forEach((tag, index) => {
        const sin = Math.sin(rotation);
        const cos = Math.cos(rotation);
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
      window.requestAnimationFrame(render);
    };

    root.addEventListener("pointerenter", () => {
      paused = true;
    });
    root.addEventListener("pointerleave", () => {
      paused = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    });
    render();
    empty.hidden = true;
  };

  loadSidebarSectionWhenVisible(() => void loadTags());
};

const setupSidebarCategories = () => {
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
  const loadCategories = async () => {
    try {
      const response = await fetch(
        "/apis/api.content.halo.run/v1alpha1/categories?page=1&size=100",
      );

      if (!response.ok) {
        throw new Error(`Unable to load categories: ${response.status}`);
      }

      const result = (await response.json()) as {
        items?: {
          postCount?: number;
          spec?: { displayName?: string; hideFromList?: boolean };
          status?: { permalink?: string; postCount?: number };
        }[];
      };
      const categories = (result.items || []).filter(
        (category) => category.spec?.displayName?.trim() && !category.spec?.hideFromList,
      );

      if (!categories.length) {
        return;
      }

      list.replaceChildren(
        ...categories
          .sort(
            (left, right) =>
              (right.status?.postCount ?? right.postCount ?? 0) -
                (left.status?.postCount ?? left.postCount ?? 0) ||
              (left.spec?.displayName || "").localeCompare(right.spec?.displayName || "", "zh-CN"),
          )
          .slice(0, categoryLimit)
          .map((category) => {
            const item = document.createElement("li");
            const link = document.createElement("a");
            const name = document.createElement("span");
            name.textContent = category.spec?.displayName?.trim() || messages.taxonomy.untitled;
            link.href = category.status?.permalink || "/categories";
            link.append(name);

            item.append(link);
            return item;
          }),
      );
      empty.hidden = true;
    } catch {
      root.hidden = true;
    }
  };

  loadSidebarSectionWhenVisible(() => void loadCategories());
};

const setupTaxonomyPage = () => {
  const list = document.querySelector<HTMLUListElement>("[data-taxonomy-page-list]");
  const empty = document.querySelector<HTMLElement>("[data-taxonomy-page-empty]");
  const kind = list?.dataset.taxonomyKind;

  if (!list || !empty || (kind !== "categories" && kind !== "tags")) {
    return;
  }

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

  const fetchAll = async <T>(endpoint: string) => {
    const items: T[] = [];
    let page = 1;
    let totalPages = 1;

    do {
      const response = await fetch(`${endpoint}?page=${page}&size=100`);

      if (!response.ok) {
        throw new Error(`Unable to load ${endpoint}: ${response.status}`);
      }

      const result = (await response.json()) as { items?: T[]; totalPages?: number };
      items.push(...(result.items || []));
      totalPages = Math.max(1, result.totalPages || 1);
      page += 1;
    } while (page <= totalPages);

    return items;
  };

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
      const taxonomies = await fetchAll<Taxonomy>(`/apis/api.content.halo.run/v1alpha1/${kind}`);
      const posts =
        kind === "categories"
          ? await fetchAll<Post>("/apis/api.content.halo.run/v1alpha1/posts").catch(() => [])
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

const setupLoveCounter = () => {
  const root = document.querySelector<HTMLElement>("[data-love-counter]");
  const elapsed = root?.querySelector<HTMLElement>("[data-love-elapsed]");
  const rawStart = root?.dataset.loveStart?.trim();

  if (!root || !elapsed || !rawStart) {
    return;
  }

  const parts = rawStart.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  const start = parts
    ? new Date(
        Number(parts[1]),
        Number(parts[2]) - 1,
        Number(parts[3]),
        Number(parts[4] || 0),
        Number(parts[5] || 0),
        Number(parts[6] || 0),
      )
    : new Date(rawStart);

  if (Number.isNaN(start.getTime())) {
    root.hidden = true;
    return;
  }

  const update = () => {
    const totalSeconds = Math.floor((Date.now() - start.getTime()) / 1000);

    if (totalSeconds < 0) {
      elapsed.textContent = messages.love.upcoming;
      return;
    }

    const days = Math.floor(totalSeconds / 86_400);
    const hours = Math.floor((totalSeconds % 86_400) / 3_600);
    const minutes = Math.floor((totalSeconds % 3_600) / 60);
    const seconds = totalSeconds % 60;
    elapsed.textContent = `${formatMessage(messages.timeline.days, days)} ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  update();
  window.setInterval(update, 1_000);
};

const setupGlobalBackToTop = () => {
  const button = document.querySelector<HTMLButtonElement>("[data-back-to-top]");

  if (!button) {
    return;
  }

  // 正文页自带侧边栏回顶按钮，避免重复渲染
  if (document.querySelector("[data-post-back-to-top]")) {
    button.remove();
    return;
  }

  setupBackToTop(button);
};

setupCustomMenuIcons();
setupThemeToggle();
setupSiteTimeline();
setupSiteRuntime();
setupHeaderClock();
setupActiveMenuItem();
setupLinkLogoFallbacks();
setupFriendLinkApplication();
setupRepositoryEngagement();
setupWeather();
setupMusicPlayer();
setupMomentImagePreview();
setupPhotoLightbox();
setupArticleImageLightbox();
setupMomentUpvotes();
setupPostUpvotes();
setupRepositoryFilters();
setupNotificationIndicator();
setupPublishMenu();
void setupUserMenu();
setupSearch();
setupSidebarTags();
setupSidebarCategories();
setupTaxonomyPage();
setupLoveCounter();
setupGlobalBackToTop();
setupCommentWidgetStyle();
