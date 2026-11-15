// ==UserScript==
// @id             gdpr-visualizer@choujingress
// @name           GDPR Visualizer
// @category       Layer
// @version        0.4.2
// @description    Overlay your own Ingress GDPR export on the intel map: per-portal interaction counts, first/last visit and raw event dots. Local-only - nothing is uploaded.
// @author         Choujingress
// @namespace      ingress-gdpr-visualizer
// @downloadURL    https://github.com/cantonres/ingress-gdpr-personal-data-visualizer/raw/main/iitc/gdpr-visualizer.user.js
// @updateURL      https://github.com/cantonres/ingress-gdpr-personal-data-visualizer/raw/main/iitc/gdpr-visualizer.user.js
// @supportURL     https://github.com/cantonres/ingress-gdpr-personal-data-visualizer/issues
// @match          https://intel.ingress.com/*
// @include        https://intel.ingress.com/*
// @grant          none
// @run-at         document-idle
// @noframes
// ==/UserScript==

// GDPR Visualizer for IITC-CE - M2
//
// What this layer is for: the IITC core already knows whether a portal was
// visited / captured (boolean `history` flags, `highlight-portal-history`).
// A GDPR export knows more than that - how often, and when. This layer adds
// only that extra dimension, and deliberately never touches portal
// `fillColor` so the core highlighter keeps working next to it.
//
// Rendering: one <canvas> above the marker pane, pointer-events: none.
//   - ring around each portal: colour + radius by interaction count
//   - count label above the ring (zoom >= 14, or forced from the panel)
//   - hover tooltip: first / last visit, gap, per-category breakdown
//   - optional event dots, viewport-clipped, capped, no time slider
//
// Data source (NO companion tool needed):
//   - Preferred: raw GDPR export, i.e. game_log*.tsv (one or several snapshots),
//     selected as multiple files or as the whole export folder.
//     Parsing uses the SAME ingestCore as the companion web app, so portal
//     coordinates and counts match between the two tools.
//
// The raw TSV text is parsed in memory and then discarded; the compact portal
// index is persisted in localStorage under the intel.ingress.com origin, the
// event points live in memory for the session only. No network requests.

/* exported setup, changelog --eslint */
/* global IITC, IGV_CORE -- eslint */

var changelog = [
  {
    version: '0.1.0',
    changes: ['M1: portals.geojson import, GDPR portal highlighter (captured/visited), toolbox import/clear'],
  },
  {
    version: '0.2.0',
    changes: [
      'Direct import of raw game_log*.tsv (multi-file / whole folder), using the shared ingestCore',
      'Persistent status display (portal count, UPC count, time span)',
      'portals.geojson kept as a compatibility input',
    ],
  },
  {
    version: '0.3.0',
    changes: [
      'One toolbox entry ("GDPR data visualizer") opening a menu instead of three separate links',
      'The highlighter is switched on automatically after import, so the map updates immediately',
      'Menu shows how many portals in the current view matched, plus the data time span',
      'Map jumps to the imported data when the current view has no match',
    ],
  },
  {
    version: '0.4.2',
    changes: [
      'UPV now includes captured portals (UPC is a subset of UPV), so UPV is never smaller than UPC and coverage is not double-counted',
    ],
  },
  {
    version: '0.4.1',
    changes: [
      'Event dots are square (matching the legend swatches) and are drawn from Leaflet-projected coordinates, so they stay on the ground while dragging',
      'One dot per category per 4px cell (same-category overlap is invisible, different categories stay visible)',
      'Event dots start with only "attack" selected; every category is one tick away',
      'Only game_log*.tsv can be imported: folder picking and the portals.geojson fallback were removed',
      'Panel statistics count only the portals inside the current view (IITC keeps off-screen portals in memory)',
      'Ring size scales continuously with zoom instead of snapping at fixed bands',
    ],
  },
  {
    version: '0.4.0',
    changes: [
      'Rewritten as an overlay layer (category: Layer) that never writes portal fillColor, so it coexists with the core portal-history highlighter',
      'Ring colour/radius by interaction count, with the count drawn above the ring',
      'Count tiers adapt to the imported dataset (p50 / p80 / p95) instead of fixed 1 / 5 / 20 bins',
      'Hover tooltip: first visit, last visit, gap and per-category breakdown',
      'Optional raw event dots (viewport-clipped, per-category toggles, no time slider)',
      'Event dots are no longer capped: every event in view is considered, with a 4px screen-cell de-duplication so overlapping dots at one portal draw once',
      'Each event category is independent, so enabling one no longer starves the others',
      'Ring, label and hover sizes follow the zoom continuously instead of snapping at fixed bands',
      'Event category list is built from the imported data: categories without coordinates (field) never appear, and the tick marks stay in sync with the map',
      'Panel shows UPV/UPC counts and coverage for the current view',
      'UPV/UPC two-colour mode removed - the IITC core already covers it',
    ],
  },
];

var LS_KEY = 'plugin-gdpr-data';
var NEIGHBORHOOD = 2; // +/-2 cells on the 1e-6 grid, about +/-2 m tolerance
var PANEL_ID = 'gdpr-panel';
var CANVAS_ID = 'gdpr-canvas';
var TIP_ID = 'gdpr-tip';

// Portal-anchored categories, same set as ingestCore.buildPortalFeatures.
var PORTAL_ANCHORED = { hack: 1, capture: 1, deploy: 1, upgrade: 1, mod: 1, link: 1 };

// Interaction-count tiers: ring colour + radius. Numbers are drawn separately.
// The breakpoints are recomputed from the imported data (see computeTiers), so
// these values are only the fallback for small or empty datasets.
var TIERS = [
  { max: 1, color: '#6b8fa3', radius: 11 },
  { max: 5, color: '#3fa9c9', radius: 14 },
  { max: 20, color: '#e8a33d', radius: 17 },
  { max: Infinity, color: '#e5533d', radius: 20 },
];

var EVENT_COLORS = {
  hack: '#1D9E75',
  capture: '#E8A33D',
  deploy: '#378ADD',
  upgrade: '#7F77DD',
  mod: '#D4537E',
  link: '#5DCAA5',
  field: '#85B7EB',
  attack: '#E24B4A',
  portal_edit: '#B4B2A9',
  recharge: '#F0997B',
  item: '#888780',
  login: '#639922',
  location: '#AFA9EC',
  other: '#5F5E5A',
};

/*__IGV_CORE__*/

window.plugin = window.plugin || {}; // standalone userscript may run before IITC core
window.plugin.gdpr = function () {};

// index: Map "<latE6>_<lngE6>" -> record array
//   [0] any     interaction count (all portal-anchored events)
//   [1] captures
//   [2] hacks
//   [3] deploys
//   [4] upgrades
//   [5] mods
//   [6] links
//   [7] firstTs (seconds, 0 when unknown)
//   [8] lastTs  (seconds, 0 when unknown)
var R_ANY = 0;
var R_CAP = 1;
var R_HACK = 2;
var R_DEPLOY = 3;
var R_UPGRADE = 4;
var R_MOD = 5;
var R_LINK = 6;
var R_FIRST = 7;
var R_LAST = 8;

window.plugin.gdpr.index = new Map();
window.plugin.gdpr.stats = { portals: 0, captured: 0, visited: 0, events: 0 };
window.plugin.gdpr.meta = null; // { source, firstTs, lastTs, rows, duplicates }
window.plugin.gdpr.events = null; // { ts, lat, lng, cat, cats } typed arrays
window.plugin.gdpr.matchList = [];
window.plugin.gdpr.viewStats = { total: 0, upv: 0, upc: 0, coverage: 0 };
window.plugin.gdpr.layerOn = true;
window.plugin.gdpr.numbersForce = false;
window.plugin.gdpr.eventsOn = false;
window.plugin.gdpr.catOn = {};
window.plugin.gdpr.saveFailed = false;
window.plugin.gdpr.tiers = TIERS;

