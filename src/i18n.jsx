import { createContext, useContext, useState } from "react";

// ---------------------------------------------------------------------------
// Bilingual UI strings. Chinese terms follow the community glossary
// (hz-ingress/ingress-tutorial GLOSSARY.md + 知乎「Ingress 黑话」):
//   插 = Deploy, 抬脚 = Upgrade (user's term), 炸 = XMP/attack,
//   摸 = Hack, 拉 link = create link, 盖 field / 控制场 = create field,
//   安装 = install Mod, 充电 = Recharge, 画图 = Glyph Hack, Po/塔 = Portal.
// ---------------------------------------------------------------------------
const ZH = {
  brand: "Ingress GDPR Visualizer",
  "tab.map": "地图",
  "tab.heatmap": "热力图",
  "tab.dashboard": "仪表盘",
  "tab.playback": "轨迹回放",
  "lang.switch": "EN",
  "data.reselect": "重新选择数据",
  "map.styleIntel": "intel 风格",
  "map.styleLight": "亮色",
  "map.events": "事件分布",
  "map.loading": "（加载中…）",
  "map.upv": "UPV",
  "map.upc": "UPC",
  "map.activeRange": "活跃区间",
  "map.disclaimer": "本站为爱好者网站，与 Niantic Inc. 无官方关联；Ingress 是 Niantic Inc. 的注册商标。",
  "map.githubTitle": "GitHub",
  "map.hoverCaptured": "UPC：被占领",
  "map.hoverVisited": "到访过（未占领）",
  "map.hoverHack": "hack",
  "map.hoverDeploy": "插脚",
  "map.hoverUpgrade": "抬脚",
  "map.hoverMod": "mod",
  "map.hoverTimes": "次",
  "map.errEvents": "事件数据加载失败：",
  "map.errOpr": "OPR 数据加载失败：",
  "map.oprChip": "OPR 位置",

  "heat.hack": "被 hack 次数",
  "heat.capture": "被占领次数",
  "heat.deploy": "插脚次数",
  "heat.upgrade": "抬脚次数",
  "heat.single": "（对数分档）",
  "heat.multi": "事件次数（多指标相对热度，各指标按自身分档加权）",
  "heat.weak": "弱",
  "heat.strong": "强",
  "heat.note": "亮度按该 portal 上的动作次数加权（多次可叠加，可同时开启多个指标）",
  "heat.loading": "加载中…",

  "dash.rows": "行",
  "dash.dedup": "（合并去重",
  "dash.granD": "逐日",
  "dash.granM": "逐月",
  "dash.granY": "逐年",
  "dash.statUpv": "UPV（game_log 交互 portal）",
  "dash.statUpc": "UPC（其中被占领）",
  "dash.statKm": "总里程",
  "dash.statXm": "XM 收集",
  "dash.statHacks": "Hack 次数",
  "dash.statCaptures": "占领次数",
  "dash.statMissions": "完成 mission",
  "dash.partialTitle": "部分曲线（game_log 事件计数）",
  "dash.partialBody": "当前只选择了 game_log，以下曲线由事件时间戳直接统计得出（不含步数、XM、MU 等需要专项文件的数据）。\n若需要完整的专项序列、Badges、OPR 与 Comm，请",
  "dash.partialLink": "重新进入",
  "dash.partialTail": "并选择整个导出文件夹。",
  "dash.emptyTitle": "仪表盘不可用",
  "dash.emptyBody": "当前数据源没有可用的时间序列。重新进入应用时选择“选择整个导出文件夹”即可解锁。",
  "dash.badgesTitle": "Badges（",
  "dash.badgesUnit": " 枚 · 图标来自 ",
  "dash.commTitle": "Comm 提及（",
  "dash.commUnit": " 条）",
  "dash.profileTitle": "Agent 档案（profile.txt）",
  "dash.devicesTitle": "设备（devices.txt）",
  "dash.storeTitle": "商店购买记录（store_purchases.tsv）",
  "dash.recursionsTitle": "Recursions",
  "chart.peak": "峰值",
  "chart.mom": "环比",
  "chart.yoy": "同比",
  "chart.year": " 年",

  "play.tag": "规划中",
  "play.title": "轨迹回放",
  "play.p1": "把约 {years} 年的游戏史压缩成几分钟的动作轨迹动画。数据层已经就绪（game_log 中 {events} 条带坐标事件，按时间排序），本页预留了挂载位置。",
  "play.i1": "动点沿按时间排序的动作坐标移动，身后拖出轨迹线",
  "play.i2": "时间轴 scrubber：可拖到任意年份，支持 1×/10×/100× 速度档",
  "play.i3": "联动计数器：随播放跳动的统计量取决于已导入的数据（事件计数，或步数 / XM 等专项序列）",
  "play.i4": "单日重演模式：用当天的事件坐标做精细回放",
  "play.note": "注意：坐标锚定在动作事件上，两个动作点之间为直线插值，并非真实步行路径；官方里程文件（如已导入）仅用于总量校准。",

  "onb.title": "Ingress GDPR Visualizer",
  "onb.tagline1": "把你自己的 Ingress GDPR 数据导出，变成可交互的地图、热力图与仪表盘。所有解析均在你的浏览器本地完成，",
  "onb.taglineBold": "数据不会上传到任何服务器",
  "onb.tagline2": "。",
  "onb.folderTitle": "选择整个导出文件夹",
  "onb.rec": "推荐",
  "onb.folderBody": "完整体验：地图（UPV / UPC / 13 类事件分布 / OPR 建议位置）、热力图、完整仪表盘（步数、XM、MU、驻守等最多 24 个序列）、Badges 墙、Comm 提及与档案文本。",
  "onb.folderBtn": "选择文件夹",
  "onb.folderBtnCompat": "选择文件夹（兼容模式）",
  "onb.glTitle": "仅选择 game_log 文件",
  "onb.glBody1": "轻量体验：只有",
  "onb.glBodyBold": "地图、热力图",
  "onb.glBody2": "与",
  "onb.glBodyBold2": "最多 10 条 game_log 事件计数曲线",
  "onb.glBody3": "（hack / 插脚 / 抬脚 / 占领 / link / field 等，逐日 / 逐月 / 逐年）。完整仪表盘（步数、XM、MU 等）、Badges、OPR、Comm 依赖文件夹里的其它文件，此模式下不可用。",
  "onb.glBtn": "选择 game_log 文件（可多选）",
  "onb.readingFolder": "读取文件夹…",
  "onb.readingFiles": "读取文件…",
  "onb.parsing": "解析中…（已读取 ",
  "onb.parsingTail": " 个文件） 全量解析约需数秒，请稍候…",
  "onb.featuresTitle": "主要功能",
  "onb.f1": "地图：UPV（紫）/ UPC（红）双图层、13 类事件分布（全量真实数据，零抽稀）、OPR 建议位置，双底图切换，逐 portal 悬浮统计（hack / 插脚 / 抬脚 / mod / 占领次数）",
  "onb.f2": "热力图：按被 hack / 被占领 / 插脚 / 抬脚次数加权的 portal 热度，带刻度 colorbar",
  "onb.f3": "仪表盘：最多 24 个时间序列（步行里程、XM、MU、驻守、OPR 等），逐日 / 逐月 / 逐年切换，悬停查看数值与环比 / 同比",
  "onb.f4": "Badges：全部徽章按获得时序排列，图标来自 ingress.plus",
  "onb.f5": "档案与杂项：Agent 档案、设备、商店购买、Recursions、Comm 提及原文",
  "about.button": "关于",
  "about.title": "关于本站",
  "about.close": "关闭",
  "about.local": "本工具在本地浏览器内解析数据，不上传任何个人数据；图标热链 ingress.plus。",
  "about.github": "在 GitHub 上查看本项目",
  "onb.errNoLog": "所选内容中没有 game_log*.tsv 文件",
  "onb.note": "数据获取方式：登录 Ingress 后在 Niantic 官方支持页面申请个人数据导出（GDPR export），下载解压后即可使用。本工具是爱好者作品，与 Niantic Inc. 无官方关联。",
};

