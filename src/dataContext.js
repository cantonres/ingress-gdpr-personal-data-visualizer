import { createContext, useContext } from "react";
import { BADGE_CATALOG, SPECIAL_ICONS, PLACEHOLDER_ICON } from "./data/badgeCatalog.js";
import {
  parseGameLog,
  buildPortalFeatures,
  buildEventsCompact,
  buildSeries,
  buildGameLogSeries,
  parseOpr,
  parseBadges,
  parseComm,
} from "./lib/ingestCore.js";

// Central data source for the whole app. Two modes:
//  - "pregenerated": data/ produced by `npm run ingest` (the typical local setup)
//  - "local": the user picked files/folder in the onboarding screen and the
//    browser parsed them with the shared ingestCore.
// Components receive everything through useData() and never fetch themselves,
// except lazy bulk layers (events/opr) which go through getEvents()/getOpr().

const DataContext = createContext(null);

export { DataContext };

export function useData() {
  return useContext(DataContext);
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

export async function loadPreGenerated() {
  const [meta, dashboard, portalsFC] = await Promise.all([
    fetchJson("data/meta.json"),
    fetchJson("data/dashboard.json"),
    fetchJson("data/portals.geojson"),
  ]);
  return {
    mode: "pregenerated",
    meta,
    dashboard,
    portalsFC,
    getEvents: async () => fetchJson("data/events.json"),
    getOpr: meta.opr ? async () => fetchJson("data/opr.geojson") : null,
  };
}

// Browser-side ingestion of user-picked files. `files` is an array of
// File objects (either the whole export folder or just game_log files).
// Mirrors scripts/ingest.mjs via the shared ingestCore, entirely in-browser.
export async function ingestFromFiles(files) {
  const texts = new Map(); // lowercased filename -> text
  for (const f of files) texts.set(f.name.toLowerCase(), await f.text());

  const glTexts = [...texts.entries()]
    .filter(([name]) => name.startsWith("game_log") && name.endsWith(".tsv"))
    .map(([, text]) => text);
  if (glTexts.length === 0) {
    throw new Error("所选内容中没有 game_log*.tsv 文件");
  }

  const parsed = parseGameLog(glTexts);
  const { features: portalFeatures, stats: portalStats } = buildPortalFeatures(parsed.events);
  const compact = buildEventsCompact(parsed.events);
  const fileSeries = buildSeries(texts);
  // game_log alone can still power event-count curves; when the full folder
  // is present the dedicated TSV series are preferred (no duplicates).
  const series = fileSeries.length > 0 ? fileSeries : buildGameLogSeries(parsed);

  const profile = texts.get("profile.txt") ?? null;
  let badges = [];
  if (profile) {
    // Bundled catalog (no cross-origin fetch — ingress.plus blocks browser CORS).
    badges = parseBadges(profile).map((b) => {
      const tierKey = b.tier.toLowerCase() === "black" ? "onyx" : b.tier.toLowerCase();
      const url =
        BADGE_CATALOG[`${b.name} - ${b.tier}`.toLowerCase()] ??
        BADGE_CATALOG[`${b.name} - ${tierKey}`.toLowerCase()] ??
        SPECIAL_ICONS[b.name.toLowerCase()] ??
        PLACEHOLDER_ICON;
      return { ...b, iconUrl: url };
    });
  }

  const oprText = texts.get("oprsubmissionlog.csv");
  const oprParsed = oprText ? parseOpr(oprText) : null;

  const meta = {
    generatedAt: new Date().toISOString(),
    portals: portalStats,
    gameLog: {
      files: glTexts.map((_, i) => `game_log #${i + 1}`),
      uniqueRows: parsed.logRows,
      duplicatesRemoved: parsed.duplicateRows,
      coordEvents: parsed.events.length,
      eventsInFile: compact.events.length,
      firstTs: parsed.firstTs,
      lastTs: parsed.lastTs,
    },
    commMentions: texts.get("comm_mentions.tsv") ? parseComm(texts.get("comm_mentions.tsv")) : [],
    opr: oprParsed?.stats ?? null,
    badges,
    profile,
    devices: texts.get("devices.txt") ?? null,
    recursions: texts.get("recursions.tsv") ?? null,
    storePurchases: texts.get("store_purchases.tsv") ?? null,
  };

  return {
    mode: "local",
    meta,
    dashboard: { series },
    portalsFC: { type: "FeatureCollection", features: portalFeatures },
    getEvents: async () => compact,
    getOpr: oprParsed
      ? async () => ({ type: "FeatureCollection", features: oprParsed.features })
      : null,
  };
}