window.plugin.gdpr.readText = function (file) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function () { resolve(reader.result); };
    reader.onerror = function () { reject(reader.error); };
    reader.readAsText(file);
  });
};

function gdprCatNames() {
  var cats = [];
  // IGV_CORE is a bundled local var, not a window property (userscript sandboxes
  // wrap the file in a function) - referencing window.IGV_CORE yields undefined.
  if (typeof IGV_CORE !== 'undefined' && IGV_CORE.EVENT_CATEGORIES) {
    cats = IGV_CORE.EVENT_CATEGORIES.map(function (c) { return c[0]; });
  }
  cats.push('other');
  return cats;
}

// Default selection when event dots are switched on: attack only. It is the
// sparse, interesting category; hacks and captures would bury it. If the
// export has no attacks at all, fall back to everything so the layer is never
// silently empty.
function gdprDefaultCats() {
  var names = gdprEventCatNames();
  for (var i = 0; i < names.length; i++) {
    if (names[i] === 'attack') return ['attack'];
  }
  return names;
}

window.plugin.gdpr.defaultCats = gdprDefaultCats;

window.plugin.gdpr.setAllCats = function (on, names) {
  var cats = names || gdprCatNames();
  for (var i = 0; i < cats.length; i++) window.plugin.gdpr.catOn[cats[i]] = !!on;
};

window.plugin.gdpr.recomputeStats = function () {
  var captured = 0;
  var visitedOnly = 0;
  window.plugin.gdpr.index.forEach(function (rec) {
    if (rec[R_CAP] > 0) captured++;
    else visitedOnly++;
  });
  window.plugin.gdpr.stats.portals = captured + visitedOnly;
  window.plugin.gdpr.stats.captured = captured;
  // UPC is a subset of UPV: every captured portal was visited first, so the
  // visited count is the whole index, never "visited but not captured".
  window.plugin.gdpr.stats.visited = captured + visitedOnly;
};

window.plugin.gdpr.saveLocal = function () {
  try {
    var plain = {};
    window.plugin.gdpr.index.forEach(function (rec, key) { plain[key] = rec; });
    localStorage[LS_KEY] = JSON.stringify({
      version: 3,
      importedAt: Date.now(),
      portals: plain,
      meta: window.plugin.gdpr.meta,
    });
    window.plugin.gdpr.saveFailed = false;
  } catch (e) {
    window.plugin.gdpr.saveFailed = true;
    console.warn('GDPR Visualizer: failed to persist data (storage full?)', e);
  }
};

window.plugin.gdpr.loadLocal = function () {
  try {
    var raw = localStorage[LS_KEY];
    if (!raw) return;
    var saved = JSON.parse(raw);
    if (saved.version !== 3) {
      // v2 stored only capture counts; timestamps cannot be recovered.
      localStorage.removeItem(LS_KEY);
      window.plugin.gdpr.needsReimport = true;
      return;
    }
    var map = new Map();
    for (var key in saved.portals) {
      if (Object.prototype.hasOwnProperty.call(saved.portals, key)) map.set(key, saved.portals[key]);
    }
    window.plugin.gdpr.index = map;
    window.plugin.gdpr.meta = saved.meta || null;
    window.plugin.gdpr.recomputeStats();
    window.plugin.gdpr.computeTiers();
  } catch (e) {
    console.warn('GDPR Visualizer: failed to load saved data', e);
  }
};

// Preferred path: aggregate the parsed game_log events on the same 5dp grid the
// web app uses, so the portal set is identical, and keep first/last timestamps.
window.plugin.gdpr.buildIndexFromEvents = function (events) {
  var agg = new Map();
  for (var i = 0; i < events.length; i++) {
    var e = events[i];
    if (!PORTAL_ANCHORED[e.cat]) continue;
    var key5 = e.lat.toFixed(5) + ',' + e.lng.toFixed(5);
    var p = agg.get(key5);
    if (!p) {
      p = { lat: e.lat, lng: e.lng, any: 0, c: 0, h: 0, d: 0, u: 0, m: 0, l: 0, first: e.ts, last: e.ts };
      agg.set(key5, p);
    }
    p.any++;
    if (e.cat === 'hack') p.h++;
    else if (e.cat === 'capture') p.c++;
    else if (e.cat === 'deploy') p.d++;
    else if (e.cat === 'upgrade') p.u++;
    else if (e.cat === 'mod') p.m++;
    else if (e.cat === 'link') p.l++;
    if (e.ts < p.first) p.first = e.ts;
    if (e.ts > p.last) p.last = e.ts;
  }
  var map = new Map();
  agg.forEach(function (p) {
    var key = Math.round(p.lat * 1e6) + '_' + Math.round(p.lng * 1e6);
    map.set(key, [p.any, p.c, p.h, p.d, p.u, p.m, p.l, p.first, p.last]);
  });
  window.plugin.gdpr.index = map;
  window.plugin.gdpr.recomputeStats();
  window.plugin.gdpr.computeTiers();
};

window.plugin.gdpr.lookup = function (lat, lng) {
  var index = window.plugin.gdpr.index;
  if (!index || index.size === 0) return null;
  var latE6 = Math.round(lat * 1e6);
  var lngE6 = Math.round(lng * 1e6);
  for (var dx = -NEIGHBORHOOD; dx <= NEIGHBORHOOD; dx++) {
    for (var dy = -NEIGHBORHOOD; dy <= NEIGHBORHOOD; dy++) {
      var hit = index.get(latE6 + dx + '_' + (lngE6 + dy));
      if (hit !== undefined) return hit;
    }
  }
  return null;
};

function gdprTier(count) {
  var tiers = window.plugin.gdpr.tiers;
  for (var i = 0; i < tiers.length; i++) {
    if (count <= tiers[i].max) return tiers[i];
  }
  return tiers[tiers.length - 1];
}

// Adaptive breakpoints. Quantiles are taken over the WHOLE imported dataset,
// not the current view: a portal keeps its colour while panning, and the same
// colour means the same thing in two different cities.
// p50 / p80 / p95 splits a typical export (lots of once-visited portals, a few
// farmed ones) into four buckets that each contain real data.
window.plugin.gdpr.computeTiers = function () {
  var index = window.plugin.gdpr.index;
  var fallback = TIERS;
  if (!index || index.size < 20) {
    window.plugin.gdpr.tiers = fallback;
    return fallback;
  }
  var counts = [];
  index.forEach(function (rec) { counts.push(rec[R_ANY]); });
  counts.sort(function (a, b) { return a - b; });
  // Nearest-rank percentile: the value at or below which p of the data falls.
  var at = function (p) {
    return counts[Math.min(counts.length - 1, Math.max(0, Math.ceil(p * counts.length) - 1))];
  };
  var t1 = Math.max(1, Math.round(at(0.5)));
  var t2 = Math.max(t1 + 1, Math.round(at(0.8)));
  var t3 = Math.max(t2 + 1, Math.round(at(0.95)));
  window.plugin.gdpr.tiers = [
    { max: t1, color: TIERS[0].color, radius: TIERS[0].radius },
    { max: t2, color: TIERS[1].color, radius: TIERS[1].radius },
    { max: t3, color: TIERS[2].color, radius: TIERS[2].radius },
    { max: Infinity, color: TIERS[3].color, radius: TIERS[3].radius },
  ];
  return window.plugin.gdpr.tiers;
};

function gdprTierLabel(lo, hi) {
  if (hi === Infinity) return lo + '+';
  if (lo === hi) return String(lo);
  return lo + '-' + hi;
}

