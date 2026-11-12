// Shared ingestion core used by BOTH the Node CLI (scripts/ingest.mjs) and
// the browser onboarding flow (src/components/Onboarding.jsx).
// Pure functions only: input is file contents (strings), no fs/network here.

// ---------------------------------------------------------------------------
// Event classification
// ---------------------------------------------------------------------------
export const EVENT_CATEGORIES = [
  ["deploy", /^resonator deployed$/],
  ["upgrade", /^resonator upgraded$/],
  ["mod", /^mod deployed$/],
  ["attack", /^(fired weapon|resonator destroyed from portal|last resonator on portal destroyed)$/],
  ["hack", /^hacked /],
  ["capture", /^captured portal$/],
  ["link", /^created link$/],
  ["field", /^created field$/],
  ["portal_edit", /^portal edit or submission/],
  ["recharge", /^recharged resonator/],
  ["item", /^(dropped item|item recycled|picked up)/],
  ["login", /^login$/],
  ["location", /^location update$/],
];

export function categorize(trigger) {
  for (const [cat, re] of EVENT_CATEGORIES) if (re.test(trigger)) return cat;
  return "other";
}

// ---------------------------------------------------------------------------
// Time series definitions (file -> display name, unit, aggregation mode)
//   sum    : Value column is a per-event quantity.
//   count  : one row = one event / entity-day; Value column unreliable.
//   avg    : Value is a level snapshot; show the mean level.
//   max    : Value is a per-entity cumulative snapshot; show running peak.
// ---------------------------------------------------------------------------
export const SERIES = [
  ["kilometers_walked.tsv", "步行里程", "km", "sum"],
  ["xm_collected.tsv", "XM 收集量", "XM", "sum"],
  ["xm_recharged.tsv", "XM 充能", "XM", "sum"],
  ["hacks.tsv", "Hack 次数", "次", "sum"],
  ["deploys.tsv", "部署次数", "次", "sum"],
  ["mods_deployed.tsv", "安装 mod", "次", "sum"],
  ["resonators_destroyed.tsv", "炸脚（摧毁谐振器）", "个", "sum"],
  ["links_created.tsv", "拉 link", "条", "sum"],
  ["fields_created.tsv", "盖 field（控制场）", "个", "sum"],
  ["fields_destroyed.tsv", "摧毁 field", "个", "sum"],
  ["link_destroyed.tsv", "摧毁 link", "条", "sum"],
  ["glyph_hack_points.tsv", "画图得分（Glyph Hack）", "分", "sum"],
  ["link_length_kilometers.tsv", "link 长度", "km", "sum"],
  ["portals_captured.tsv", "占领 Portal", "次", "count"],
  ["portals_neutralized.tsv", "击碎 Portal", "次", "count"],
  ["missions_completed.tsv", "完成 mission", "次", "count"],
  ["magnus_builder_slots_deployed.tsv", "Magnus builder 槽位", "个", "count"],
  ["field_held_days.tsv", "field 驻守", "个·天", "count"],
  ["link_held_days.tsv", "link 驻守", "条·天", "count"],
  ["portal_held_days.tsv", "portal 驻守", "个·天", "count"],
  ["comm_mentions.tsv", "Comm 提及", "次", "count"],
  ["mind_units_controlled.tsv", "控制 MU 水平", "MU", "avg"],
  ["mind_units_times_days_held.tsv", "MU·天（单域峰值）", "MU·天", "max"],
  ["link_length_kilometers_times_days_held.tsv", "link·天（单域峰值）", "km·天", "max"],
];

// ---------------------------------------------------------------------------
// Small parse helpers
// ---------------------------------------------------------------------------
export function readTsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  return lines.map((l) => l.split("\t"));
}

function dateKey(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function dayEpoch(key) {
  const [y, mo, d] = key.split("-").map(Number);
  return Date.UTC(y, mo - 1, d) / 1000;
}

function gameLogTs(dateStr) {
  const m = /^(\d{4}) (\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(dateStr);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) / 1000;
}

function aggregate(rows, mode) {
  const byDay = new Map();
  const byMonth = new Map();
  const byYear = new Map();
  for (const [dk, v] of rows) {
    const ts = dayEpoch(dk);
    const mk = dk.slice(0, 7);
    const yk = dk.slice(0, 4);
    if (mode === "avg") {
      for (const [map, key] of [[byDay, ts], [byMonth, mk], [byYear, yk]]) {
        const a = map.get(key) ?? { sum: 0, n: 0 };
        a.sum += v;
        a.n++;
        map.set(key, a);
      }
    } else if (mode === "max") {
      byDay.set(ts, Math.max(byDay.get(ts) ?? -Infinity, v));
      byMonth.set(mk, Math.max(byMonth.get(mk) ?? -Infinity, v));
      byYear.set(yk, Math.max(byYear.get(yk) ?? -Infinity, v));
    } else {
      byDay.set(ts, (byDay.get(ts) ?? 0) + v);
      byMonth.set(mk, (byMonth.get(mk) ?? 0) + v);
      byYear.set(yk, (byYear.get(yk) ?? 0) + v);
    }
  }
  const toPts = (entries, keyToTs) =>
    entries
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([k, a]) => {
        const ts = keyToTs(k);
        const val = mode === "avg" ? a.sum / a.n : a;
        return [ts, Math.round(val * 100) / 100];
      });
  return {
    d: toPts([...byDay.entries()], (k) => k),
    m: toPts([...byMonth.entries()], (k) => dayEpoch(`${k}-01`)),
    y: toPts([...byYear.entries()], (k) => dayEpoch(`${k}-01-01`)),
  };
}

