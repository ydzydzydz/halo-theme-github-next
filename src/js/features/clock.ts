/**
 * 页面上与时间相关的展示：建站历程、站点运行时间、顶栏时钟、纪念日倒计时。
 *
 * 四者都要「每秒刷新」或「按分钟刷新」，集中在这里方便统一节流口径。
 */
import { pageLocale } from "../shared/dom";
import { formatMessage, messages } from "../shared/i18n";

// 一年按 365.2425 天计算，站点运行时间与建站历程进度条保持一致。
const averageYearMs = 365.2425 * 86_400_000;

export const setupSiteTimeline = () => {
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

export const setupSiteRuntime = () => {
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

export const setupHeaderClock = () => {
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

export const setupLoveCounter = () => {
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