window.plugin.gdpr.tierLabels = function () {
  var tiers = window.plugin.gdpr.tiers;
  var labels = [];
  var lo = 1;
  for (var i = 0; i < tiers.length; i++) {
    labels.push(gdprTierLabel(lo, tiers[i].max));
    lo = tiers[i].max + 1;
  }
  return labels;
};

function gdprIsoDay(ts) {
  if (!ts) return null;
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

function gdprSpan(from, to) {
  if (!from || !to || to < from) return null;
  var days = Math.floor((to - from) / 86400);
  if (days < 1) return 'same day';
  if (days < 30) return days + ' d';
  var months = Math.floor(days / 30.44);
  if (months < 12) return months + ' mo';
  var years = Math.floor(months / 12);
  var rest = months % 12;
  return years + ' y' + (rest ? ' ' + rest + ' mo' : '');
}

/* ---- View matching ------------------------------------------------------
   window.portals only holds the portals IITC has loaded for the current view.
   Matching them against the index is O(portals x 25) map lookups, so it runs
   on moveend / data refresh, not on every animation frame; drawing then just
   re-projects the cached list.
-------------------------------------------------------------------------- */
window.plugin.gdpr.rebuildMatches = function () {
  var list = [];
  var total = 0;
  var matched = 0;
  var upv = 0;
  var upc = 0;
  // window.portals keeps every portal IITC has ever loaded in this session, so
  // counting it directly reports hundreds of portals when a handful are on
  // screen. Stats are limited to the current bounds; the draw list is not, so
  // rings stay put while panning and are simply culled at paint time.
  var bounds = window.map && window.map.getBounds ? window.map.getBounds() : null;
  var portals = window.portals || {};
  for (var guid in portals) {
    if (!Object.prototype.hasOwnProperty.call(portals, guid)) continue;
    var portal = portals[guid];
    var ll = portal && portal.getLatLng ? portal.getLatLng() : null;
    if (!ll) continue;
    var inView = !bounds || !bounds.contains || bounds.contains([ll.lat, ll.lng]);
    if (inView) total++;
    var rec = window.plugin.gdpr.lookup(ll.lat, ll.lng);
    if (!rec) continue;
    list.push({
      guid: guid,
      lat: ll.lat,
      lng: ll.lng,
      rec: rec,
      count: rec[R_ANY],
      tier: gdprTier(rec[R_ANY]),
    });
    if (!inView) continue;
    matched++;
    upv++; // captured portals are visited too
    if (rec[R_CAP] > 0) upc++;
  }
  window.plugin.gdpr.matchList = list;
  window.plugin.gdpr.viewStats = {
    total: total,
    matched: matched,
    upv: upv,
    upc: upc,
    coverage: total ? upv / total : 0, // upv already contains upc
  };
  return window.plugin.gdpr.viewStats;
};

/* ---- Canvas overlay ---------------------------------------------------- */
function gdprCanvas() {
  var map = window.map;
  if (!map) return null;
  var container = map.getContainer();
  var canvas = document.getElementById(CANVAS_ID);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = CANVAS_ID;
    canvas.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;z-index:620;';
    container.appendChild(canvas);
  }
  var size = map.getSize();
  var dpr = window.devicePixelRatio || 1;
  var w = Math.round(size.x * dpr);
  var h = Math.round(size.y * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  canvas.style.width = size.x + 'px';
  canvas.style.height = size.y + 'px';
  return canvas;
}

/* ---- Event dots ---------------------------------------------------------
   Dots are rebuilt once per view (moveend / zoomend / toggle) and then just
   re-projected, never scanned per frame. The old code walked newest-first and
   stopped at a global cap, so turning one category on could starve every other
   category out of the budget - the map then looked like it was drawing the
   wrong categories. Now every category has its own budget and an even stride
   across time, so a toggle only changes that category's dots.
-------------------------------------------------------------------------- */
window.plugin.gdpr.dotList = [];

// Normalised y for a latitude (Web Mercator, 0 = north edge).
function gdprMercY(lat) {
  var rad = (lat * Math.PI) / 180;
  return (1 - Math.log(Math.tan(Math.PI / 4 + rad / 2)) / Math.PI) / 2;
}

// Datasets packed elsewhere may lack the normalised arrays; derive them once.
function gdprEventMerc(ev) {
  if (ev.nx && ev.ny) return;
  var n = ev.ts.length;
  var nx = new Float64Array(n);
  var ny = new Float64Array(n);
  for (var i = 0; i < n; i++) {
    nx[i] = (ev.lng[i] + 180) / 360;
    ny[i] = gdprMercY(ev.lat[i]);
  }
  ev.nx = nx;
  ev.ny = ny;
}

window.plugin.gdpr.rebuildDots = function () {
  var groups = [];
  var ev = window.plugin.gdpr.events;
  var map = window.map;
  window.plugin.gdpr.eventDrawn = 0;
  window.plugin.gdpr.eventCapped = false;
  if (!ev || !window.plugin.gdpr.eventsOn || !map || map.getZoom() < 12) {
    window.plugin.gdpr.dotList = groups;
    return groups;
  }
  gdprEventMerc(ev);
  var zoom = map.getZoom();
  var bounds = map.getBounds();
  var boundsNw = bounds.getNorthWest ? bounds.getNorthWest() : bounds.getNorthEast();
  var scale = gdprPixelScale(map, boundsNw, map.latLngToContainerPoint([boundsNw.lat, boundsNw.lng]));
  var sLat = bounds.getSouthWest().lat;
  var wLng = bounds.getSouthWest().lng;
  var nLat = bounds.getNorthEast().lat;
  var eLng = bounds.getNorthEast().lng;

  // Build for a padded box so a small pan can reuse the set.
  var padLat = (nLat - sLat) * 0.4;
  var padLng = (eLng - wLng) * 0.4;
  var boxS = sLat - padLat;
  var boxN = nLat + padLat;
  var boxW = wLng - padLng;
  var boxE = eLng + padLng;

  var x0 = (boxW + 180) / 360;
  var x1 = (boxE + 180) / 360;
  var y0 = gdprMercY(boxN);
  var y1 = gdprMercY(boxS);

  // One dot per category per 4px cell: dots are 4px wide, so a second dot of
  // the same category in the same cell is invisible overlap, while a different
  // category must stay visible. A bitmask keeps both rules in one pass.
  var cell = 4;
  var cols = Math.ceil(((x1 - x0) * scale) / cell) + 1;
  var rows = Math.ceil(((y1 - y0) * scale) / cell) + 1;
  var grid = new Uint16Array(cols * rows);

  var nx = ev.nx;
  var ny = ev.ny;
  var names = ev.cats;
  var catOf = ev.cat;
  var coords = {};
  var order = [];
  var raw = 0;
  var i;

  for (i = ev.ts.length - 1; i >= 0; i--) {
    var name = names[catOf[i]];
    if (!window.plugin.gdpr.catOn[name]) continue;
    var px = nx[i];
    var py = ny[i];
    if (px < x0 || px > x1 || py < y0 || py > y1) continue;
    raw++;
    var col = ((px - x0) * scale / cell) | 0;
    var row = ((py - y0) * scale / cell) | 0;
    var gi = row * cols + col;
    var bit = 1 << (catOf[i] & 15);
    if (grid[gi] & bit) continue;
    grid[gi] |= bit;
    if (!coords[name]) {
      coords[name] = [];
      order.push(name);
    }
    coords[name].push(px, py);
  }

  var drawn = 0;
  for (i = 0; i < order.length; i++) {
    var list = coords[order[i]];
    groups.push({
      color: EVENT_COLORS[order[i]] || EVENT_COLORS.other,
      coords: list,
    });
    drawn += list.length / 2;
  }
  window.plugin.gdpr.eventDrawn = drawn;
  window.plugin.gdpr.eventRaw = raw;
  window.plugin.gdpr.dotList = groups;
  window.plugin.gdpr._dotsBox = { s: boxS, n: boxN, w: boxW, e: boxE, zoom: zoom };
  return groups;
};

window.plugin.gdpr.invalidateDots = function () {
  window.plugin.gdpr._dotsBox = null;
};

// True when the cached dot set still covers the current view.
window.plugin.gdpr.dotsFresh = function () {
  var box = window.plugin.gdpr._dotsBox;
  var map = window.map;
  if (!box || !map || !window.plugin.gdpr.eventsOn) return false;
  if (map.getZoom() !== box.zoom) return false;
  var b = map.getBounds();
  return b.getSouthWest().lat >= box.s && b.getNorthEast().lat <= box.n &&
    b.getSouthWest().lng >= box.w && b.getNorthEast().lng <= box.e;
};

// Pixel scale for normalised mercator, measured through Leaflet itself so a
// custom CRS / zoom offset cannot break the dot positions.
function gdprPixelScale(map, nw, refPx) {
  var eastPx = map.latLngToContainerPoint([nw.lat, nw.lng + 1]);
  var s = (eastPx.x - refPx.x) * 360;
  if (s > 0 && isFinite(s)) return s;
  return 256 * Math.pow(2, map.getZoom());
}

function gdprDrawDots(ctx, map, size) {
  var groups = window.plugin.gdpr.dotList;
  if (!groups.length) return;
  // Anchor on one real Leaflet projection instead of world-pixel minus
  // pixelOrigin: container points also include the map-pane offset, which is
  // non-zero while dragging. Using Leaflet for the anchor keeps the dots glued
  // to the ground during a pan and correct at rest.
  var b = map.getBounds();
  var nw = b.getNorthWest ? b.getNorthWest() : b.getNorthEast();
  var refN = { x: (nw.lng + 180) / 360, y: gdprMercY(nw.lat) };
  var refPx = map.latLngToContainerPoint([nw.lat, nw.lng]);
  var scale = gdprPixelScale(map, nw, refPx);
  var ox = refPx.x - refN.x * scale;
  var oy = refPx.y - refN.y * scale;
  ctx.globalAlpha = 0.6;
  for (var g = 0; g < groups.length; g++) {
    var coords = groups[g].coords;
    ctx.fillStyle = groups[g].color;
    ctx.beginPath();
    for (var i = 0; i < coords.length; i += 2) {
      var x = coords[i] * scale + ox;
      var y = coords[i + 1] * scale + oy;
      if (x < -6 || y < -6 || x > size.x + 6 || y > size.y + 6) continue;
      ctx.rect(x - 2, y - 2, 4, 4);
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* Ring size follows the zoom continuously: IITC's own marker scale is a step
   table (1 / 0.8 / 0.65 / 0.5), which makes the rings look frozen inside a
   band. Here they shrink smoothly below zoom 14 and grow slowly above it, so
   every zoom step is visible but the ring never swallows the map. */
window.plugin.gdpr.ringScale = function () {
  var zoom = window.map ? window.map.getZoom() : 14;
  var s;
  if (zoom <= 14) {
    s = Math.pow(2, (zoom - 14) * 0.4);
    if (s < 0.35) s = 0.35;
  } else {
    s = 1 + (zoom - 14) * 0.08;
    if (s > 1.5) s = 1.5;
  }
  return s;
};

var gdprPts = []; // scratch buffer, reused every frame

function gdprDraw() {
  var map = window.map;
  if (!map) return;
  var canvas = gdprCanvas();
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var size = map.getSize();
  var dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size.x, size.y);
  if (!window.plugin.gdpr.layerOn) return;

  var zoom = map.getZoom();
  if (window.plugin.gdpr.eventsOn) gdprDrawDots(ctx, map, size);

  var scale = window.plugin.gdpr.ringScale();

  // Project once, then draw; re-projecting per pass doubles the cost.
  var list = window.plugin.gdpr.matchList;
  var n = 0;
  var i;
  var pt;
  for (i = 0; i < list.length; i++) {
    pt = map.latLngToContainerPoint([list[i].lat, list[i].lng]);
    if (pt.x < -40 || pt.y < -40 || pt.x > size.x + 40 || pt.y > size.y + 40) continue;
    var slot = gdprPts[n];
    if (!slot) {
      slot = {};
      gdprPts[n] = slot;
    }
    slot.x = pt.x;
    slot.y = pt.y;
    slot.tier = list[i].tier;
    slot.count = list[i].count;
    slot.r = list[i].tier.radius * scale;
    n++;
  }

  // One path per tier instead of one path per portal.
  var tiers = window.plugin.gdpr.tiers;
  ctx.lineWidth = Math.max(1, 2 * scale);
  for (var t = 0; t < tiers.length; t++) {
    var started = false;
    ctx.beginPath();
    for (i = 0; i < n; i++) {
      if (gdprPts[i].tier !== tiers[t]) continue;
      ctx.moveTo(gdprPts[i].x + gdprPts[i].r, gdprPts[i].y);
      ctx.arc(gdprPts[i].x, gdprPts[i].y, gdprPts[i].r, 0, Math.PI * 2);
      started = true;
    }
    if (started) {
      ctx.strokeStyle = tiers[t].color;
      ctx.stroke();
    }
  }

  if (zoom < 14 && !window.plugin.gdpr.numbersForce) return;
  if (window.plugin.gdpr._moving) {
    // Keep panning smooth. Re-arm the draw in case no moveend ever arrives.
    if (!window.plugin.gdpr._labelTimer) {
      window.plugin.gdpr._labelTimer = setTimeout(function () {
        window.plugin.gdpr._labelTimer = null;
        window.plugin.gdpr.schedule(false);
      }, 160);
    }
    return;
  }
  var fontSize = Math.max(9, Math.round(10 * Math.max(0.8, scale)));
  var gap = 8 * Math.max(0.8, scale);
  ctx.font = fontSize + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(2, 3 * scale);
  ctx.strokeStyle = 'rgba(0,0,0,.78)';
  for (i = 0; i < n; i++) {
    ctx.strokeText(gdprPts[i].count > 999 ? '999+' : String(gdprPts[i].count), gdprPts[i].x, gdprPts[i].y - gdprPts[i].r - gap);
  }
  ctx.fillStyle = '#ffffff';
  for (i = 0; i < n; i++) {
    ctx.fillText(gdprPts[i].count > 999 ? '999+' : String(gdprPts[i].count), gdprPts[i].x, gdprPts[i].y - gdprPts[i].r - gap);
  }
}

window.plugin.gdpr.schedule = function (rebuild) {
  if (rebuild) window.plugin.gdpr._needRebuild = true;
  if (window.plugin.gdpr._raf) return;
  window.plugin.gdpr._raf = window.requestAnimationFrame(function () {
    window.plugin.gdpr._raf = null;
    if (window.plugin.gdpr._needRebuild) {
      window.plugin.gdpr._needRebuild = false;
      window.plugin.gdpr.rebuildMatches();
      if (!window.plugin.gdpr.dotsFresh()) window.plugin.gdpr.rebuildDots();
      window.plugin.gdpr.refreshStats();
    }
    gdprDraw();
  });
};

/* ---- Hover tooltip ----------------------------------------------------- */
function gdprTipEl() {
  var tip = document.getElementById(TIP_ID);
  if (tip) return tip;
  tip = document.createElement('div');
  tip.id = TIP_ID;
  tip.style.cssText = 'position:absolute;display:none;z-index:640;pointer-events:none;max-width:280px;' +
    'padding:7px 9px;background:rgba(8,24,32,.97);border:1px solid #4C9AFF;border-radius:6px;' +
    'color:#e8f2f4;font:12px/1.45 sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.5);';
  window.map.getContainer().appendChild(tip);
  return tip;
}

function gdprTipLine(parent, text, color) {
  var row = document.createElement('div');
  row.textContent = text;
  if (color) row.style.color = color;
  parent.appendChild(row);
  return row;
}

function gdprShowTip(item, x, y) {
  var map = window.map;
  var tip = gdprTipEl();
  tip.textContent = '';

  var portal = window.portals[item.guid];
  var data = portal && portal.options ? portal.options.data : null;
  var rec = item.rec;

  var head = document.createElement('div');
  head.textContent = (data && data.title) || 'Portal';
  head.style.cssText = 'font-weight:500;margin-bottom:3px;color:#8fd0ff;';
  tip.appendChild(head);

  var facts = [];
  if (data && data.team) facts.push(data.team);
  if (data && data.level) facts.push('L' + data.level);
  facts.push(rec[R_CAP] > 0 ? 'UPC (' + rec[R_CAP] + ')' : 'UPV');
  gdprTipLine(tip, facts.join(' · '), '#9fb3bb');

  gdprTipLine(tip, 'Interactions ' + rec[R_ANY] + '  (hack ' + rec[R_HACK] +
    ' · cap ' + rec[R_CAP] + ' · dep ' + rec[R_DEPLOY] +
    ' · upg ' + rec[R_UPGRADE] + ' · mod ' + rec[R_MOD] + ' · link ' + rec[R_LINK] + ')');

  if (rec[R_FIRST]) {
    gdprTipLine(tip, 'First ' + gdprIsoDay(rec[R_FIRST]) + ' · last ' + gdprIsoDay(rec[R_LAST]) +
      ' · span ' + (gdprSpan(rec[R_FIRST], rec[R_LAST]) || '-'));
  } else {
    gdprTipLine(tip, 'First/last visit unknown', '#9fb3bb');
  }

  var size = map.getSize();
  var w = tip.offsetWidth || 260;
  var h = tip.offsetHeight || 90;
  var left = x + 14;
  var top = y + 14;
  if (left + w > size.x - 8) left = Math.max(4, x - w - 14);
  if (top + h > size.y - 8) top = Math.max(4, y - h - 14);
  tip.style.left = Math.round(left) + 'px';
  tip.style.top = Math.round(top) + 'px';
  tip.style.display = 'block';
}

function gdprHideTip() {
  var tip = document.getElementById(TIP_ID);
  if (tip) tip.style.display = 'none';
}

function gdprHoverMove(ev) {
  if (!window.plugin.gdpr.layerOn || !window.plugin.gdpr.matchList.length) {
    gdprHideTip();
    return;
  }
  var map = window.map;
  if (!map) return;
  var rect = map.getContainer().getBoundingClientRect();
  var x = ev.clientX - rect.left;
  var y = ev.clientY - rect.top;
  var best = null;
  var hit = Math.max(8, 14 * window.plugin.gdpr.ringScale());
  var bestD = hit * hit;
  var list = window.plugin.gdpr.matchList;
  for (var i = 0; i < list.length; i++) {
    var item = list[i];
    var pt = map.latLngToContainerPoint([item.lat, item.lng]);
    var dx = pt.x - x;
    var dy = pt.y - y;
    var d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = item;
    }
  }
  if (best) gdprShowTip(best, x, y);
  else gdprHideTip();
}

/* ---- Status / summary -------------------------------------------------- */
window.plugin.gdpr.statusText = function () {
  var s = window.plugin.gdpr.stats;
  var m = window.plugin.gdpr.meta;
  if (!s.portals) return 'GDPR: no data';
  var span = '';
  if (m && m.firstTs && m.lastTs) span = ' | ' + gdprIsoDay(m.firstTs) + ' ~ ' + gdprIsoDay(m.lastTs);
  return 'GDPR: ' + s.portals.toLocaleString() + ' portals | ' + s.captured.toLocaleString() + ' UPC' + span;
};

window.plugin.gdpr.viewText = function () {
  var v = window.plugin.gdpr.viewStats;
  if (!window.plugin.gdpr.stats.portals) return '';
  if (!v.total) return 'In view: no portals loaded';
  var pct = Math.round(v.coverage * 100);
  var extra = '';
  if (window.plugin.gdpr.eventsOn && window.plugin.gdpr.events) {
    var drawn = window.plugin.gdpr.eventDrawn || 0;
    var raw = window.plugin.gdpr.eventRaw || 0;
    extra = ' | events ' + drawn + (raw > drawn ? ' of ' + raw + ' in view' : '');
  }
  return 'In view: ' + v.total + ' portals · UPC ' + v.upc + ' · UPV ' + v.upv + ' · coverage ' + pct + '%' + extra;
};

window.plugin.gdpr.summary = function (state) {
  var s = window.plugin.gdpr.stats;
  var m = window.plugin.gdpr.meta || {};
  var view = state || {};
  var lines = [
    'GDPR Visualizer - import complete',
    s.portals.toLocaleString() + ' portals (' + s.captured.toLocaleString() + ' captured, ' +
      Math.round((s.captured / Math.max(1, s.portals)) * 100) + '% of them)',
  ];
  lines.push('Source: game_log*.tsv, ' + (m.rows || 0).toLocaleString() + ' rows (' + (m.duplicates || 0).toLocaleString() + ' duplicates removed)');
  lines.push('Time span: ' + gdprIsoDay(m.firstTs) + ' ~ ' + gdprIsoDay(m.lastTs));
  lines.push('Event dots: ' + s.events.toLocaleString() + ' kept in memory for this session.');
  if (view.matched !== undefined) {
    lines.push('Portals in the current view: ' + view.matched + ' matched / ' + view.total + ' loaded.');
  }
  if (view.zoomed) lines.push('The map moved to your data - no portal on screen matched before.');
  lines.push('Rings show interaction counts; hover a portal for dates. Numbers appear at zoom 14+.');
  return lines.join('\n');
};

/* ---- Import ------------------------------------------------------------ */
window.plugin.gdpr.packEvents = function (events) {
  var n = events.length;
  var cats = [];
  var catIndex = {};
  var ts = new Float64Array(n);
  var lat = new Float64Array(n);
  var lng = new Float64Array(n);
  var cat = new Uint8Array(n);
  for (var i = 0; i < n; i++) {
    var e = events[i];
    var ci = catIndex[e.cat];
    if (ci === undefined) {
      ci = cats.length;
      catIndex[e.cat] = ci;
      cats.push(e.cat);
    }
    ts[i] = e.ts;
    lat[i] = e.lat;
    lng[i] = e.lng;
    cat[i] = ci;
  }
  // Normalised Web-Mercator coordinates (0..1) so drawing never has to call
  // back into Leaflet for 295k points: container px = n * scale - pixelOrigin.
  var nx = new Float64Array(n);
  var ny = new Float64Array(n);
  for (i = 0; i < n; i++) {
    nx[i] = (lng[i] + 180) / 360;
    var rad = (lat[i] * Math.PI) / 180;
    ny[i] = (1 - Math.log(Math.tan(Math.PI / 4 + rad / 2)) / Math.PI) / 2;
  }
  return { ts: ts, lat: lat, lng: lng, nx: nx, ny: ny, cat: cat, cats: cats };
};

// Main entry: game_log*.tsv only. Folder import was dropped on purpose - the
// export folder also contains portal_history.tsv and time series, which this
// plugin never reads, and picking them by accident only confused the counts.
window.plugin.gdpr.importFiles = function (files) {
  var list = Array.prototype.slice.call(files || []);
  if (!list.length) return;
  var logs = list.filter(function (f) { return /^game_log.*\.tsv$/i.test(f.name); });

  var finish = function () {
    window.plugin.gdpr.saveLocal();
    window.plugin.gdpr.rebuildMatches();
    window.plugin.gdpr.schedule(false);
    var view = window.plugin.gdpr.viewStats;
    var zoomed = false;
    if (window.plugin.gdpr.viewStats.matched === 0) {
      zoomed = window.plugin.gdpr.fitToData();
      if (zoomed) {
        // IITC loads the new view's portals asynchronously; rebuild once they are in.
        setTimeout(function () { window.plugin.gdpr.schedule(true); }, 1500);
      }
    }
    gdprRenderLegend();
    gdprRenderCatToggles();
    gdprSyncCatBoxes();
    window.plugin.gdpr.refreshPanel();
    window.alert(window.plugin.gdpr.summary({
      matched: view.matched,
      total: view.total,
      zoomed: zoomed,
    }));
  };

  if (logs.length) {
    Promise.all(logs.map(window.plugin.gdpr.readText))
      .then(function (texts) {
        var parsed = IGV_CORE.parseGameLog(texts);
        window.plugin.gdpr.meta = {
          source: 'game_log',
          firstTs: parsed.firstTs,
          lastTs: parsed.lastTs,
          rows: parsed.logRows,
          duplicates: parsed.duplicateRows,
        };
        window.plugin.gdpr.buildIndexFromEvents(parsed.events);
        window.plugin.gdpr.events = window.plugin.gdpr.packEvents(parsed.events);
        window.plugin.gdpr.stats.events = parsed.events.length;
        // Fresh state per import: stale keys from an earlier dataset must not
        // leak into the new one (that made the map disagree with the panel).
        window.plugin.gdpr.catOn = {};
        window.plugin.gdpr.setAllCats(true, gdprDefaultCats());
        finish();
      })
      .catch(function (e) {
        window.alert('GDPR Visualizer: failed to parse game_log - ' + (e && e.message ? e.message : e));
      });
    return;
  }

  window.alert('GDPR Visualizer: no game_log*.tsv file in the selection. Pick game_log.tsv (and any copies).');
};

window.plugin.gdpr.promptImport = function () {
  var input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = '.tsv';
  input.style.display = 'none';
  input.addEventListener('change', function () {
    if (input.files && input.files.length) window.plugin.gdpr.importFiles(input.files);
    input.remove();
  });
  document.body.appendChild(input);
  input.click();
};

window.plugin.gdpr.dataBounds = function () {
  var index = window.plugin.gdpr.index;
  if (!index.size) return null;
  var minLat = 90;
  var maxLat = -90;
  var minLng = 180;
  var maxLng = -180;
  index.forEach(function (_rec, key) {
    var parts = key.split('_');
    var lat = Number(parts[0]) / 1e6;
    var lng = Number(parts[1]) / 1e6;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  });
  return [[minLat, minLng], [maxLat, maxLng]];
};

// Used after an import that matched nothing on screen: the data is probably
// somewhere else, so move the map there instead of leaving a blank view.
window.plugin.gdpr.fitToData = function () {
  var bounds = window.plugin.gdpr.dataBounds();
  if (!bounds || !window.map || typeof window.map.fitBounds !== 'function') return false;
  try {
    window.map.fitBounds(bounds, { padding: [40, 40] });
    return true;
  } catch (e) {
    console.warn('GDPR Visualizer: could not move the map to the imported data', e);
    return false;
  }
};

window.plugin.gdpr.clear = function () {
  if (!window.confirm('GDPR Visualizer: remove the imported portal index from this browser?')) return;
  window.plugin.gdpr.index = new Map();
  window.plugin.gdpr.stats = { portals: 0, captured: 0, visited: 0, events: 0 };
  window.plugin.gdpr.meta = null;
  window.plugin.gdpr.events = null;
  window.plugin.gdpr.matchList = [];
  window.plugin.gdpr.invalidateDots();
  window.plugin.gdpr.viewStats = { total: 0, upv: 0, upc: 0, coverage: 0 };
  window.plugin.gdpr.tiers = TIERS;
  window.plugin.gdpr.catOn = {};
  gdprRenderLegend();
  gdprRenderCatToggles();
  try { localStorage.removeItem(LS_KEY); } catch (e) { console.warn('GDPR Visualizer: failed to clear storage', e); }
  gdprHideTip();
  window.plugin.gdpr.schedule(false);
  window.plugin.gdpr.refreshPanel();
  window.alert('GDPR Visualizer: data cleared.');
};

/* ---- UI: one toolbox entry + popup panel --------------------------------
   IITC-CE renders toolbox buttons into #toolbox_component (legacy #toolbox
   links are migrated there) and exposes IITC.toolbox.addButton(); older builds
   only have the #toolbox link bar. Both paths get exactly ONE entry, "GDPR
   data visualizer", which opens a small menu. Plain DOM only.
-------------------------------------------------------------------------- */
function gdprToolboxHost() {
  return document.getElementById('toolbox_component') ||
    document.getElementById('toolbox') ||
    document.getElementById('toolbox-links') ||
    document.querySelector('.toolbox') ||
    null;
}

function gdprLink(label, title, id, onClick) {
  var a = document.createElement('a');
  a.href = '#';
  a.id = id;
  a.textContent = label;
  a.title = title;
  a.addEventListener('click', function (ev) {
    ev.preventDefault();
    onClick();
    return false;
  });
  return a;
}

function gdprCss(el, css) {
  el.style.cssText = css;
  return el;
}

function gdprMenuButton(label, title, onClick) {
  var b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.title = title;
  gdprCss(b, 'display:block;width:100%;margin:0 0 6px;padding:6px 8px;cursor:pointer;text-align:left;' +
    'background:rgba(76,154,255,.14);border:1px solid rgba(76,154,255,.45);border-radius:5px;' +
    'color:#e8f2f4;font:12px/1.4 sans-serif;');
  b.addEventListener('mouseover', function () { b.style.background = 'rgba(76,154,255,.3)'; });
  b.addEventListener('mouseout', function () { b.style.background = 'rgba(76,154,255,.14)'; });
  b.addEventListener('click', function (ev) {
    ev.preventDefault();
    ev.stopPropagation();
    onClick();
  });
  return b;
}

function gdprCheckbox(label, title, checked, onChange) {
  var wrap = document.createElement('label');
  gdprCss(wrap, 'display:flex;align-items:center;gap:6px;margin:0 0 4px;cursor:pointer;color:#dbeef6;font:12px/1.4 sans-serif;');
  var box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = checked;
  box.title = title;
  box.style.cssText = 'margin:0;cursor:pointer;';
  box.addEventListener('change', function () { onChange(box.checked); });
  var text = document.createElement('span');
  text.textContent = label;
  wrap.appendChild(box);
  wrap.appendChild(text);
  return wrap;
}

function gdprLegend() {
  var box = document.createElement('div');
  box.id = 'gdpr-legend';
  gdprCss(box, 'display:flex;flex-wrap:wrap;gap:6px;margin:2px 0 8px;color:#9fb3bb;font-size:11px;');
  gdprRenderLegend();
  return box;
}

function gdprRenderLegend() {
  var box = document.getElementById('gdpr-legend');
  if (!box) return;
  box.textContent = '';
  var tiers = window.plugin.gdpr.tiers;
  var labels = window.plugin.gdpr.tierLabels();
  for (var i = 0; i < tiers.length; i++) {
    var item = document.createElement('span');
    gdprCss(item, 'display:inline-flex;align-items:center;gap:4px;');
    var dot = document.createElement('span');
    gdprCss(dot, 'width:8px;height:8px;border-radius:50%;border:2px solid ' + tiers[i].color + ';display:inline-block;');
    item.appendChild(dot);
    item.appendChild(document.createTextNode(labels[i]));
    box.appendChild(item);
  }
}

// Only categories that actually occur in the imported data are listed: field
// has no coordinates at all (ingestCore keeps its dates only), and any other
// category may be absent from a given export.
function gdprEventCatNames() {
  var ev = window.plugin.gdpr.events;
  if (!ev) return [];
  var present = {};
  for (var i = 0; i < ev.cats.length; i++) present[ev.cats[i]] = true;
  var order = gdprCatNames();
  var out = [];
  var seen = {};
  for (var j = 0; j < order.length; j++) {
    if (present[order[j]]) {
      out.push(order[j]);
      seen[order[j]] = true;
    }
  }
  // Unknown names (a future core category) still get a switch instead of
  // silently disappearing.
  for (var k = 0; k < ev.cats.length; k++) {
    if (!seen[ev.cats[k]]) {
      out.push(ev.cats[k]);
      seen[ev.cats[k]] = true;
    }
  }
  return out;
}

function gdprCatCheckbox(name) {
  var label = document.createElement('label');
  gdprCss(label, 'display:flex;align-items:center;gap:5px;cursor:pointer;color:#9fb3bb;font:11px/1.5 sans-serif;');
  var box = document.createElement('input');
  box.type = 'checkbox';
  box.setAttribute('data-cat', name);
  box.checked = !!window.plugin.gdpr.catOn[name];
  box.style.cssText = 'margin:0;cursor:pointer;';
  box.addEventListener('change', function () {
    window.plugin.gdpr.catOn[name] = box.checked;
    window.plugin.gdpr.invalidateDots(); // dot budgets depend on the enabled set
    window.plugin.gdpr.schedule(true);
  });
  var dot = document.createElement('span');
  gdprCss(dot, 'width:7px;height:7px;background:' + (EVENT_COLORS[name] || EVENT_COLORS.other) + ';flex:none;');
  var text = document.createElement('span');
  text.textContent = name;
  label.appendChild(box);
  label.appendChild(dot);
  label.appendChild(text);
  return label;
}

// The DOM list is rebuilt after every import, and the tick marks are re-read
// from catOn: without this the boxes keep whatever state they had when the
// panel was first created, so the map and the panel disagree.
function gdprRenderCatToggles() {
  var wrap = document.getElementById('gdpr-event-cats');
  if (!wrap) return;
  wrap.textContent = '';
  var names = gdprEventCatNames();
  if (!names.length) {
    var empty = document.createElement('div');
    empty.textContent = window.plugin.gdpr.events
      ? 'No event categories in this import.'
      : 'Import game_log files to list event categories.';
    gdprCss(empty, 'grid-column:1 / -1;color:#7f949c;font:11px/1.5 sans-serif;');
    wrap.appendChild(empty);
    return;
  }
  for (var i = 0; i < names.length; i++) wrap.appendChild(gdprCatCheckbox(names[i]));
}

function gdprSyncCatBoxes() {
  var boxes = document.querySelectorAll('#gdpr-event-cats input[type=checkbox]');
  for (var i = 0; i < boxes.length; i++) {
    boxes[i].checked = !!window.plugin.gdpr.catOn[boxes[i].getAttribute('data-cat')];
  }
}

function gdprEventToggles() {
  var wrap = document.createElement('div');
  gdprCss(wrap, 'margin:4px 0 0 18px;display:none;grid-template-columns:1fr 1fr;gap:2px 8px;');
  wrap.id = 'gdpr-event-cats';
  gdprRenderCatToggles();
  return wrap;
}

function gdprPanelEl() {
  var panel = document.getElementById(PANEL_ID);
  if (panel) return panel;

  panel = document.createElement('div');
  panel.id = PANEL_ID;
  gdprCss(panel, 'display:none;position:fixed;z-index:100001;width:272px;max-height:80vh;overflow:auto;' +
    'padding:10px 12px;background:rgba(8,24,32,.97);border:1px solid #4C9AFF;border-radius:8px;' +
    'box-shadow:0 8px 28px rgba(0,0,0,.55);color:#e8f2f4;font:12px/1.5 sans-serif;');

  var head = document.createElement('div');
  gdprCss(head, 'display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;');
  var title = document.createElement('strong');
  title.textContent = 'GDPR data visualizer';
  gdprCss(title, 'color:#8fd0ff;font-size:13px;');
  var close = document.createElement('a');
  close.href = '#';
  close.textContent = '\u00d7';
  close.title = 'Close';
  gdprCss(close, 'color:#9fb3bb;text-decoration:none;font-size:16px;line-height:1;');
  close.addEventListener('click', function (ev) {
    ev.preventDefault();
    window.plugin.gdpr.togglePanel(false);
  });
  head.appendChild(title);
  head.appendChild(close);
  panel.appendChild(head);

  var status = document.createElement('div');
  status.id = 'gdpr-panel-status';
  gdprCss(status, 'margin-bottom:2px;color:#cfe6ee;');
  panel.appendChild(status);

  var view = document.createElement('div');
  view.id = 'gdpr-panel-view';
  gdprCss(view, 'margin-bottom:8px;color:#8fa9b3;');
  panel.appendChild(view);

  panel.appendChild(gdprCheckbox('Interaction rings', 'Colour + radius by interaction count', true, function (on) {
    window.plugin.gdpr.layerOn = on;
    window.plugin.gdpr.schedule(false);
  }));
  panel.appendChild(gdprCheckbox('Always show counts', 'Draw the numbers below zoom 14 as well', false, function (on) {
    window.plugin.gdpr.numbersForce = on;
    window.plugin.gdpr.schedule(false);
  }));
  panel.appendChild(gdprCheckbox('Event dots', 'Raw events in the current view (max 6000)', false, function (on) {
    if (on && !window.plugin.gdpr.events) {
      window.alert('GDPR Visualizer: event dots need a game_log import in this session.');
      window.plugin.gdpr.eventsOn = false;
      var boxes = panel.querySelectorAll('input[type=checkbox]');
      if (boxes[2]) boxes[2].checked = false;
      return;
    }
    if (on) {
      var anyOn = false;
      for (var name in window.plugin.gdpr.catOn) {
        if (window.plugin.gdpr.catOn[name]) { anyOn = true; break; }
      }
      if (!anyOn) {
        window.plugin.gdpr.setAllCats(true, gdprDefaultCats());
        gdprSyncCatBoxes();
      }
    }
    window.plugin.gdpr.eventsOn = on;
    var cats = document.getElementById('gdpr-event-cats');
    if (cats) cats.style.display = on ? 'grid' : 'none';
    window.plugin.gdpr.invalidateDots();
    window.plugin.gdpr.schedule(true);
  }));
  panel.appendChild(gdprEventToggles());
  panel.appendChild(gdprLegend());

  var divider = document.createElement('div');
  gdprCss(divider, 'height:1px;background:rgba(76,154,255,.25);margin:8px 0;');
  panel.appendChild(divider);

  panel.appendChild(gdprMenuButton('Import game_log.tsv\u2026', 'Select game_log.tsv (multi-select also accepts the copies)', function () {
    window.plugin.gdpr.promptImport();
  }));
  panel.appendChild(gdprMenuButton('Clear data', 'Remove the stored portal index', function () {
    window.plugin.gdpr.clear();
  }));

  var hint = document.createElement('div');
  hint.id = 'gdpr-panel-hint';
  gdprCss(hint, 'margin-top:6px;color:#7f949c;font-size:11px;');
  panel.appendChild(hint);

  document.body.appendChild(panel);

  document.addEventListener('mousedown', function (ev) {
    if (panel.style.display === 'none') return;
    if (Date.now() < (window.plugin.gdpr._openGuard || 0)) return;
    if (panel.contains(ev.target)) return;
    var entry = document.getElementById('gdpr-open');
    if (entry && entry.contains(ev.target)) return;
    window.plugin.gdpr.togglePanel(false);
  }, true);
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && panel.style.display !== 'none') window.plugin.gdpr.togglePanel(false);
  });

  return panel;
}

