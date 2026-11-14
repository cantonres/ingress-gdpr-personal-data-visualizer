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
    commit: null,
    unreleased: true,
    zh: "轨迹回放：时间压缩比速度档、长间隔不插值、停留点聚合、活跃度日历与 scrubber 热条、跟随播放头、出界指示。",
    en: "Trajectory playback: time-compression rates, no interpolation across long gaps, dwell-stop aggregation, activity calendar and scrubber heat strip, follow-playhead, off-screen indicator.",
  },
  {
    date: "2026-11-14",
    commit: null,
    unreleased: true,
    zh: "阵营配色（含底图实时切换）、播放头醒目度提升、出界箭头同色化、颜色文案随阵营切换。",
    en: "Faction theme (basemap switches live), more legible playhead, off-screen arrow in faction colour, colour wording follows the theme.",
  },
];
