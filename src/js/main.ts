import "../css/main.css";
import "../css/about.css";
import "iconify-icon";

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
    return { icon: "solar:sun-2-linear", label: "晴" };
  }

  if ([1, 2].includes(code)) {
    return { icon: "solar:cloud-sun-2-linear", label: "少云" };
  }

  if (code === 3) {
    return { icon: "solar:cloud-linear", label: "阴" };
  }

  if ([45, 48].includes(code)) {
    return { icon: "solar:cloud-fog-linear", label: "雾" };
  }

  if ([51, 53, 55, 56, 57].includes(code)) {
    return { icon: "solar:cloud-sun-rain-linear", label: "毛毛雨" };
  }

  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
    return { icon: "solar:cloud-rain-linear", label: "雨" };
  }

  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return { icon: "solar:cloud-snowfall-linear", label: "雪" };
  }

  if ([95, 96, 99].includes(code)) {
    return { icon: "solar:cloud-bolt-linear", label: "雷雨" };
  }

  return { icon: "solar:cloud-linear", label: "多云" };
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
    label: widget.dataset.weatherLocation?.trim() || "天气",
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
          `${coordinates.label}，${weather.label}，${roundedTemperature} 摄氏度`,
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

  location.textContent = "定位中";
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        loadWeather(fallback, false);
        return;
      }

      loadWeather({ label: "当前位置", latitude, longitude }, true);
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

  let colorScheme = "light";

  try {
    colorScheme = localStorage.getItem(colorSchemeStorageKey) === "dark" ? "dark" : "light";
  } catch {
    colorScheme = "light";
  }

  const applyColorScheme = (scheme: string) => {
    const isDark = scheme === "dark";
    document.documentElement.dataset.colorScheme = isDark ? "dark" : "light";
    trigger.setAttribute("aria-pressed", String(isDark));
    trigger.setAttribute("aria-label", isDark ? "切换到日间模式" : "切换到黑夜模式");
    trigger.title = isDark ? "切换到日间模式" : "切换到黑夜模式";
    icon?.setAttribute("icon", isDark ? "solar:moon-line-duotone" : "solar:sun-linear");
  };

  applyColorScheme(colorScheme);

  trigger.addEventListener("click", () => {
    colorScheme = colorScheme === "dark" ? "light" : "dark";
    applyColorScheme(colorScheme);

    try {
      localStorage.setItem(colorSchemeStorageKey, colorScheme);
    } catch {
      // The selected mode still applies for the current page when storage is unavailable.
    }
  });
};

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
  const durationYears = duration / (365.2425 * 86_400_000);
  const progressValue = Math.min(100, Math.max(0, (elapsed / duration) * 100));

  progress.style.width = `${progressValue}%`;
  percent.textContent = `${progressValue.toFixed(2)}%`;
  age.textContent = `${elapsedDays} 天`;
  target.textContent = `目标：${Number.isInteger(durationYears) ? durationYears : durationYears.toFixed(1)} 年`;
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
    const totalSeconds = Math.max(0, Math.floor((Date.now() - start.getTime()) / 1_000));
    const days = Math.floor(totalSeconds / 86_400);
    const hours = Math.floor((totalSeconds % 86_400) / 3_600);
    const minutes = Math.floor((totalSeconds % 3_600) / 60);
    const seconds = totalSeconds % 60;

    runtime.textContent = `${days} 天 ${pad(hours)} 时 ${pad(minutes)} 分 ${pad(seconds)} 秒`;
  };

  updateRuntime();
  window.setInterval(updateRuntime, 1_000);
};