function gdprPlacePanel(panel) {
  var entry = document.getElementById('gdpr-open');
  var rect = entry && entry.getBoundingClientRect ? entry.getBoundingClientRect() : null;
  var width = panel.offsetWidth || 272;
  var height = panel.offsetHeight || 300;
  var top = rect ? rect.top : 120;
  var left = rect ? rect.right + 10 : 12;
  if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
  if (top + height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - height - 8);
  panel.style.top = Math.round(top) + 'px';
  panel.style.left = Math.round(left) + 'px';
}

window.plugin.gdpr.refreshStats = function () {
  var status = document.getElementById('gdpr-panel-status');
  if (!status) return;
  status.textContent = window.plugin.gdpr.statusText();
  var view = document.getElementById('gdpr-panel-view');
  if (view) view.textContent = window.plugin.gdpr.viewText();
};

window.plugin.gdpr.refreshPanel = function () {
  var status = document.getElementById('gdpr-panel-status');
  if (!status) return;
  window.plugin.gdpr.refreshStats();
  var hint = document.getElementById('gdpr-panel-hint');
  if (!hint) return;
  if (!window.plugin.gdpr.index.size) {
    hint.textContent = window.plugin.gdpr.needsReimport
      ? 'Index format upgraded - import the export once more to get counts and dates.'
      : 'Pick game_log.tsv. Everything is parsed in this browser.';
    return;
  }
  var parts = ['Hover a portal for first/last visit.', 'Numbers appear at zoom 14+ (or tick "Always show counts").'];
  if (window.plugin.gdpr.saveFailed) parts.push('Index too large to persist - session only.');
  if (window.plugin.gdpr.events) parts.push('Event dots are session-only.');
  hint.textContent = parts.join(' ');
};