const EN = {
  brand: "Ingress GDPR Visualizer",
  "tab.map": "Map",
  "tab.heatmap": "Heatmap",
  "tab.dashboard": "Dashboard",
  "tab.playback": "Playback",
  "lang.switch": "中文",
  "data.reselect": "Change data",
  "map.styleIntel": "Intel dark",
  "map.styleLight": "Light",
  "map.events": "Events",
  "map.loading": " (loading…)",
  "map.upv": "UPV",
  "map.upc": "UPC",
  "map.activeRange": "Active",
  "map.disclaimer": "A fan-made site, not affiliated with Niantic Inc. Ingress is a registered trademark of Niantic Inc.",
  "map.githubTitle": "GitHub",
  "map.hoverCaptured": "UPC: captured",
  "map.hoverVisited": "Visited (not captured)",
  "map.hoverHack": "hacks",
  "map.hoverDeploy": "deploys",
  "map.hoverUpgrade": "upgrades",
  "map.hoverMod": "mods",
  "map.hoverTimes": "",
  "map.errEvents": "Failed to load events: ",
  "map.errOpr": "Failed to load OPR data: ",
  "map.oprChip": "OPR points",

  "heat.hack": "Hacks",
  "heat.capture": "Captures",
  "heat.deploy": "Resonator deploys",
  "heat.upgrade": "Resonator upgrades",
  "heat.single": " (log scale)",
  "heat.multi": "Event count (relative heat; each metric weighted by its own scale)",
  "heat.weak": "low",
  "heat.strong": "high",
  "heat.note": "Brightness weighted by action count at each portal; metrics can stack",
  "heat.loading": "Loading…",

  "dash.rows": "rows",
  "dash.dedup": " (deduped ",
  "dash.dedupTail": " rows)",
  "dash.granD": "Daily",
  "dash.granM": "Monthly",
  "dash.granY": "Yearly",
  "dash.statUpv": "UPV (game_log portals)",
  "dash.statUpc": "UPC (captured)",
  "dash.statKm": "Distance",
  "dash.statXm": "XM collected",
  "dash.statHacks": "Hacks",
  "dash.statCaptures": "Captures",
  "dash.statMissions": "Missions done",
  "dash.partialTitle": "Partial series (game_log event counts)",
  "dash.partialBody": "Only game_log was loaded; the curves below are computed directly from event timestamps (no distance / XM / MU data, which needs the dedicated files).\nFor the full set of dedicated series, Badges, OPR and Comm, please ",
  "dash.partialLink": "start over",
  "dash.partialTail": " and choose the whole export folder.",
  "dash.emptyTitle": "Dashboard unavailable",
  "dash.emptyBody": "No time series available. Start over and choose the whole export folder to unlock them.",
  "dash.badgesTitle": "Badges (",
  "dash.badgesUnit": " · icons from ",
  "dash.commTitle": "Comm mentions (",
  "dash.commUnit": ")",
  "dash.profileTitle": "Agent profile (profile.txt)",
  "dash.devicesTitle": "Devices (devices.txt)",
  "dash.storeTitle": "Store purchases (store_purchases.tsv)",
  "dash.recursionsTitle": "Recursions",
  "chart.peak": "Peak",
  "chart.mom": "MoM",
  "chart.yoy": "YoY",
  "chart.year": "",

  "play.tag": "Planned",
  "play.title": "Trajectory playback",
  "play.p1": "Compress ~{years} years of gameplay into a few minutes of animated action trail. The data layer is ready ({events} coordinate events in game_log, sorted by time); this page reserves the mount point.",
  "play.i1": "A marker moves along time-ordered action coordinates with a trailing path",
  "play.i2": "Timeline scrubber: jump to any year, 1×/10×/100× speed",
  "play.i3": "Live counters: the available statistics depend on the loaded data (event counts, or dedicated series like distance / XM)",
  "play.i4": "Single-day replay: fine-grained playback using that day's event coordinates",
  "play.note": "Note: coordinates are anchored to action events; straight interpolation between two actions is not the real walking path. Official distance data (if loaded) is for total calibration only.",

  "onb.title": "Ingress GDPR Visualizer",
  "onb.tagline1": "Turn your own Ingress GDPR data export into an interactive map, heatmap and dashboard. All parsing happens locally in your browser — ",
  "onb.taglineBold": "your data is never uploaded",
  "onb.tagline2": ".",
  "onb.folderTitle": "Choose the whole export folder",
  "onb.rec": "Recommended",
  "onb.folderBody": "Full experience: map (UPV / UPC / 13 event layers / OPR suggested locations), heatmap, full dashboard (up to 24 series: distance, XM, MU, holding days...), Badges wall, Comm mentions and profile text.",
  "onb.folderBtn": "Choose folder",
  "onb.folderBtnCompat": "Choose folder (compat mode)",
  "onb.glTitle": "Only game_log file(s)",
  "onb.glBody1": "Lightweight: ",
  "onb.glBodyBold": "map and heatmap",
  "onb.glBody2": " plus ",
  "onb.glBodyBold2": "up to 10 game_log event-count curves",
  "onb.glBody3": " (hacks / deploys / upgrades / captures / links / fields, daily / monthly / yearly). The full dashboard (distance, XM, MU...), Badges, OPR and Comm need the other files and are unavailable here.",
  "onb.glBtn": "Choose game_log file(s)",
  "onb.readingFolder": "Reading folder…",
  "onb.readingFiles": "Reading files…",
  "onb.parsing": "Parsing… (",
  "onb.parsingTail": " files read) Full parsing takes a few seconds…",
  "onb.featuresTitle": "Key features",
  "onb.f1": "Map: UPV / UPC layers, 13 event categories (full data, no sampling), OPR locations, two basemaps, per-portal hover stats",
  "onb.f2": "Heatmap: portal activity weighted by hacks / captures / deploys / upgrades, with a colorbar",
  "onb.f3": "Dashboard: up to 24 time series (distance, XM, MU, holding days, OPR...), daily / monthly / yearly, hover for value, MoM and YoY",
  "onb.f4": "Badges: every badge in earned order, icons from ingress.plus",
  "onb.f5": "Profile & misc: agent profile, devices, store purchases, Recursions, Comm mentions",
  "about.button": "About",
  "about.title": "About this site",
  "about.close": "Close",
  "about.local": "All data is parsed locally in your browser and never uploaded. Badge icons are hotlinked from ingress.plus.",
  "about.github": "View this project on GitHub",
  "onb.errNoLog": "No game_log*.tsv found in the selection",
  "onb.note": "Getting the data: request your personal data export (GDPR export) from Niantic's official support page, download and unzip it. This is a fan-made tool, not affiliated with Niantic Inc.",
};

