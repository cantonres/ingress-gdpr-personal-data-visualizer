# Ingress GDPR Visualizer

> Turn your Niantic Ingress personal data export (GDPR export) into an interactive map, heatmap, dashboard and trajectory playback.
> **All parsing happens locally — your data is never uploaded to any server.**

[中文文档](README.md) · [English](#screenshots)

This is a fan-made project and **contains no raw personal data files**. You pick your own GDPR export folder (or just the `game_log` file(s)) in the browser, or pre-generate the artifacts with a CLI script; `data/` and `raw/` are excluded by `.gitignore`.

## Screenshots

The six web-app screenshots below use **synthetic Guangzhou demo data** (entirely fictional, contains no real personal data). The IITC plugin screenshot in its own section below has been redacted; see the note there.

| Map | Heatmap |
| --- | --- |
| ![Map](docs/screenshots/map.png) | ![Heatmap](docs/screenshots/heatmap.png) |

| Dashboard | Badges |
| --- | --- |
| ![Dashboard](docs/screenshots/dashboard.png) | ![Badges](docs/screenshots/dashboard-badges.png) |

| Playback | Onboarding |
| --- | --- |
| ![Playback](docs/screenshots/playback.png) | ![Data picker](docs/screenshots/onboarding.png) |

## Features & changelog

Rows are ordered by date; this table doubles as the project's changelog (dates are when each feature landed).

| Date | Page | Content |
| --- | --- | --- |
| 2026-11-12 | **Map** | UPV / UPC layers; 13 event categories (full real data, **zero sampling**); OPR suggested locations; Intel dark / light basemaps; per-portal hover stats (hacks, deploys, upgrades, mods, captures) |
| 2026-11-12 | **Heatmap** | Portal activity weighted by hacks / captures / deploys / upgrades, with a ticked colorbar; metrics can stack |
| 2026-11-12 | **Dashboard** | Up to 24 time series (distance, XM, MU, holding days, OPR...), daily / monthly / yearly views; hover for value, MoM and YoY; stat cards, Badges wall, Comm mentions and profile text |
| 2026-11-12 | **General** | 中文 / English toggle, GitHub link and fan-site disclaimer popover, "change data" anytime, dark theme |
| 2026-11-14 | **Playback** | Time-compression rates (1 hour / day / week / month per second); no interpolation across long gaps, dwell-stop aggregation; activity calendar and scrubber heat strip, single-day replay, follow-playhead, edge direction + distance; event points are never sampled |
| 2026-11-14 | **General** | Faction theme (Enlightened / Resistance — UI accent and basemap switch live) |
| 2026-11-15 | **IITC plugin** | Standalone layer on the intel map: interaction-count rings (quantile-adaptive bins, continuously scaled with zoom), count labels, hover with first / last visit and per-category breakdown, per-category raw event dots, in-view UPC / UPV coverage |

### Two ways to load data

If no pre-generated data exists, the app opens with a **data picker**:

1. **Choose the whole export folder (recommended)**: the full experience — map, heatmap, complete dashboard, Badges, OPR, Comm.
2. **Only the `game_log` file(s)**: lightweight — map, heatmap, and up to 10 event-count curves (hacks / deploys / upgrades / captures / links / fields...). Distance, XM, MU, Badges, OPR and Comm need the other files and are unavailable in this mode.

You can also pre-generate with the Node CLI:

```bash
npm run ingest -- --src /path/to/your/gdpr/export
```

Artifacts are written to `data/`: `portals.geojson`, `events.json` (compact columnar, full events), `dashboard.json`, `opr.geojson`, `meta.json`. The **source directory is strictly read-only** — the script never modifies it.

> Data scope principle: **the map only uses `game_log` as its single source**; the dashboard's dedicated time series still need the individual `.tsv` files (they usually cover a longer period than `game_log`, and dimensions like XM / MU / holding snapshots have no game_log events at all).

---

## Getting started

Requires Node.js ≥ 20 and a modern browser (Chrome / Edge support the native folder picker; other browsers fall back to a compat mode).

```bash
git clone https://github.com/cantonres/ingress-gdpr-personal-data-visualizer.git
cd ingress-gdpr-visualizer
npm install
npm run dev            # http://127.0.0.1:5173
```

The first launch shows the data picker; choose your GDPR export folder. To pre-generate data (e.g. for a static deployment), run `npm run ingest` first, then:

```bash
npm run build          # output in dist/; only the five data files the app fetches are copied
npm run preview        # preview the production build
```

The build output is a plain static site. **See "Privacy & data boundaries" below — this tool is designed for local deployment; hosting it online is not recommended.**

### Where the data comes from

Request a **personal data export (GDPR / Data Export)** from Niantic's official support page, download and unzip it — you get `game_log.tsv`, `portal_history.tsv`, the `*.tsv` time series, `profile.txt`, `OprSubmissionLog.csv` and more. Hand the whole folder to this tool.

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Build the static site (includes `data/`) |
| `npm run preview` | Preview the production build |
| `npm run ingest -- --src <dir> [--out <dir>]` | Preprocess a GDPR export into `data/` |
| `npm run catalog` | Refresh `src/data/badgeCatalog.js` (badge icon URL table from ingress.plus) |
| `npm run build:iitc` | Regenerate the IITC artifact from template + parsing core |
| `npm run check:iitc` | Verify the IITC artifact is in sync with source (CI gate) |

---

## IITC plugin (optional)

`iitc/gdpr-visualizer.user.js` is a single-file userscript shipped with this repository. It overlays your own GDPR history on the [IITC-CE](https://iitc.app/) intel map and **does not require running this tool first**: it parses the raw `game_log*.tsv` itself, using the same parsing core (`src/lib/ingestCore.js`) as the web app, so the portal set and interaction counts match.

![IITC plugin interface (redacted screenshot)](docs/screenshots/IITCplugin.png)

> This screenshot comes from a real GDPR export; statistics, portal names, map labels and the hover panel have been mosaicked. It shows the interface only and contains no readable personal data.

**Install**: add `iitc/gdpr-visualizer.user.js` with Tampermonkey / Violentmonkey (the header declares `@match https://intel.ingress.com/*`), or add it from the repository raw URL in IITC-CE's plugin manager. The header carries `@updateURL` / `@downloadURL`, so the userscript manager handles subsequent updates.

**Usage**: open the intel map → a single toolbox entry **GDPR data visualizer** appears → click to open the menu:

| Menu item | Purpose |
| --- | --- |
| **Import game_log.tsv…** | Pick `game_log.tsv` (multi-select is supported; duplicate copies are de-duplicated). Only `game_log*.tsv` is accepted — no folder import, no pre-generated geojson |
| **Interaction rings / Always show counts** | Rings per portal coloured by total interaction count; breakpoints adapt to the imported data (p50 / p80 / p95) and the legend shows the actual ranges. Rings scale continuously with zoom; counts are labelled from zoom 14 upwards |
| **Event dots + category toggles** | Overlay raw events per category. Only `attack` is selected by default; categories without coordinates (such as `field`) never appear; one dot per category per on-screen cell, no cap, current view only |
| **Clear data** | Remove the locally stored index and the in-memory event data |

Hovering a portal shows team / level, UPC status, total interactions and the per-category breakdown (hack, capture, deploy, upgrade, mod, link), plus the first visit, last visit and the span between them. The panel footer reports portal count, UPC / UPV and coverage for the current view — **UPC is included in UPV**, and only portals inside the map bounds are counted.

The plugin is an independent canvas layer and **never writes portal `fillColor`**, so it coexists with IITC's built-in portal-history highlighter.

> Privacy: the plugin makes no network requests; everything is parsed in the page. However, the imported portal index (coordinates at roughly 1 m precision, interaction counts, first / last visit timestamps) is stored in `intel.ingress.com`'s localStorage, which **any same-origin script can theoretically read**. Full event points live in memory only and are lost on reload — re-import to restore them. On a shared computer, use **Clear data** when done.

---

## Project layout

```
├── index.html               # entry point (includes favicon)
├── public/favicon.svg       # site icon
├── docs/screenshots/        # README screenshots (web app: synthetic data; IITC: redacted)
├── iitc/
│   ├── src/template.js      # plugin template (build script injects the parsing core)
│   └── gdpr-visualizer.user.js  # generated, installable artifact
├── scripts/
│   ├── ingest.mjs           # CLI: raw export → data/
│   ├── build-iitc.mjs       # generate the IITC artifact from template + core
│   └── fetch-badge-catalog.mjs
├── src/
│   ├── lib/ingestCore.js    # parsing core (Node CLI / browser)
│   ├── dataContext.js       # pre-generated / in-browser data paths
│   ├── faction.js           # faction theme (UI accent + basemap palette)
│   ├── changelog.js         # onboarding changelog
│   ├── i18n.jsx             # Chinese / English dictionary
│   ├── data/                # Intel / light basemap styles, badge icon URL table
│   └── components/          # map, heatmap, dashboard, playback, onboarding...
├── .github/workflows/       # CI: IITC artifact sync + build + dependency audit
├── data/                    # ⛔ generated locally, gitignored (personal data)
└── dist/                    # ⛔ build output, gitignored
```

---

## Privacy & data boundaries

- Browser mode: **no files are uploaded** — everything is parsed in the page by `src/lib/ingestCore.js`;
- CLI mode: only reads the `--src` directory and writes to `--out`; the **source directory is never modified**;
- `data/`, `raw/`, `node_modules/` and `dist/` are all excluded by `.gitignore`;
- Badge icons are hotlinked from [ingress.plus](https://ingress.plus/badges) and are not stored in this repository; map tiles come from [OpenFreeMap](https://openfreemap.org/) / OpenStreetMap;
- `npm run build` copies only `meta.json`, `dashboard.json`, `portals.geojson`, `events.json` and `opr.geojson` into `dist/data` (`DATA-NOTES.md` and the raw export are never copied). `meta.json` still contains the profile / Comm text, and `events.json` / `portals.geojson` contain precise locations — **these are still real personal data**;
- The IITC plugin makes no network requests, but stores coordinates at roughly 1 m precision, interaction counts and first / last visit timestamps in `intel.ingress.com`'s localStorage, readable by same-origin scripts; see the "IITC plugin" section above.

> **About deployment**: this tool is designed for **local deployment**. The build output can technically be hosted on a static server, but a GDPR export contains sensitive personal information (precise locations, timestamps, e-mail, devices), so **online deployment is not recommended** — the files in `dist/data` are your real data, so **never host `dist/` publicly**.

---

## ROADMAP

- [x] Trajectory playback (time-compression rates, no interpolation across long gaps, dwell aggregation, activity calendar)
- [x] IITC plugin

---

## Disclaimer

- This site / tool is a **fan-made project, not affiliated with Niantic Inc.**; **Ingress is a registered trademark of Niantic Inc.**
- The code of this project was implemented by AI.
- This project **distributes and contains no raw personal data files**; README screenshots are synthetic or redacted. Users are responsible for storing and handling their own GDPR exports.
- Badge icons are copyrighted by their respective owners and hotlinked from ingress.plus; map data © OpenStreetMap contributors, © OpenFreeMap.
- Credits: [UPC-UPV-for-IITC](https://github.com/Choujingress/UPC-UPV-for-IITC) (concept reference), [cantonres/.github](https://github.com/cantonres/.github) (in-game terminology from the community onboarding tutorials), [md-atlas](https://github.com/ReiiNoki/md-atlas) (Intel-style basemap reference), [ingress.plus](https://ingress.plus/badges) (badge icons).

## License

[MIT](LICENSE) — see the [LICENSE](LICENSE) file.