window.plugin.gdpr.togglePanel = function (show) {
  var panel = gdprPanelEl();
  var next = typeof show === 'boolean' ? show : panel.style.display === 'none';
  if (!next) {
    panel.style.display = 'none';
    return;
  }
  window.plugin.gdpr.refreshPanel();
  panel.style.display = 'block';
  gdprPlacePanel(panel);
  window.plugin.gdpr._openGuard = Date.now() + 250; // ignore the click that opened it
  window.plugin.gdpr.schedule(true);
};

window.plugin.gdpr._toolboxTries = 0;

function gdprFallbackEntry() {
  var bar = document.getElementById('gdpr-fallback');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'gdpr-fallback';
    gdprCss(bar, 'position:fixed;left:12px;bottom:12px;z-index:100000;padding:6px 10px;' +
      'background:rgba(8,24,32,.94);border:1px solid #4C9AFF;border-radius:8px;color:#e8f2f4;font:12px sans-serif;');
    document.body.appendChild(bar);
  }
  return bar;
}

window.plugin.gdpr.addToolbox = function () {
  if (document.getElementById('gdpr-open')) return true;
  var open = function () { window.plugin.gdpr.togglePanel(); };
  var title = 'Interaction counts, first/last visit and event dots from your own GDPR export';
  var T = window.IITC && window.IITC.toolbox;
  if (T && typeof T.addButton === 'function') {
    try {
      T.addButton({ id: 'gdpr-open', label: 'GDPR data visualizer', title: title, action: open });
      if (document.getElementById('gdpr-open')) return true;
    } catch (e) {
      console.warn('GDPR Visualizer: toolbox API failed, falling back to the link bar', e);
    }
  }
  var host = gdprToolboxHost();
  if (!host) {
    if (window.plugin.gdpr._toolboxTries < 60) return false; // keep waiting for IITC
    host = gdprFallbackEntry();
  }
  host.appendChild(gdprLink('GDPR data visualizer', title, 'gdpr-open', open));
  return true;
};