// Data-derived labels (series names / units are baked into dashboard.json).
const SERIES_EN = {
  kilometers_walked: "Distance", xm_collected: "XM collected", xm_recharged: "XM recharged",
  hacks: "Hacks", deploys: "Resonator deploys", mods_deployed: "Mods installed",
  resonators_destroyed: "Resonators destroyed", links_created: "Links created",
  fields_created: "Fields created", fields_destroyed: "Fields destroyed",
  link_destroyed: "Links destroyed", glyph_hack_points: "Glyph hack points",
  link_length_kilometers: "Link length", portals_captured: "Captures",
  portals_neutralized: "Portals neutralized", missions_completed: "Missions done",
  magnus_builder_slots_deployed: "Magnus builder slots", field_held_days: "Field holding",
  link_held_days: "Link holding", portal_held_days: "Portal holding",
  comm_mentions: "Comm mentions", mind_units_controlled: "MU level",
  mind_units_times_days_held: "MU·days (peak)", link_length_kilometers_times_days_held: "Link·days (peak)",
  gl_hack: "Hacks (event count)", gl_deploy: "Deploys (event count)",
  gl_upgrade: "Upgrades (event count)", gl_mod: "Mods (event count)",
  gl_capture: "Captures (event count)", gl_attack: "Attacks / destroys (event count)",
  gl_link: "Links created (event count)", gl_field: "Fields created (event count)",
  gl_portal_edit: "Portal edits (event count)", gl_recharge: "Recharges (event count)",
};
const UNIT_EN = {
  km: "km", XM: "XM", 次: " times", 个: "", 条: "", 分: " pts",
  "MU": "MU", "个·天": " field-days", "条·天": " link-days",
  "MU·天": " MU-days", "km·天": " km-days",
};