// ---------------------------------------------------------------------------
// game_log: merge (dedupe by full row), classify, filter to coords
// ---------------------------------------------------------------------------
export function parseGameLog(texts) {
  const seen = new Set();
  const events = [];
  const fieldDates = []; // "created field" has no coords but has a timestamp
  let logRows = 0;
  let duplicateRows = 0;
  let firstTs = Infinity;
  let lastTs = -Infinity;
  for (const text of texts) {
    const rows = readTsv(text);
    for (let i = 1; i < rows.length; i++) {
      const [time, latS, lngS, trigger, comment] = rows[i];
      const key = `${time}|${latS}|${lngS}|${trigger}|${comment ?? ""}`;
      if (seen.has(key)) {
        duplicateRows++;
        continue;
      }
      seen.add(key);
      logRows++;
      const ts = gameLogTs(time);
      if (ts) {
        if (ts < firstTs) firstTs = ts;
        if (ts > lastTs) lastTs = ts;
        if (trigger === "created field") fieldDates.push(new Date(ts * 1000).toISOString().slice(0, 10));
      }
      const lat = parseFloat(latS);
      const lng = parseFloat(lngS);
      if (Number.isFinite(lat) && Number.isFinite(lng) && ts) {
        events.push({ ts, lat, lng, cat: categorize(trigger ?? "") });
      }
    }
  }
  return {
    events,
    fieldDates,
    logRows,
    duplicateRows,
    firstTs: Number.isFinite(firstTs) ? firstTs : null,
    lastTs: Number.isFinite(lastTs) ? lastTs : null,
  };
}

// ---------------------------------------------------------------------------
// Portals: aggregate portal-anchored events on a 5dp (~1m) grid
// ---------------------------------------------------------------------------
const PORTAL_ANCHORED = new Set(["hack", "capture", "deploy", "upgrade", "mod", "link"]);

export function buildPortalFeatures(events) {
  const portalAgg = new Map();
  for (const e of events) {
    if (!PORTAL_ANCHORED.has(e.cat)) continue;
    const key = `${e.lat.toFixed(5)},${e.lng.toFixed(5)}`;
    const p =
      portalAgg.get(key) ?? { any: 0, h: 0, c: 0, d: 0, u: 0, m: 0, lat: e.lat, lng: e.lng };
    p.any++;
    if (e.cat === "hack") p.h++;
    else if (e.cat === "capture") p.c++;
    else if (e.cat === "deploy") p.d++;
    else if (e.cat === "upgrade") p.u++;
    else if (e.cat === "mod") p.m++;
    portalAgg.set(key, p);
  }
  const features = [...portalAgg.entries()].map(([key, p]) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [p.lng, p.lat] },
    properties: {
      s: p.c > 0 ? "captured" : "visited",
      c: p.c,
      h: p.h,
      d: p.d,
      u: p.u,
      m: p.m,
    },
  }));
  const stats = {
    upv: features.length,
    captured: features.filter((f) => f.properties.s === "captured").length,
    visitedOnly: features.filter((f) => f.properties.s === "visited").length,
    total: features.length,
  };
  return { features, stats };
}

// ---------------------------------------------------------------------------
// Events: compact columnar format + client-side GeoJSON conversion
// ---------------------------------------------------------------------------
export function buildEventsCompact(events) {
  const catList = [...EVENT_CATEGORIES.map(([c]) => c), "other"];
  const catIndex = new Map(catList.map((c, i) => [c, i]));
  const rows = events.map((e) => [
    e.ts,
    Math.round(e.lng * 1e6) / 1e6,
    Math.round(e.lat * 1e6) / 1e6,
    catIndex.get(e.cat) ?? catList.length - 1,
  ]);
  return { cats: catList, events: rows };
}

export function eventsToGeoJSON(compact, activeCats = null) {
  const wanted = activeCats ? new Set(activeCats) : null;
  const features = [];
  for (const [t, lng, lat, ci] of compact.events) {
    const c = compact.cats[ci];
    if (wanted && !wanted.has(c)) continue;
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lng, lat] },
      properties: { t, c },
    });
  }
  return { type: "FeatureCollection", features };
}

