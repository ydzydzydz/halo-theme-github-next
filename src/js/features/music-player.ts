/**
 * 悬浮 / 顶栏音乐播放器。
 *
 * 支持拖拽吸附到屏幕边缘、播放进度与歌词同步、顺序与随机播放，
 * 并把播放状态存进 sessionStorage，切换页面后继续接着播。
 */
import { messages } from "../shared/i18n";

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

export const setupMusicPlayer = () => {
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