// Event chips (label + hover explanation).
const EVENT_LABELS_EN = {
  deploy: "Deploy", upgrade: "Upgrade", mod: "Mod", attack: "Attack",
  capture: "Capture", hack: "Hack", link: "Link", portal_edit: "Portal edit",
  recharge: "Recharge", item: "Items", login: "Login", location: "Location", other: "Other",
};
const EVENT_DESC_EN = {
  deploy: "Deploy (插脚): place a resonator on a portal",
  upgrade: "Upgrade (抬脚): replace a resonator with a higher-level one",
  mod: "Mod: install a mod (shield, heatsink, link amp...) on a portal",
  attack: "Attack (炸): XMP fire / destroy enemy resonators. Coordinates are the player's position, NOT the portal, so dots sit off-portal",
  hack: "Hack (摸): acquire items from a portal (friendly / enemy / neutral)",
  capture: "Capture: claim a portal by deploying its first resonator. Full data. UPC layer is aggregated from exactly these events; captures before 2015-09-29 are not in game_log",
  link: "Link: create a link. Coordinate = origin portal",
  portal_edit: "Portal edit: submit a new portal candidate or edit an existing one via the scanner; coordinate is the candidate/target portal",
  recharge: "Recharge (充电): recharge resonators",
  item: "Items: drop / recycle / pick up items",
  login: "Login",
  location: "Location: device position report",
  other: "Other: passcode redemption (incl. XM/AP bonus), Hypercube, Comm messages, aegis shield, drone moves, kinetic capsules, mission completion, ultra link amp etc. (player position)",
  scout: "Scout Controlled: marker earned by submitting a new portal photo/info (only 2 in this export)",
  opr: "OPR suggested locations: position corrections submitted while reviewing portal candidates (from OprSubmissionLog's Suggested Location column)",
};

