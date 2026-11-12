# Ingress GDPR Visualizer

> 把 Niantic Ingress 的个人数据导出（GDPR export）变成可交互的地图、热力图与仪表盘。
> **所有解析都在本地完成，数据不会上传到任何服务器。**

[English](README_EN.md) · [中文](#快速开始)

本项目是爱好者作品，**不含任何个人数据**。你需要在浏览器里选择自己的 GDPR 导出文件夹（或仅 `game_log` 文件），或先用命令行脚本生成产物；`data/`、`raw/` 均已被 `.gitignore` 排除。

## 截图

以下截图使用**合成的广州示例数据**（`npm run demo:data` 生成，完全虚构，不含任何真实个人数据）。

| 地图 | 热力图 |
| --- | --- |
| ![地图页](docs/screenshots/map.png) | ![热力图页](docs/screenshots/heatmap.png) |

| 仪表盘 | Badges |
| --- | --- |
| ![仪表盘页](docs/screenshots/dashboard.png) | ![Badges](docs/screenshots/dashboard-badges.png) |

| 轨迹回放（占位） | 开箱选数据 |
| --- | --- |
| ![轨迹回放占位页](docs/screenshots/playback.png) | ![选数据屏](docs/screenshots/onboarding.png) |

## 功能

| 页面 | 内容 |
| --- | --- |
| **地图** | UPV / UPC 双图层；13 类事件分布（全量真实数据，**零抽稀**）；OPR 建议位置；intel 暗色 / 亮色双底图；逐 portal 悬浮统计（hack、插脚、抬脚、mod、占领次数） |
| **热力图** | 按被 hack / 被占领 / 插脚 / 抬脚次数加权的 portal 热度，带刻度 colorbar，多指标可叠加 |
| **仪表盘** | 最多 24 个时间序列（步数、XM、MU、驻守、OPR 等），逐日 / 逐月 / 逐年切换；悬停显示数值、环比、同比；统计卡、Badges 墙、Comm 提及与档案文本 |
| **轨迹回放** | 占位页（见 ROADMAP） |
| **通用** | 中 / 英双语切换、GitHub 链接与爱好者声明弹层、随时「重新选择数据」、深色主题 |

### 两种数据装载方式

打开应用时若没有预生成数据，会自动显示**选数据屏**（`?setup=1` 可强制模拟）：

1. **选择整个导出文件夹（推荐）**：完整体验——地图、热力图、完整仪表盘、Badges、OPR、Comm。
2. **仅选择 `game_log` 文件**：轻量体验——地图、热力图，以及最多 10 条由事件时间戳统计出的曲线（hack / 插脚 / 抬脚 / 占领 / link / field 等）。步数、XM、MU、Badges、OPR 等依赖其它文件，此模式下不可用。

也可以先用 Node CLI 预生成：

```bash
npm run ingest -- --src /path/to/your/gdpr/export
```

产物写入 `data/`：`portals.geojson`、`events.json`（紧凑列式，全量事件）、`dashboard.json`、`opr.geojson`、`meta.json`。**源目录严格只读**，脚本不会修改它。

> 数据口径原则：**地图页只使用 `game_log` 单一来源**；仪表盘的专项时间序列仍需各 `.tsv` 文件（它们的覆盖起点通常早于 `game_log`，且 XM / MU / 驻守快照等维度在 game_log 中没有对应事件）。

---

## 快速开始

要求：Node.js ≥ 20，现代浏览器（Chrome / Edge 支持原生文件夹选择；其它浏览器自动降级为兼容模式）。

```bash
git clone https://github.com/cantonres/ingress-gdpr-personal-data-visualizer.git
cd ingress-gdpr-visualizer
npm install
npm run dev            # http://127.0.0.1:5173
```

首次打开会显示选数据屏；选择你的 GDPR 导出文件夹即可。若要预生成数据（例如部署静态站点），先跑 `npm run ingest`，再：

```bash
npm run build          # 产物在 dist/，会自动带上 data/
npm run preview        # 本地预览构建产物
```

构建产物是纯静态站点。**部署注意事项见下方「隐私与数据边界」——本工具面向本地部署，不建议线上部署。**

### 数据从哪里来

在 Niantic 官方支持页面申请**个人数据导出（GDPR / Data Export）**，下载并解压，得到 `game_log.tsv`、`portal_history.tsv`、`*.tsv` 时间序列、`profile.txt`、`OprSubmissionLog.csv` 等文件。把整个文件夹交给本工具即可。

### 常用脚本

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务器 |
| `npm run build` | 构建静态站点（含 `data/`） |
| `npm run preview` | 预览构建产物 |
| `npm run ingest -- --src <dir> [--out <dir>]` | 预处理 GDPR 导出，生成 `data/` |
| `npm run catalog` | 刷新 `src/data/badgeCatalog.js`（ingress.plus 徽章图标 URL 表） |
| `npm run demo:data` / `npm run demo:shots` | 生成合成示例数据 / 重新截取 README 截图 |

---

## 目录结构

```
├── index.html               # 入口（含 favicon）
├── public/favicon.svg       # 站点图标
├── docs/screenshots/        # README 截图（合成示例数据）
├── scripts/
│   ├── ingest.mjs           # CLI：读原始导出 → data/
│   ├── generate-demo-data.mjs
│   ├── capture-screenshots.mjs
│   └── fetch-badge-catalog.mjs
├── src/
│   ├── lib/ingestCore.js    # 解析内核（Node CLI 与浏览器共用）
│   ├── dataContext.js       # 预生成 / 浏览器本地解析两条数据路径
│   ├── i18n.jsx             # 中英双语字典
│   ├── data/                # intel / 亮色底图样式、徽章图标 URL 表
│   └── components/          # 地图、热力图、仪表盘、Onboarding、Badges 等
├── data/                    # ⛔ 本地生成、已 gitignore（含个人数据）
└── dist/                    # ⛔ 构建产物、已 gitignore
```

---

## 隐私与数据边界

- 浏览器模式：**不上传任何文件**，全部在页面内用 `src/lib/ingestCore.js` 解析；
- CLI 模式：只读取 `--src` 指定目录，输出写到 `--out`，**不写回源目录**；
- `data/`、`raw/`、`node_modules/`、`dist/` 全部被 `.gitignore` 排除；
- 徽章图标热链自 [ingress.plus](https://ingress.plus/badges)，不下载到本仓库；地图瓦片来自 [OpenFreeMap](https://openfreemap.org/) / OpenStreetMap。

> **关于部署**：本工具面向**本地部署**。虽然构建产物技术上可以放到线上静态服务器，但 GDPR 导出包含精确位置、时间、邮箱、设备等敏感个人信息，**不建议线上部署**。

---

## ROADMAP

- [ ] 轨迹回放
- [ ] IITC 插件

---

## 声明 / Disclaimer

- 本站 / 本工具为**爱好者作品，与 Niantic Inc. 无官方关联**；**Ingress 是 Niantic Inc. 的注册商标**。
- 本项目**不分发、不包含任何个人数据**；任何由用户导出的 GDPR 数据由用户自行负责保管、使用与合规。
- 徽章图标版权归其各自权利人所有，图片热链自 ingress.plus；地图数据 © OpenStreetMap contributors、© OpenFreeMap。
- 参考与致谢：[UPC-UPV-for-IITC](https://github.com/Choujingress/UPC-UPV-for-IITC)（思路参考）、[cantonres/.github](https://github.com/cantonres/.github)（社区新人教程中的游戏术语/专用词汇）、[md-atlas](https://github.com/ReiiNoki/md-atlas)（intel 风格底图参考）、[ingress.plus](https://ingress.plus/badges)（徽章图标）。

## License

[MIT](LICENSE) — 详见 [LICENSE](LICENSE) 文件。
