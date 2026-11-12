#!/usr/bin/env node
// Preprocess a Niantic Ingress GDPR export into JSON/GeoJSON consumed by the app.
// The source directory is READ-ONLY: this script never writes into it.
// All parsing/aggregation logic lives in src/lib/ingestCore.js, shared with
// the browser onboarding flow so both paths produce identical output.
//
// Usage: node scripts/ingest.mjs --src <gdpr export dir> [--out <data dir>]

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  parseGameLog,
  buildPortalFeatures,
  buildEventsCompact,
  buildSeries,
  parseOpr,
  parseBadges,
  parseComm,
  readTsv,
} from "../src/lib/ingestCore.js";

const DEFAULT_OUT = "data";

function parseArgs() {
  const args = { src: null, out: DEFAULT_OUT };
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === "--src") args.src = process.argv[++i];
    if (process.argv[i] === "--out") args.out = process.argv[++i];
  }
  return args;
}

import { BADGE_CATALOG, SPECIAL_ICONS, PLACEHOLDER_ICON } from "../src/data/badgeCatalog.js";

async function fetchBadgeCatalog() {
  // Bundled catalog is always available; a live fetch may add newer icons.
  const catalog = new Map(Object.entries(BADGE_CATALOG)); // "name - tier" -> URL
  try {
    const res = await fetch("https://ingress.plus/badges");
    const html = await res.text();
    const re = /<img[^>]*alt="([^"]+)"[^>]*src="(\/api\/files\/[^"]+)"/g;
    let mm;
    while ((mm = re.exec(html))) {
      catalog.set(mm[1].toLowerCase(), `https://ingress.plus${mm[2]}`);
    }
    console.log(`badge catalog: ${catalog.size} icons (bundled + live)`);
  } catch (e) {
    console.warn(`badge catalog fetch failed (${e.message}); icons fall back to placeholder`);
  }
  return catalog;
}

function resolveBadgeIcons(badges, catalog) {
  return badges.map((b) => {
    const tierKey = b.tier.toLowerCase() === "black" ? "onyx" : b.tier.toLowerCase();
    const url =
      catalog.get(`${b.name} - ${b.tier}`.toLowerCase()) ??
      catalog.get(`${b.name} - ${tierKey}`.toLowerCase()) ??
      SPECIAL_ICONS[b.name.toLowerCase()] ??
      PLACEHOLDER_ICON;
    return { ...b, iconUrl: url };
  });
}

const GAME_LOG_FILES = [
  "game_log.tsv",
  "game_log - Copy.tsv",
  "game_log - Copy (2).tsv",
];