// ---------------------------------------------------------------------------
// Dashboard series from Time/Value (+ comm Time/Message) file texts
// fileTexts: Map of lowercased filename -> full text
// ---------------------------------------------------------------------------
export function buildSeries(fileTexts) {
  const series = [];
  for (const [file, name, unit, mode] of SERIES) {
    const text = fileTexts.get(file.toLowerCase());
    if (!text) continue;
    const raw = readTsv(text)
      .slice(1)
      .filter((r) => r.length >= 2 && dateKey(r[0]));
    let rows;
    if (mode === "count") {
      rows = raw.map((r) => [dateKey(r[0]), 1]);
    } else {
      rows = raw.map((r) => [dateKey(r[0]), parseFloat(r[1]) || 0]);
    }
    const points = aggregate(rows, mode === "avg" || mode === "max" ? mode : "sum");
    const total =
      mode === "max"
        ? Math.max(...points.m.map(([, v]) => v))
        : points.m.reduce((a, [, v]) => a + v, 0);
    series.push({
      id: file.replace(".tsv", ""),
      name,
      unit,
      mode,
      points,
      total: Math.round(total * 100) / 100,
    });
  }
  return series;
}

// Time series derived ONLY from game_log event timestamps. Used in the
// lightweight onboarding mode (just game_log) so the dashboard is not empty.
const GL_SERIES = [
  ["hack", "Hack 次数（事件计数）", "次"],
  ["deploy", "插脚次数（事件计数）", "次"],
  ["upgrade", "抬脚次数（事件计数）", "次"],
  ["mod", "安装 mod（事件计数）", "次"],
  ["capture", "占领次数（事件计数）", "次"],
  ["attack", "开火 / 炸脚（事件计数）", "次"],
  ["link", "拉 link（事件计数）", "条"],
  ["field", "盖 field（事件计数）", "个"],
  ["portal_edit", "Portal 提交/编辑（事件计数）", "次"],
  ["recharge", "充能（事件计数）", "次"],
];

export function buildGameLogSeries(parsed) {
  const series = [];
  const mk = (id, name, unit, rows) => {
    if (rows.length === 0) return;
    const points = aggregate(rows, "sum");
    series.push({
      id: `gl_${id}`,
      name,
      unit,
      mode: "sum",
      points,
      total: Math.round(points.m.reduce((a, [, v]) => a + v, 0) * 100) / 100,
    });
  };
  for (const [cat, name, unit] of GL_SERIES) {
    const rows = cat === "field"
      ? parsed.fieldDates.map((dk) => [dk, 1])
      : parsed.events
          .filter((e) => e.cat === cat)
          .map((e) => [new Date(e.ts * 1000).toISOString().slice(0, 10), 1]);
    mk(cat, name, unit, rows);
  }
  return series;
}

export function parseComm(text) {
  return readTsv(text)
    .slice(1)
    .map((r) => [r[0] ?? "", r[1] ?? ""]);
}

// ---------------------------------------------------------------------------
// OPR: OprSubmissionLog.csv -> suggested-location points + stats
// ---------------------------------------------------------------------------
export function parseOpr(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  let header = [];
  const rows = [];
  for (const [i, line] of lines.entries()) {
    const cells = (line.match(/("[^"]*")|([^,]+)/g) ?? []).map((s) => s.replace(/^"|"$/g, ""));
    if (i === 0) header = cells;
    else rows.push(cells);
  }
  const gi = (name) => header.indexOf(name);
  const parseGmt = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) GMT/.exec(s ?? "");
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) / 1000 : null;
  };
  const locIdx = gi("Suggested Location");
  const timeIdx = gi("Time");
  const candIdx = gi("Candidate ID");
  const features = [];
  let firstTs = Infinity;
  let lastTs = -Infinity;
  for (const r of rows) {
    const ts = parseGmt(r[timeIdx]);
    if (ts) {
      if (ts < firstTs) firstTs = ts;
      if (ts > lastTs) lastTs = ts;
    }
    const loc = (r[locIdx] ?? "").trim();
    const m = /^(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$/.exec(loc);
    if (m && ts) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [parseFloat(m[2]), parseFloat(m[1])] },
        properties: { t: ts, i: (r[candIdx] ?? "").slice(0, 8) },
      });
    }
  }
  return {
    features,
    stats: {
      reviews: rows.length,
      withLocation: features.length,
      firstTs: Number.isFinite(firstTs) ? firstTs : null,
      lastTs: Number.isFinite(lastTs) ? lastTs : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Badges: profile.txt "Badges:" section (icon URL resolution done by caller)
// ---------------------------------------------------------------------------
export function parseBadges(profileText) {
  const badges = [];
  const section = profileText.split(/^Badges:\s*$/m)[1];
  if (!section) return badges;
  for (const line of section.split(/\r?\n/)) {
    const m = /^\t(\S+)\s+(.+?)\s+at\s+(.+)$/.exec(line);
    if (!m) continue;
    badges.push({ tier: m[1], name: m[2], date: m[3].trim() });
  }
  // Chronological order (earliest earned first).
  badges.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  return badges;
}
