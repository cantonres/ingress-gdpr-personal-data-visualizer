// Concise, commit-based release log shown on the onboarding screen.
// Entries with a commit hash map to real commits in this repository; entries
// marked unreleased are local work not yet pushed. No version labels: the repo
// has no tags or Releases to derive them from.
export const CHANGELOG = [
  {
    date: "2026-11-12",
    commit: "631b495",
    unreleased: false,
    zh: "首个公开版本：浏览器内本地解析 GDPR 导出，UPV / UPC 地图、热力图、仪表盘、徽章墙、中英双语与双底图。",
    en: "First public release: local in-browser GDPR parsing, UPV / UPC map, heatmap, dashboard, badge wall, bilingual UI and two basemaps.",
  },
  {
    date: "2026-11-12",
    commit: "a5958c7",
    unreleased: false,
    zh: "声明：本项目代码由 AI 实现。",
    en: "Disclosure: the code of this project was implemented by AI.",
  },
  {
    date: "2026-11-14",
    commit: "12cccc6",
    unreleased: false,
    zh: "轨迹回放：时间压缩比速度档、长间隔不插值、停留点聚合、活跃度日历与 scrubber 热条、跟随播放头、出界指示。",
    en: "Trajectory playback: time-compression rates, no interpolation across long gaps, dwell-stop aggregation, activity calendar and scrubber heat strip, follow-playhead, off-screen indicator.",
  },
  {
    date: "2026-11-14",
    commit: "12cccc6",
    unreleased: false,
    zh: "阵营配色（含底图实时切换）、播放头醒目度提升、出界箭头同色化、颜色文案随阵营切换。",
    en: "Faction theme (basemap switches live), more legible playhead, off-screen arrow in faction colour, colour wording follows the theme.",
  },
  {
    date: "2026-11-15",
    commit: "e09f6f4",
    unreleased: false,
    zh: "IITC 插件：intel 地图上的独立图层 —— 交互次数环与数字（分位数自适应分档、随缩放连续变化）、悬浮查看首次 / 最近访问与分类明细、按类别勾选的原始事件点、视野内 UPC / UPV 覆盖率；只导入 game_log.tsv。",
    en: "IITC plugin: a standalone layer on the intel map — interaction-count rings and labels (quantile-adaptive bins, continuously zoom-scaled), hover for first / last visit and category breakdown, per-category raw event dots, in-view UPC / UPV coverage; game_log.tsv only.",
  },
  {
    date: "2026-11-15",
    commit: "e09f6f4",
    unreleased: false,
    zh: "统计口径修正：UPC 属于 UPV（占领过的 portal 必然访问过），覆盖率不再重复计数；补充 IITC 插件的隐私边界披露。",
    en: "Counting fix: UPC is a subset of UPV (a captured portal was visited), so coverage is no longer double-counted; documented the IITC plugin's privacy boundary.",
  },
];