window.plugin.gdpr.ensureToolbox = function () {
  if (window.plugin.gdpr._toolboxTimer) return;
  var tick = function () {
    window.plugin.gdpr._toolboxTries++;
    var done = window.plugin.gdpr.addToolbox();
    if (done || window.plugin.gdpr._toolboxTries >= 61) {
      clearInterval(window.plugin.gdpr._toolboxTimer);
      window.plugin.gdpr._toolboxTimer = null;
    }
  };
  tick();
  if (!window.plugin.gdpr._toolboxTimer) {
    window.plugin.gdpr._toolboxTimer = setInterval(tick, 250);
  }
};

window.plugin.gdpr.bindMap = function () {
  var map = window.map;
  if (!map || window.plugin.gdpr._mapBound === map) return;
  window.plugin.gdpr._mapBound = map;

  map.on('move zoom', function () {
    window.plugin.gdpr._moving = true; // labels are skipped while the map moves
    window.plugin.gdpr.schedule(false);
  });
  map.on('resize viewreset', function () { window.plugin.gdpr.schedule(false); });
  map.on('moveend zoomend', function () {
    window.plugin.gdpr._moving = false;
    window.plugin.gdpr.schedule(true);
  });

  var container = map.getContainer();
  container.addEventListener('mousemove', gdprHoverMove);
  container.addEventListener('mouseleave', gdprHideTip);

  if (typeof window.addHook === 'function') {
    try { window.addHook('mapDataRefreshEnd', function () { window.plugin.gdpr.schedule(true); }); } catch (e) { /* old IITC */ }
  }
};