// ---------------------------------------------------------------------------
async function main() {
  const { src, out } = parseArgs();
  if (!src) {
    console.error("Missing required --src <gdpr export dir>");
    process.exit(1);
  }
  if (!existsSync(src)) {
    console.error(`Source dir not found: ${src}`);
    process.exit(1);
  }
  mkdirSync(out, { recursive: true });
  console.log(`Source (read-only): ${src}`);
  console.log(`Output: ${resolve(out)}`);

  // ---- game_log: merge, dedupe, classify ----------------------------------
  const glTexts = GAME_LOG_FILES.filter((f) => existsSync(join(src, f))).map((f) =>
    readFileSync(join(src, f), "utf8"),
  );
  const parsed = parseGameLog(glTexts);
  const { events } = parsed;
  console.log(`game_log merged: ${parsed.logRows} unique rows, ${parsed.duplicateRows} duplicates removed`);
  console.log(`events with coords: ${events.length}`);

  // ---- portals.geojson: derived from game_log ONLY ------------------------
  const { features: portalFeatures, stats: portalStats } = buildPortalFeatures(events);
  writeFileSync(
    join(out, "portals.geojson"),
    JSON.stringify({ type: "FeatureCollection", features: portalFeatures }),
  );
  console.log("portals.geojson:", portalStats);

  // ---- events.json: FULL data, no sampling --------------------------------
  const compact = buildEventsCompact(events);
  writeFileSync(join(out, "events.json"), JSON.stringify(compact));
  console.log(`events.json: ${compact.events.length} events (full, no sampling)`);

  // ---- dashboard.json: series from Time/Value files -----------------------
  const fileTexts = new Map();
  for (const name of [
    "kilometers_walked.tsv", "xm_collected.tsv", "xm_recharged.tsv", "hacks.tsv",
    "deploys.tsv", "mods_deployed.tsv", "resonators_destroyed.tsv", "links_created.tsv",
    "fields_created.tsv", "fields_destroyed.tsv", "link_destroyed.tsv", "glyph_hack_points.tsv",
    "link_length_kilometers.tsv", "portals_captured.tsv", "portals_neutralized.tsv",
    "missions_completed.tsv", "magnus_builder_slots_deployed.tsv", "field_held_days.tsv",
    "link_held_days.tsv", "portal_held_days.tsv", "comm_mentions.tsv",
    "mind_units_controlled.tsv", "mind_units_times_days_held.tsv",
    "link_length_kilometers_times_days_held.tsv",
  ]) {
    const p = join(src, name);
    if (existsSync(p)) fileTexts.set(name.toLowerCase(), readFileSync(p, "utf8"));
  }
  const series = buildSeries(fileTexts);
  writeFileSync(join(out, "dashboard.json"), JSON.stringify({ series }));
  console.log(`dashboard.json: ${series.length} series`);

  // ---- OPR -----------------------------------------------------------------
  let opr = null;
  const oprPath = join(src, "OprSubmissionLog.csv");
  if (existsSync(oprPath)) {
    const parsedOpr = parseOpr(readFileSync(oprPath, "utf8"));
    opr = parsedOpr.stats;
    writeFileSync(
      join(out, "opr.geojson"),
      JSON.stringify({ type: "FeatureCollection", features: parsedOpr.features }),
    );
    console.log(`opr.geojson: ${parsedOpr.features.length} suggested-location points (${opr.reviews} reviews)`);
  }

  // ---- badges ---------------------------------------------------------------
  const catalog = await fetchBadgeCatalog();
  const badges = resolveBadgeIcons(parseBadges(readFileSync(join(src, "profile.txt"), "utf8")), catalog);
  const unmatched = badges.filter((b) => b.iconUrl === PLACEHOLDER_ICON).length;
  console.log(`badges parsed: ${badges.length} (${unmatched} without catalog icon)`);

  // ---- misc text -------------------------------------------------------------
  const readText = (f) => (existsSync(join(src, f)) ? readFileSync(join(src, f), "utf8") : "");

  const meta = {
    generatedAt: new Date().toISOString(),
    portals: portalStats,
    gameLog: {
      files: GAME_LOG_FILES,
      uniqueRows: parsed.logRows,
      duplicatesRemoved: parsed.duplicateRows,
      coordEvents: events.length,
      eventsInFile: compact.events.length,
      firstTs: parsed.firstTs,
      lastTs: parsed.lastTs,
    },
    commMentions: readText("comm_mentions.tsv") ? parseComm(readText("comm_mentions.tsv")) : [],
    opr,
    badges,
    profile: readText("profile.txt"),
    devices: readText("devices.txt"),
    recursions: readText("recursions.tsv"),
    storePurchases: readText("store_purchases.tsv"),
    oprProfile: readText("OprProfile.csv"),
  };
  writeFileSync(join(out, "meta.json"), JSON.stringify(meta, null, 2));

  const sizes = ["portals.geojson", "events.json", "dashboard.json", "meta.json"]
    .map((f) => `${f}: ${(readFileSync(join(out, f)).length / 1048576).toFixed(2)} MB`)
    .join("\n");
  console.log(`\nDone.\n${sizes}`);
}

await main();