const I18nContext = createContext(null);

export function I18nProvider({ children, onChange }) {
  const [lang, setLangState] = useState(() => localStorage.getItem("igv-lang") || "zh");
  const setLang = (l) => {
    localStorage.setItem("igv-lang", l);
    setLangState(l);
    onChange?.(l);
  };
  const dict = lang === "en" ? EN : ZH;
  const t = (key, params) => {
    let str = dict[key] ?? ZH[key] ?? key;
    if (params) for (const [k, v] of Object.entries(params)) str = str.replaceAll(`{${k}}`, String(v));
    return str;
  };
  const fmtCount = (v) => {
    if (v == null) return "—";
    if (lang === "en") {
      if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
      if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
      return String(v);
    }
    if (v >= 1e8) return `${(v / 1e8).toFixed(2)} 亿`;
    if (v >= 1e4) return `${(v / 1e4).toFixed(1)} 万`;
    return v.toLocaleString();
  };
  const value = {
    lang,
    setLang,
    t,
    fmtCount,
    seriesName: (s) => (lang === "en" ? SERIES_EN[s.id] ?? s.name : s.name),
    unit: (u) => (lang === "en" ? UNIT_EN[u] ?? u : u),
    eventLabel: (k, zhLabel) => (lang === "en" ? EVENT_LABELS_EN[k] ?? zhLabel : zhLabel),
    eventDesc: (k, zhDesc) => (lang === "en" ? EVENT_DESC_EN[k] ?? zhDesc : zhDesc),
  };
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext) ?? {
    lang: "zh",
    t: (k) => ZH[k] ?? k,
    fmtCount: (v) => String(v),
    seriesName: (s) => s.name,
    unit: (u) => u,
    eventLabel: (_k, l) => l,
    eventDesc: (_k, d) => d,
  };
}
