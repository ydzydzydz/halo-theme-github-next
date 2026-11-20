/**
 * 此文件由 scripts/gen-messages.mjs 生成，请勿手动编辑。
 *
 * 消息表的事实来源是 i18n/default.properties（简体中文）。
 * 修改文案请改 i18n/ 下的 properties，再重新运行生成脚本。
 *
 * 这里只包含脚本实际引用到的键，与服务端注入块保持一致。
 */

export interface ThemeMessages {
  activity: {
    empty: string;
    failed: string;
    heading: string;
    headingSelected: string;
    kindCategoryCreated: string;
    kindMomentPublished: string;
    kindPhotoAdded: string;
    kindPublished: string;
    kindTagCreated: string;
    kindUpdated: string;
    tooltip: string;
    total: string;
    yearTotal: string;
  };
  archives: {
    searchTruncated: string;
  };
  common: {
    noData: string;
    noSummary: string;
    updated: string;
  };
  douban: {
    all: string;
    book: string;
    empty: string;
    failed: string;
    filterByGenre: string;
    filterByStatus: string;
    filterByType: string;
    filterLabel: string;
    genreDrama: string;
    genreGame: string;
    movie: string;
    music: string;
    myRating: string;
    paginationLabel: string;
    scoreLabel: string;
    statusDoing: string;
    statusDone: string;
    statusWant: string;
    unmarked: string;
    unrated: string;
  };
  links: {
    boardFetchFailed: string;
    boardMissing: string;
    failed: string;
    invalidUrl: string;
    linkApplication: string;
    rowBacklinkUrl: string;
    rowContactEmail: string;
    rowRssUrl: string;
    rowSeparator: string;
    rowSiteDescription: string;
    rowSiteLogo: string;
    rowSiteName: string;
    rowSiteUrl: string;
    submittedToBoard: string;
    submitting: string;
  };
  love: {
    upcoming: string;
  };
  message: {
    count: string;
    empty: string;
    failed: string;
    guest: string;
  };
  music: {
    apiRequired: string;
    autoplayBlocked: string;
    customApiHint: string;
    emptyPlaylist: string;
    lyricsFallback: string;
    pause: string;
    play: string;
    playbackFailed: string;
    playbackMode: string;
    shuffle: string;
    unavailableHint: string;
    unavailableTitle: string;
    unknownArtist: string;
    untitled: string;
  };
  notification: {
    unread: string;
  };
  pagination: {
    next: string;
    previous: string;
  };
  preview: {
    close: string;
    label: string;
    next: string;
    original: string;
    previous: string;
  };
  search: {
    noResultWithKeyword: string;
    resultCount: string;
    searching: string;
    status: string;
    temporarilyUnavailable: string;
  };
  taxonomy: {
    categoriesLoadFailed: string;
    commentsMetric: string;
    coverAlt: string;
    defaultDescription: string;
    postsMetric: string;
    tags: string;
    tagsLoadFailed: string;
    untitled: string;
    upvotesMetric: string;
    viewsMetric: string;
  };
  theme: {
    modeDark: string;
    modeLabel: string;
    modeLight: string;
    modeSystem: string;
    switchToDark: string;
    switchToLight: string;
    switchToSystem: string;
  };
  timeline: {
    days: string;
    elapsedDays: string;
    hours: string;
    minutes: string;
    seconds: string;
    target: string;
    years: string;
  };
  toast: {
    likeFailed: string;
    loadFailed: string;
    networkError: string;
  };
  weather: {
    conditionClear: string;
    conditionCloudy: string;
    conditionDrizzle: string;
    conditionFog: string;
    conditionMostlyClear: string;
    conditionOvercast: string;
    conditionRain: string;
    conditionSnow: string;
    conditionThunderstorm: string;
    currentLocation: string;
    defaultLabel: string;
    locating: string;
    summary: string;
  };
}