window.plugin.gdpr.start = function () {
  if (window.plugin.gdpr._started) {
    window.plugin.gdpr.bindMap();
    return;
  }
  window.plugin.gdpr._started = true;
  window.plugin.gdpr.loadLocal();
  window.plugin.gdpr.bindMap();
  window.plugin.gdpr.ensureToolbox();
  window.plugin.gdpr.schedule(true);
};

/* setup() is the standard IITC-CE plugin entry point. It is idempotent so it
   can be called by the boot loader, the iitcLoaded hook and our own fallback
   bootstrap without registering anything twice. */
function setup() {
  window.plugin.gdpr.start();
}
setup.info = {
  pluginId: 'gdpr-visualizer',
  script: { name: 'GDPR Visualizer', version: '0.4.2' },
};

/* Bootstrap for all three installation paths:
   1. IITC-CE plugin loader / build-injected plugin -> window.bootPlugins.
   2. Userscript manager on intel.ingress.com -> no setup() call at all, so we
      must start ourselves; this is why the toolbox entry was previously missing.
   3. Late injection into an already-booted IITC -> poll until ready. */
(function bootstrap() {
  window.plugin.gdpr.start();

  if (window.bootPlugins && typeof window.bootPlugins.push === 'function') {
    window.bootPlugins.push(setup);
  }
  if (typeof window.addHook === 'function') {
    try { window.addHook('iitcLoaded', setup); } catch (e) { /* old IITC */ }
  }

  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    var ready = (window.map && window.map.getContainer) || window.iitcLoaded === true;
    if (ready) window.plugin.gdpr.start();
    if ((ready && window.plugin.gdpr._mapBound) || tries > 120) clearInterval(timer);
  }, 250);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      window.plugin.gdpr.start();
    });
  }
})();
