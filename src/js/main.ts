/**
 * 主题脚本入口。
 *
 * 这里只负责「把各个功能装起来」，具体实现分散在 features/ 下按功能拆分的模块里，
 * 通用能力（DOM 工具、i18n、接口、缓存等）放在 shared/ 下。
 */
import "../css/main.scss";
import "../css/about.scss";
import "iconify-icon";
import {
  setupHeaderClock,
  setupLoveCounter,
  setupSiteRuntime,
  setupSiteTimeline,
} from "./features/clock";
import {
  setupMomentUpvotes,
  setupPostUpvotes,
  setupRepositoryEngagement,
} from "./features/engagement";
import { setupFriendLinkApplication } from "./features/friend-links";
import {
  setupArticleImageLightbox,
  setupMomentImageLightbox,
  setupPhotoLightbox,
} from "./features/lightbox";
import {
  setupActiveMenuItem,
  setupCustomMenuIcons,
  setupLinkLogoFallbacks,
  setupPublishMenu,
  setupUserMenu,
} from "./features/menu";
import { setupMusicPlayer } from "./features/music-player";
import { setupNotificationIndicator } from "./features/notification";
import { setupSearch } from "./features/search-overlay";
import { setupSidebarCategories, setupSidebarTags } from "./features/sidebar";
import { setupTaxonomyPage } from "./features/taxonomy";
import { setupThemeToggle } from "./features/theme-toggle";
import { setupWeather } from "./features/weather";
import { setupGlobalBackToTop } from "./shared/back-to-top";
import { setupCommentWidgetStyle } from "./shared/comment-widget";
import { setupRepositoryFilters } from "./shared/repository-filters";

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
setupMomentImageLightbox();
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