export const defaultMessages: ThemeMessages = {
  activity: {
    empty: "暂无站点动态",
    failed: "无法加载站点动态。",
    heading: "站点动态",
    headingSelected: "{0}站点动态",
    kindCategoryCreated: "创建了分类",
    kindMomentPublished: "发布了瞬间",
    kindPhotoAdded: "添加了图库内容",
    kindPublished: "发布了文章",
    kindTagCreated: "创建了标签",
    kindUpdated: "更新了文章",
    tooltip: "{0} 有 {1} 次站点互动：{2}",
    total: "过去一年有 {0} 次站点互动",
    yearTotal: "{0} 年有 {1} 次站点互动",
  },
  archives: {
    searchTruncated: "仅显示前 {0} 条",
  },
  common: {
    noData: "暂无数据",
    noSummary: "暂无文章摘要",
    updated: "更新于",
  },
  douban: {
    all: "全部",
    book: "图书",
    empty: "还没有符合当前筛选条件的豆瓣条目",
    failed: "加载失败，请确认已安装并启用豆瓣插件后重试。",
    filterByGenre: "题材",
    filterByStatus: "状态",
    filterByType: "类型",
    filterLabel: "豆瓣筛选",
    genreDrama: "舞台剧",
    genreGame: "游戏",
    movie: "电影",
    music: "音乐",
    myRating: "{0} 星",
    paginationLabel: "豆瓣记录分页",
    scoreLabel: "豆瓣评分 {0}",
    statusDoing: "在看",
    statusDone: "看过",
    statusWant: "想看",
    unmarked: "未标记",
    unrated: "未评分",
  },
  links: {
    boardFetchFailed: "无法获取留言板信息，请稍后再试。",
    boardMissing: "未找到留言板页面，请先创建使用 message.html 模板的页面。",
    failed: "提交失败，请稍后再试",
    invalidUrl: "{0}必须是有效的 HTTP 或 HTTPS 地址。",
    linkApplication: "友链申请",
    rowBacklinkUrl: "友链页面",
    rowContactEmail: "联系邮箱",
    rowRssUrl: "RSS 订阅地址",
    rowSeparator: "：",
    rowSiteDescription: "网站描述",
    rowSiteLogo: "网站头像",
    rowSiteName: "网站名称",
    rowSiteUrl: "网站地址",
    submittedToBoard: "申请已提交到留言板，等待站长审核。",
    submitting: "正在提交...",
  },
  love: {
    upcoming: "即将开始",
  },
  message: {
    count: "共 {0} 条留言",
    empty: "还没有留言",
    failed: "留言加载失败",
    guest: "访客",
  },
  music: {
    apiRequired: "请填写音乐 API 地址",
    autoplayBlocked: "浏览器限制自动播放，点击页面后继续",
    customApiHint: "自定义数据源需要返回可播放歌曲列表",
    emptyPlaylist: "播放列表为空",
    lyricsFallback: "正在加载歌词",
    pause: "暂停",
    play: "播放",
    playbackFailed: "当前歌曲无法播放，正在切换",
    playbackMode: "顺序播放",
    shuffle: "随机播放",
    unavailableHint: "请检查播放器 API 配置",
    unavailableTitle: "音乐暂时不可用",
    unknownArtist: "未知歌手",
    untitled: "未命名歌曲",
  },
  notification: {
    unread: "有未读通知",
  },
  pagination: {
    next: "下一页",
    previous: "上一页",
  },
  preview: {
    close: "关闭预览",
    label: "图片预览",
    next: "下一张",
    original: "查看原图",
    previous: "上一张",
  },
  search: {
    noResultWithKeyword: "没有找到与 “{0}” 相关的内容",
    resultCount: "找到 {0} 条结果",
    searching: "搜索中...",
    status: "输入关键词搜索",
    temporarilyUnavailable: "搜索暂时不可用",
  },
  taxonomy: {
    categoriesLoadFailed: "无法加载分类。",
    commentsMetric: "共 {0} 评论",
    coverAlt: "{0} 分类封面",
    defaultDescription: "暂无分类描述",
    postsMetric: "{0} 篇内容",
    tags: "标签",
    tagsLoadFailed: "无法加载标签。",
    untitled: "未命名分类",
    upvotesMetric: "共 {0} 点赞",
    viewsMetric: "共 {0} 阅读",
  },
  theme: {
    modeDark: "夜间模式",
    modeLabel: "主题颜色：{0}",
    modeLight: "白色模式",
    modeSystem: "跟随系统",
    switchToDark: "切换到夜间模式",
    switchToLight: "切换到白色模式",
    switchToSystem: "切换到跟随系统",
  },
  timeline: {
    days: "{0} 天",
    elapsedDays: "{0} 天",
    hours: "{0} 时",
    minutes: "{0} 分",
    seconds: "{0} 秒",
    target: "目标：{0} 年",
    years: "{0} 年",
  },
  toast: {
    likeFailed: "点赞失败，请稍后再试",
    loadFailed: "加载失败",
    networkError: "网络异常，请稍后再试",
  },
  weather: {
    conditionClear: "晴",
    conditionCloudy: "多云",
    conditionDrizzle: "毛毛雨",
    conditionFog: "雾",
    conditionMostlyClear: "少云",
    conditionOvercast: "阴",
    conditionRain: "雨",
    conditionSnow: "雪",
    conditionThunderstorm: "雷雨",
    currentLocation: "当前位置",
    defaultLabel: "天气",
    locating: "定位中",
    summary: "{0}，{1}，{2} 摄氏度",
  },
};
