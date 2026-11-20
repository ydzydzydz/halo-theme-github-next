/**
 * 点赞与互动计数：文章点赞、瞬间点赞、仓库式列表里的统计数字。
 */
import { showInlineHint } from "../shared/dom";
import { messages } from "../shared/i18n";

const momentUpvoteEndpoint = "/apis/api.halo.run/v1alpha1/trackers/upvote";

/** 超过 99 显示为 99+，与 GitHub 的计数口径一致。 */
const formatEngagementCount = (count: number) => (count > 99 ? "99+" : String(Math.max(0, count)));

export const setupRepositoryEngagement = () => {
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

export const setupMomentUpvotes = () => {
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

export const setupPostUpvotes = () => {
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