const setupHeaderClock = () => {
  const clock = document.querySelector<HTMLTimeElement>("[data-header-clock]");

  if (!clock) {
    return;
  }

  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  const pad = (value: number) => String(value).padStart(2, "0");
  const updateClock = () => {
    const now = new Date();
    const dateTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;

    clock.dateTime = dateTime;
    clock.textContent = `${now.getMonth() + 1}月${now.getDate()}日 周${weekdays[now.getDay()]} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
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
    throw new Error(`${label}必须是有效的 HTTP 或 HTTPS 地址。`);
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
    value ? `<p><strong>${label}：</strong>${escapeCommentHtml(value)}</p>` : "";
  const safeUrl = escapeCommentHtml(payload.url);

  return [
    "<p><strong>[友链申请]</strong></p>",
    row("网站名称", payload.siteName),
    `<p><strong>网站地址：</strong>${safeUrl}</p>`,
    row("网站头像", payload.logo),
    row("网站描述", payload.description),
    row("联系邮箱", payload.email),
    row("友链页面", payload.backlinkUrl),
    row("RSS 订阅地址", payload.rssUrl),
  ]
    .filter(Boolean)
    .join("");
};

const findMessageBoardName = async () => {
  const response = await fetch(singlePageEndpoint, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("无法获取留言板信息，请稍后再试。");
  }

  const result = (await response.json()) as { items?: SinglePageSummary[] };
  const messageBoard = result.items?.find((page) => page.spec?.template === "message.html");
  if (!messageBoard?.metadata?.name) {
    throw new Error("未找到留言板页面，请先创建使用 message.html 模板的页面。");
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
    status.textContent = "正在提交...";

    void Promise.resolve()
      .then(() => {
        payload.url = normalizeHttpUrl(payload.url, "网站地址");
        payload.logo = normalizeHttpUrl(payload.logo, "网站头像");
        payload.backlinkUrl = normalizeHttpUrl(payload.backlinkUrl, "友链页面");
        payload.rssUrl = normalizeHttpUrl(payload.rssUrl, "RSS 订阅地址");
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
          throw new Error(body?.message || body?.detail || "提交失败，请稍后再试。");
        }

        form.reset();
        status.classList.add("is-success");
        status.textContent = "申请已提交到留言板，等待站长审核。";
      })
      .catch((error: unknown) => {
        status.classList.add("is-error");
        status.textContent = error instanceof Error ? error.message : "提交失败，请稍后再试。";
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
    title: getText(track.title, track.name, track.songname) || "未命名歌曲",
    artist:
      getArtistName(track.artist ?? track.author ?? track.ar ?? track.artists ?? track.singer) ||
      "未知歌手",
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
  const autoplayEnabled = player.dataset.musicAutoplay === "true";
  const playlistEnabled = player.dataset.musicShowPlaylist === "true";
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

  const setControlsEnabled = (enabled: boolean) => {
    previous.disabled = !enabled;
    toggle.disabled = !enabled;
    next.disabled = !enabled;
    playbackMode.disabled = !enabled;
    progress.disabled = !enabled;

    if (playlistToggle) {
      playlistToggle.disabled = !enabled || !playlistEnabled;
    }
  };

  if (!sourceApi) {
    title.textContent = "请填写音乐 API 地址";
    artist.textContent = "自定义数据源需要返回可播放歌曲列表";
    setControlsEnabled(false);
    return;
  }

  const api = sourceApi.includes("{id}")
    ? sourceApi.replaceAll("{id}", encodeURIComponent(playlistId))
    : sourceApi;
  const savedState = getMusicPlayerState();
  const canRestore =
    savedState?.api === api && savedState.playlistId === playlistId ? savedState : undefined;
  playbackModeValue = canRestore?.mode || defaultPlaybackMode;
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
      };
      sessionStorage.setItem(musicPlayerStorageKey, JSON.stringify(state));
      lastPersistedTime = state.time;
    } catch {
      // The player remains usable when browser storage is unavailable.
    }
  };

  const updatePlayState = () => {
    const isPlaying = !audio.paused;
    toggle.setAttribute("aria-label", isPlaying ? "暂停" : "播放");
    toggle.title = isPlaying ? "暂停" : "播放";
    toggleIcon?.setAttribute("icon", isPlaying ? "octicon:pause-16" : "octicon:play-16");
  };

  const updatePlaybackMode = () => {
    const isShuffle = playbackModeValue === "shuffle";
    playbackMode.setAttribute("aria-label", isShuffle ? "随机播放" : "顺序播放");
    playbackMode.setAttribute("aria-pressed", String(isShuffle));
    playbackMode.title = isShuffle ? "随机播放" : "顺序播放";
    playbackModeIcon?.setAttribute("icon", isShuffle ? "lucide:shuffle" : "lucide:list-ordered");
  };

  const updatePlaylistCurrent = () => {
    playlistItems.forEach((item, itemIndex) => {
      item.classList.toggle("is-current", itemIndex === index);
    });
  };

  const buildPlaylist = () => {
    if (!playlistPanel || !playlistEnabled) {
      return;
    }

    playlistPanel.replaceChildren();
    playlistItems = [];

    if (!tracks.length) {
      const empty = document.createElement("p");
      empty.className = "music-player-playlist-empty";
      empty.textContent = "播放列表为空";
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
    const fallback = tracks[index]?.title || "正在加载歌词";
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
    setLyrics(track.lyric ? "正在加载歌词" : track.title);

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
      updatePlayState();
    } catch {
      resumeOnInteraction = true;
      artist.textContent = "浏览器限制自动播放，点击页面后继续";
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

  previous.addEventListener("click", goToPrevious);
  next.addEventListener("click", goToNext);
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
      void play();
    } else {
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
    artist.textContent = "当前歌曲无法播放，正在切换";
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
      const shouldPlay = autoplayEnabled && (canRestore?.wasPlaying ?? true);
      loadTrack(restoredIndex, shouldPlay, canRestore?.time || 0);
    })
    .catch(() => {
      title.textContent = "音乐暂时不可用";
      artist.textContent = "请检查播放器 API 配置";
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
      preview.setAttribute("aria-label", "图片预览");

      const previewImage = document.createElement("img");
      previewImage.src = source;
      previewImage.alt = image.alt;

      const closeButton = document.createElement("button");
      closeButton.className = "image-preview-close";
      closeButton.type = "button";
      closeButton.title = "关闭预览";
      closeButton.setAttribute("aria-label", "关闭预览");
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
  original.textContent = "查看原图";
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
  closeButton.title = "关闭预览";
  closeButton.setAttribute("aria-label", "关闭预览");
  closeButton.append(createIcon("material-symbols:close"));

  const prevButton = document.createElement("button");
  prevButton.className = "photo-lightbox-nav photo-lightbox-nav--prev";
  prevButton.type = "button";
  prevButton.title = "上一张";
  prevButton.setAttribute("aria-label", "上一张");
  prevButton.append(createIcon("material-symbols:chevron-left"));

  const nextButton = document.createElement("button");
  nextButton.className = "photo-lightbox-nav photo-lightbox-nav--next";
  nextButton.type = "button";
  nextButton.title = "下一张";
  nextButton.setAttribute("aria-label", "下一张");
  nextButton.append(createIcon("material-symbols:chevron-right"));

  const overlay = document.createElement("div");
  overlay.className = "photo-lightbox";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "图片预览");
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
        window.alert("点赞失败，请稍后再试");
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
        window.alert("点赞失败，请稍后再试");
      } finally {
        button.disabled = false;
      }
    });
  });
};

const setupRepositoryFilters = () => {
  const triggers = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-repository-filter]"),
  );

  if (!triggers.length) {
    return;
  }

  type FilterKind = "category" | "tag" | "sort";
  let openedMenu: HTMLElement | undefined;
  let closeTimer = 0;

  const closeMenu = () => {
    window.clearTimeout(closeTimer);

    if (openedMenu) {
      openedMenu.hidden = true;
      openedMenu = undefined;
    }

    triggers.forEach((trigger) => trigger.setAttribute("aria-expanded", "false"));
  };

  const scheduleClose = () => {
    closeTimer = window.setTimeout(() => {
      const stillHovered =
        triggers.some((trigger) => trigger.matches(":hover")) ||
        (openedMenu?.matches(":hover") ?? false);

      if (!stillHovered) {
        closeMenu();
      }
    }, 120);
  };

  const openMenu = (trigger: HTMLButtonElement, kind: FilterKind) => {
    const menu = document.querySelector<HTMLElement>(`[data-repository-filter-menu="${kind}"]`);

    if (!menu || openedMenu === menu) {
      return;
    }

    closeMenu();
    menu.hidden = false;
    openedMenu = menu;

    const rect = trigger.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.left = `${Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8)}px`;
    trigger.setAttribute("aria-expanded", "true");
  };

  triggers.forEach((trigger) => {
    const kind = trigger.dataset.repositoryFilter as FilterKind | undefined;

    if (!kind) {
      return;
    }

    // 兜底：筛选参数无效（例如手改 URL）时，回退到默认文案，避免按钮只剩箭头。
    const label = trigger.querySelector<HTMLElement>("[data-repository-filter-label]");

    if (label && !label.textContent?.trim()) {
      label.textContent = trigger.dataset.repositoryFilterDefault || "";
    }

    const openTriggerMenu = () => openMenu(trigger, kind);

    trigger.addEventListener("pointerenter", openTriggerMenu);
    trigger.addEventListener("pointerleave", scheduleClose);
    trigger.addEventListener("focus", openTriggerMenu);
  });

  document.querySelectorAll<HTMLElement>("[data-repository-filter-menu]").forEach((menu) => {
    menu.addEventListener("pointerenter", () => window.clearTimeout(closeTimer));
    menu.addEventListener("pointerleave", scheduleClose);
  });

  document.addEventListener("click", (event) => {
    const clickTarget = event.target;

    if (
      openedMenu &&
      clickTarget instanceof Node &&
      !openedMenu.contains(clickTarget) &&
      !triggers.some((trigger) => trigger.contains(clickTarget))
    ) {
      closeMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && openedMenu) {
      closeMenu();
    }
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
      link.title = "有未读消息";
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
    status.textContent = "输入关键词搜索";
    results.replaceChildren();
    controller?.abort();
  };

  const renderResults = (data: SearchResult, keyword: string) => {
    results.replaceChildren();

    if (!data.hits?.length) {
      status.textContent = `没有找到与 “${keyword}” 相关的内容`;
      return;
    }

    status.textContent = `找到 ${data.total ?? data.hits.length} 条结果`;
    results.append(...data.hits.map(createResultItem));
  };

  const search = async () => {
    const keyword = input.value.trim();
    controller?.abort();

    if (!keyword) {
      status.textContent = "输入关键词搜索";
      results.replaceChildren();
      return;
    }

    controller = new AbortController();
    status.textContent = "搜索中...";

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

      status.textContent = "搜索暂时不可用";
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

  void loadTags();
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
            name.textContent = category.spec?.displayName?.trim() || "未命名分类";
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

  void loadCategories();
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
    const name = category.spec?.displayName?.trim() || "未命名分类";
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
    description.textContent = category.spec?.description?.trim() || "暂无分类描述";
    metrics.className = "category-directory-metrics";
    metrics.append(
      createMetric("octicon:repo-16", `${postCount} 篇内容`),
      createMetric("octicon:eye-16", `共 ${stats.visit} 阅读`),
      createMetric("octicon:heart-16", `共 ${stats.upvote} 点赞`),
      createMetric("octicon:comment-16", `共 ${stats.comment} 评论`),
    );

    if (coverUrl) {
      const image = document.createElement("img");
      image.src = coverUrl;
      image.alt = `${name} 分类封面`;
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
          meta.textContent = "标签";
          link.append(title, meta);
          item.append(link);
          return item;
        }),
      );
      empty.hidden = true;
    } catch {
      list.replaceChildren();
      empty.textContent = kind === "categories" ? "无法加载分类。" : "无法加载标签。";
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
      elapsed.textContent = "即将开始";
      return;
    }

    const days = Math.floor(totalSeconds / 86_400);
    const hours = Math.floor((totalSeconds % 86_400) / 3_600);
    const minutes = Math.floor((totalSeconds % 3_600) / 60);
    const seconds = totalSeconds % 60;
    elapsed.textContent = `${days} 天 ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  update();
  window.setInterval(update, 1_000);
};

const setupBackToTop = () => {
  const button = document.querySelector<HTMLButtonElement>("[data-back-to-top]");

  if (!button) {
    return;
  }

  const updateVisibility = () => {
    button.hidden = window.scrollY < 320;
  };

  updateVisibility();
  window.addEventListener("scroll", updateVisibility, { passive: true });
  button.addEventListener("click", () => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  });
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
setupBackToTop();
