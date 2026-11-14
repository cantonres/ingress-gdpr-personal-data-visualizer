import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { STYLES, EVENT_COLORS, EVENT_LABELS } from "./mapShared.js";
import { useData } from "../dataContext.js";
import { useFaction, factionStyle, syncFactionPaint, readFaction } from "../faction.js";
import { useI18n } from "../i18n.jsx";

maplibregl.setWorkerUrl(mapWorkerUrl);

// Speed is a time-compression ratio (dataset seconds advanced per real
// second). "1x" is meaningless for a multi-year dataset.
const RATES = [
  ["hour", 3600],
  ["day", 86400],
  ["week", 604800],
  ["month", 2592000],
];

const MAX_LINK_GAP = 300; // 5 min: longer gap -> no interpolation, new segment
const MAX_LINK_DIST = 20000; // 20 km: a jump also breaks the line
const STAY_RADIUS_M = 30;
const STAY_MIN_SEC = 60;
const STAY_MAX_SEC = 7200;
const MAX_LINE_POINTS = 5000; // line-only decimation; event points are never sampled
const MAX_LOADED_POINTS = 40000; // cap for the prefetched source window (memory guard)
const FILTER_INTERVAL_MS = 120;

// UI accent (theme-aware: faction switch redefines --accent).
const accentColor = () =>
  getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#4C9AFF";
const LAYER_INTERVAL_MS = 500; // trail/dwell derived layers refresh cadence
const FOLLOW_INTERVAL_MS = 800; // camera re-centering cadence in follow mode
// Off-screen indicator margins. Top/bottom are larger so the indicator never
// hides under the category legend (top) or the note / attribution strip (bottom).
const PAD_X = 22;
const PAD_TOP = 74;
const PAD_BOTTOM = 56;

function lowerBound(arr, v) {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function distM(lat1, lng1, lat2, lng2) {
  const dy = (lat2 - lat1) * 111320;
  const dx = (lng2 - lng1) * 111320 * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

function fmtUtc(ts) {
  if (!ts) return "—";
  return new Date(ts * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function fmtDuration(s) {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${(s / 3600).toFixed(1)}h`;
}

// Scrubber ticks: hours for a single day, dates for weeks, years for the full range.
function makeTicks(from, to) {
  const span = to - from;
  if (!(span > 0)) return [];
  const out = [];
  if (span <= 2 * 86400) {
    const step = 6 * 3600;
    for (let t = Math.ceil(from / step) * step; t <= to; t += step) {
      out.push({ pct: ((t - from) / span) * 100, label: new Date(t * 1000).toISOString().slice(11, 16) });
    }
  } else if (span <= 120 * 86400) {
    const step = Math.max(86400, Math.ceil(span / 6 / 86400) * 86400);
    for (let t = Math.ceil(from / step) * step; t <= to; t += step) {
      out.push({ pct: ((t - from) / span) * 100, label: new Date(t * 1000).toISOString().slice(5, 10) });
    }
  } else {
    const y0 = new Date(from * 1000).getUTCFullYear();
    const y1 = new Date(to * 1000).getUTCFullYear();
    for (let y = y0; y <= y1; y++) {
      const t = Date.UTC(y, 0, 1) / 1000;
      if (t >= from && t <= to) out.push({ pct: ((t - from) / span) * 100, label: String(y) });
    }
  }
  return out;
}

// Per-day activity: dayIndex (floor(ts / 86400)) -> event count.
// Computed once per dataset; used by the calendar heat and the scrubber bar.
function buildDayCounts(times) {
  const counts = new Map();
  for (let i = 0; i < times.length; i++) {
    const d = Math.floor(times[i] / 86400);
    counts.set(d, (counts.get(d) || 0) + 1);
  }
  return counts;
}

function withAlpha(hex, alpha) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

// Activity ramp for the scrubber strip. Resistance keeps the shipped
// blue -> teal -> green -> amber scale; Enlightened uses a green ramp derived
// from the faction accent so the strip matches the calendar and the theme.
function heatColor(count, faction) {
  if (!count) return "rgba(136,135,128,0.16)";
  if (faction === "enlightened") {
    const accent = accentColor();
    if (count < 10) return withAlpha(accent, 0.25);
    if (count < 50) return withAlpha(accent, 0.45);
    if (count < 200) return withAlpha(accent, 0.7);
    return accent;
  }
  if (count < 10) return "#24507c";
  if (count < 50) return "#2a7f9e";
  if (count < 200) return "#3aa17e";
  return "#e2953f";
}

function calLevel(count) {
  if (!count) return 0;
  if (count < 10) return 1;
  if (count < 50) return 2;
  if (count < 200) return 3;
  return 4;
}

export default function Playback() {
  const data = useData();
  const { t, fmtCount, eventLabel } = useI18n();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const markerElRef = useRef(null);
  const popupRef = useRef(null);
  const offRef = useRef(null);
  const offArrRef = useRef(null);
  const offDistRef = useRef(null);
  const scrubRef = useRef(null);
  const rafRef = useRef(0);
  const preparedRef = useRef(null);
  const curRef = useRef(0);
  const endRef = useRef(0);
  const rangeRef = useRef({ from: 0, to: 0 });
  const loadedRef = useRef({ from: 0, to: 0 }); // time span currently materialised in the source
  const lastFrameRef = useRef(0);
  const lastApplyRef = useRef(0);
  const lastLayerRef = useRef(0);
  const lastFollowRef = useRef(0);
  const prevRateRef = useRef(null); // rate to restore when leaving single-day mode
  const playingRef = useRef(false);
  const rateRef = useRef(604800);
  const followRef = useRef(false);

  const faction = useFaction();
  const [status, setStatus] = useState("loading");
  const [mapReady, setMapReady] = useState(false);
  const [loadMsg, setLoadMsg] = useState("");
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState("week");
  const [follow, setFollow] = useState(false);
  const [singleDay, setSingleDay] = useState(false);
  const [day, setDay] = useState("");
  const [range, setRange] = useState({ from: 0, to: 0 });
  const [calOpen, setCalOpen] = useState(false);
  const [calMonth, setCalMonth] = useState("");
  const [hoverStay, setHoverStay] = useState(null);
  const [ui, setUi] = useState({ time: "—", win: 0, cum: 0, stays: 0, cats: {} });

  const ticks = useMemo(() => makeTicks(range.from, range.to), [range]);

  const heatGradient = useMemo(() => {
    const p = preparedRef.current;
    const { from, to } = range;
    if (status !== "ready" || !p || !p.n || !(to > from)) return undefined;
    const SEG = 60;
    const stops = [];
    for (let i = 0; i < SEG; i++) {
      const a = from + (i / SEG) * (to - from);
      const b = from + ((i + 1) / SEG) * (to - from);
      const count = lowerBound(p.times, b) - lowerBound(p.times, a);
      const c = heatColor(count, faction);
      stops.push(`${c} ${((i / SEG) * 100).toFixed(2)}% ${(((i + 1) / SEG) * 100).toFixed(2)}%`);
    }
    return `linear-gradient(to right, ${stops.join(",")})`;
  }, [status, range, faction]);

  // Calendar grid for the visible month (activity-colored days).
  const calCells = useMemo(() => {
    if (!calMonth) return null;
    const [y, m] = calMonth.split("-").map(Number);
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const counts = preparedRef.current?.dayCounts;
    const cells = Array.from({ length: firstDow }, () => null);
    for (let d = 1; d <= daysInMonth; d++) {
      const ts = Date.UTC(y, m - 1, d) / 1000;
      const dayIdx = Math.floor(ts / 86400);
      const count = counts?.get(dayIdx) || 0;
      cells.push({
        day: d,
        date: `${calMonth}-${String(d).padStart(2, "0")}`,
        count,
        level: calLevel(count),
      });
    }
    return cells;
  }, [calMonth]);

  const calYear = calMonth ? Number(calMonth.split("-")[0]) : 0;
  const calMonthNum = calMonth ? Number(calMonth.split("-")[1]) : 0;
  const yearOptions = useMemo(() => {
    const counts = preparedRef.current?.dayCounts;
    if (!counts || counts.size === 0) return [new Date().getUTCFullYear()];
    const idxs = [...counts.keys()];
    const y0 = new Date(Math.min(...idxs) * 86400000).getUTCFullYear();
    const y1 = new Date(Math.max(...idxs) * 86400000).getUTCFullYear();
    const out = [];
    for (let y = y0; y <= y1; y++) out.push(y);
    return out;
  }, [status]);

  const shiftMonth = (delta) => {
    if (!calMonth) return;
    const [y, m] = calMonth.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setCalMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  };

  // ---- 1) Load compact events, sort by time into typed arrays only.
  // No GeoJSON objects are kept in memory: only the current time window is
  // materialised as features (fixes the OOM seen with 568k points).
  useEffect(() => {
    let alive = true;
    let timer = 0;
    data
      .getEvents()
      .then((compact) => {
        if (!alive) return;
        const rows = compact.events || [];
        setLoadMsg(t("play.preparing", { events: fmtCount(rows.length) }));
        timer = setTimeout(() => {
          if (!alive) return;
          const n = rows.length;
          const order = Array.from({ length: n }, (_, i) => i);
          order.sort((a, b) => rows[a][0] - rows[b][0]);
          const times = new Float64Array(n);
          const lngs = new Float64Array(n);
          const lats = new Float64Array(n);
          const cis = new Uint8Array(n);
          for (let i = 0; i < n; i++) {
            const r = rows[order[i]];
            times[i] = r[0];
            lngs[i] = r[1];
            lats[i] = r[2];
            cis[i] = r[3];
          }
          preparedRef.current = {
            n, times, lngs, lats, cis, cats: compact.cats,
            dayCounts: buildDayCounts(times),
            firstTs: n ? times[0] : 0,
            lastTs: n ? times[n - 1] : 0,
          };
          curRef.current = n ? times[0] : 0;
          endRef.current = n ? times[n - 1] : 0;
          rangeRef.current = { from: n ? times[0] : 0, to: n ? times[n - 1] : 0 };
          setRange(rangeRef.current);
          if (!n) {
            // e.g. only a 3-column game_log copy was imported: every row is a
            // position duplicate, so there is nothing to replay.
            setLoadMsg(t("play.empty"));
            setStatus("empty");
            return;
          }
          setCalMonth(new Date(times[n - 1] * 1000).toISOString().slice(0, 7));
          setUi((prev) => ({ ...prev, time: fmtUtc(times[0]) }));
          setStatus("ready");
        }, 30);
      })
      .catch((e) => {
        if (alive) {
          setLoadMsg(e.message);
          setStatus("error");
        }
      });
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  // ---- 2) Apply a time window: MapLibre-native setFilter over a prefetched
  // source span; derived layers throttled separately.
  function applyWindow(cur, force = false) {
    const map = mapRef.current;
    const p = preparedRef.current;
    if (!map || !p || !p.n || !map.getLayer("pb-events")) return;
    const now = performance.now();
    if (!force && now - lastApplyRef.current < FILTER_INTERVAL_MS) return;
    lastApplyRef.current = now;

    const windowSec = Math.max(300, Math.min(30 * 86400, rateRef.current * 4));
    const t0 = cur - windowSec;
    const t1 = cur;
    const lo = lowerBound(p.times, t0);
    const hi = lowerBound(p.times, t1 + 0.0001);

    // Native filter is the authoritative time window. The GeoJSON source holds
    // a *prefetched* span (about 5 windows); setData only runs when the
    // playhead approaches its edge, not on every tick (avoids worker churn /
    // the OOM and unresponsive UI seen with a full 568k-point source).
    const loaded = loadedRef.current;
    const needReload =
      force || !loaded.to ||
      t0 < loaded.from || t1 > loaded.to ||
      t0 < loaded.from + (t1 - t0) * 0.25;
    if (needReload) {
      const l0 = t0 - windowSec * 4;
      const l1 = t1 + windowSec;
      let loLoad = lowerBound(p.times, l0);
      let hiLoad = lowerBound(p.times, l1 + 0.0001);
      if (hiLoad - loLoad > MAX_LOADED_POINTS) {
        // Trim the *future* prefetch first: dropping points inside the visible
        // window would silently violate the "no sampling" guarantee.
        hiLoad = Math.min(hiLoad, loLoad + MAX_LOADED_POINTS);
        if (hiLoad < hi) {
          loLoad = Math.max(lo, hi - MAX_LOADED_POINTS);
          hiLoad = hi;
        }
      }
      const features = new Array(hiLoad - loLoad);
      for (let i = loLoad; i < hiLoad; i++) {
        features[i - loLoad] = {
          type: "Feature",
          geometry: { type: "Point", coordinates: [p.lngs[i], p.lats[i]] },
          properties: { t: p.times[i], c: p.cats[p.cis[i]] },
        };
      }
      map.getSource("pb-events").setData({ type: "FeatureCollection", features });
      loadedRef.current = { from: p.times[loLoad] ?? t0, to: p.times[hiLoad - 1] ?? t1 };
    }
    map.setFilter("pb-events", ["all", [">=", ["get", "t"], t0], ["<=", ["get", "t"], t1]]);

    const layerThrottled = !force && now - lastLayerRef.current < LAYER_INTERVAL_MS;
    if (!layerThrottled) lastLayerRef.current = now;

    if (layerThrottled) return; // derived layers are ~75% of the work: skip entirely

    // Trail lines: break on long time gaps or long jumps (no interpolation).
    const step = Math.max(1, Math.ceil((hi - lo) / MAX_LINE_POINTS));
    const segments = [];
    let seg = [];
    for (let i = lo; i < hi; i += step) {
      const coord = [p.lngs[i], p.lats[i]];
      if (seg.length === 0) {
        seg.push(coord);
        continue;
      }
      const prev = i - step;
      const gap = p.times[i] - p.times[prev];
      const jump = distM(p.lats[prev], p.lngs[prev], p.lats[i], p.lngs[i]);
      if (gap > MAX_LINK_GAP || jump > MAX_LINK_DIST) {
        if (seg.length >= 2) segments.push(seg);
        seg = [coord];
      } else {
        seg.push(coord);
      }
    }
    if (seg.length >= 2) segments.push(seg);
    {
      map.getSource("pb-lines").setData({
        type: "FeatureCollection",
        features: segments.length
          ? [{ type: "Feature", geometry: { type: "MultiLineString", coordinates: segments }, properties: {} }]
          : [],
      });
    }

    // Dwell aggregation: consecutive events within 30 m for >= 60 s.
    const stays = [];
    let s = lo;
    while (s < hi) {
      let e = s + 1;
      let cLat = p.lats[s];
      let cLng = p.lngs[s];
      while (e < hi) {
        const d = distM(cLat, cLng, p.lats[e], p.lngs[e]);
        if (d > STAY_RADIUS_M || p.times[e] - p.times[s] > STAY_MAX_SEC) break;
        const k = e - s;
        cLat = (cLat * k + p.lats[e]) / (k + 1);
        cLng = (cLng * k + p.lngs[e]) / (k + 1);
        e++;
      }
      if (e - s >= 2 && p.times[e - 1] - p.times[s] >= STAY_MIN_SEC) {
        stays.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [cLng, cLat] },
          properties: { n: e - s, dur: Math.round(p.times[e - 1] - p.times[s]) },
        });
        s = e;
      } else {
        s++;
      }
    }
    map.getSource("pb-stays").setData({ type: "FeatureCollection", features: stays });

    const catCounts = {};
    for (let i = lo; i < hi; i++) {
      const c = p.cats[p.cis[i]];
      catCounts[c] = (catCounts[c] || 0) + 1;
    }
    if (scrubRef.current) {
      const span = rangeRef.current.to - rangeRef.current.from || 1;
      scrubRef.current.value = String(Math.round(((cur - rangeRef.current.from) / span) * 1000));
    }
    setUi({ time: fmtUtc(cur), win: hi - lo, cum: hi, stays: stays.length, cats: catCounts });
  }

  // ---- 3) Map + layers.
  useEffect(() => {
    if (status !== "ready" || !containerRef.current || mapRef.current) return;
    const p = preparedRef.current;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: factionStyle(STYLES.intel, readFaction()),
      center: p.n ? [p.lngs[0], p.lats[0]] : [113.264, 23.129],
      zoom: 11,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    mapRef.current = map;
    if (window.__PB_TEST__) window.__pbMap = map; // test hook (set window.__PB_TEST__ before load)
    popupRef.current = new maplibregl.Popup({ closeButton: false, offset: 10, className: 'pb-popup' });

    const attach = () => {
      try {
      if (mapRef.current !== map) return; // StrictMode remount guard
      map.addSource("pb-events", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource("pb-lines", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource("pb-stays", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "pb-lines", type: "line", source: "pb-lines",
        paint: { "line-color": accentColor(), "line-width": 2, "line-opacity": 0.75 },
      });
      map.addLayer({
        id: "pb-stays", type: "circle", source: "pb-stays",
        paint: {
          "circle-color": "#EF9F27", "circle-radius": 7, "circle-opacity": 0.5,
          "circle-stroke-width": 1.5, "circle-stroke-color": "#EF9F27",
        },
      });
      map.addLayer({
        id: "pb-events", type: "circle", source: "pb-events",
        filter: ["==", ["get", "t"], -1],
        paint: {
          "circle-color": ["match", ["get", "c"], ...Object.entries(EVENT_COLORS).flat(), "#888780"],
          "circle-radius": 4,
          "circle-opacity": 1,
          "circle-stroke-width": 0.8,
          "circle-stroke-color": "rgba(255,255,255,0.55)",
        },
      });
      map.on("mousemove", "pb-events", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const cat = f.properties.c;
        // Whitelist: a hand-edited data/events.json must never inject markup or
        // an unexpected category into the popup.
        const safeCat = Object.prototype.hasOwnProperty.call(EVENT_LABELS, cat) ? cat : "other";
        const catColor = EVENT_COLORS[safeCat] ?? "#888780";
        const box = document.createElement("div");
        box.className = "pb-pop";
        const name = document.createElement("b");
        name.style.color = catColor;
        name.textContent = eventLabel(safeCat, EVENT_LABELS[safeCat] ?? safeCat);
        const time = document.createElement("span");
        time.className = "pb-pop-time";
        time.textContent = fmtUtc(f.properties.t);
        box.append(name, time);
        popupRef.current.setLngLat(e.lngLat).setDOMContent(box).addTo(map);
      });
      map.on("mouseleave", "pb-events", () => popupRef.current.remove());
      map.on("mousemove", "pb-stays", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        map.getCanvas().style.cursor = "pointer";
        setHoverStay({ n: f.properties.n, dur: f.properties.dur });
      });
      map.on("mouseleave", "pb-stays", () => {
        map.getCanvas().style.cursor = "";
        setHoverStay(null);
      });
      // Off-screen indicator must track camera moves too (pan/zoom while paused).
      map.on("move", updateOffscreen);

      const el = document.createElement("div");
      el.className = "pb-playhead";
      markerElRef.current = el;
      markerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([p.lngs[0], p.lats[0]])
        .addTo(map);

      if (p.n) {
        setDay(new Date(p.firstTs * 1000).toISOString().slice(0, 10));
        applyWindow(curRef.current, true);
      }
      } catch (err) {
        console.error('[pb] attach FAILED:', err);
        setLoadMsg(`${t("play.errMap")}${err && err.message ? err.message : String(err)}`);
        setStatus("error");
        return;
      }
      setLoadMsg("");
      setMapReady(true);
    };
    if (map.isStyleLoaded()) attach();
    else map.once("style.load", attach);

    return () => {
      cancelAnimationFrame(rafRef.current);
      markerRef.current?.remove();
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [status]);

  // ---- 4) rAF loop: playhead + off-screen indicator every frame,
  // native filter / derived layers / counters throttled.
  function updateOffscreen() {
    const map = mapRef.current;
    const p = preparedRef.current;
    const el = offRef.current;
    if (!map || !p || !p.n || !el || !markerRef.current) return;
    const i = Math.max(0, lowerBound(p.times, curRef.current + 0.0001) - 1);
    const pt = map.project([p.lngs[i], p.lats[i]]);
    const w = map.getCanvas().clientWidth;
    const h = map.getCanvas().clientHeight;
    const inside =
      pt.x >= PAD_X && pt.x <= w - PAD_X &&
      pt.y >= PAD_TOP && pt.y <= h - PAD_BOTTOM;
    const markerEl = markerElRef.current;
    if (inside) {
      el.style.display = "none";
      if (markerEl) markerEl.style.display = "";
      return;
    }
    if (markerEl) markerEl.style.display = "none";
    // Keep the indicator clear of the in-page overlays: the category legend at
    // the top and the note / attribution strip at the bottom.
    const cx = Math.min(Math.max(pt.x, PAD_X), w - PAD_X);
    const cy = Math.min(Math.max(pt.y, PAD_TOP), h - PAD_BOTTOM);
    const angle = (Math.atan2(pt.y - cy, pt.x - cx) * 180) / Math.PI;
    const geo = map.unproject([cx, cy]);
    const distKm = Math.round(distM(geo.lat, geo.lng, p.lats[i], p.lngs[i]) / 1000);

    // Which edge did it leave through? The label always sits on the inner side
    // of the arrow, so it stays on screen even when the playhead is far outside.
    const overLeft = PAD_X - pt.x;
    const overRight = pt.x - (w - PAD_X);
    const overTop = PAD_TOP - pt.y;
    const overBottom = pt.y - (h - PAD_BOTTOM);
    const side =
      Math.max(overLeft, overRight) >= Math.max(overTop, overBottom)
        ? overLeft > 0
          ? "left"
          : "right"
        : overTop > 0
          ? "top"
          : "bottom";

    if (offDistRef.current) offDistRef.current.textContent = `${distKm} km`;
    el.style.display = "flex";
    el.dataset.side = side;
    const bw = el.offsetWidth;
    const bh = el.offsetHeight;
    // The arrow (26 px box) is centred on the clamped edge point; the label
    // extends inward from it.
    const ARROW_HALF = 13;
    let left;
    let top;
    if (side === "left") {
      left = cx - ARROW_HALF;
      top = cy - bh / 2;
    } else if (side === "right") {
      left = cx + ARROW_HALF - bw;
      top = cy - bh / 2;
    } else if (side === "top") {
      left = cx - bw / 2;
      top = cy - ARROW_HALF;
    } else {
      left = cx - bw / 2;
      top = cy + ARROW_HALF - bh;
    }
    // Clamp the whole box inside the canvas (corner cases).
    left = Math.min(Math.max(4, left), w - bw - 4);
    top = Math.min(Math.max(4, top), h - bh - 4);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    if (offArrRef.current) offArrRef.current.style.transform = `rotate(${(angle + 90).toFixed(1)}deg)`;
  }

  function followCamera() {
    const map = mapRef.current;
    const p = preparedRef.current;
    if (!map || !p || !p.n || !followRef.current) return;
    const i = Math.max(0, lowerBound(p.times, curRef.current + 0.0001) - 1);
    const center = [p.lngs[i], p.lats[i]];
    const pt = map.project(center);
    const w = map.getCanvas().clientWidth;
    const h = map.getCanvas().clientHeight;
    const drift = Math.hypot(pt.x - w / 2, pt.y - h / 2);
    // Only re-center when the playhead drifts far from the middle — a smooth
    // per-frame follow would be disorienting and would hammer tile loading.
    if (drift > Math.min(w, h) * 0.3) {
      const now = performance.now();
      if (now - lastFollowRef.current > FOLLOW_INTERVAL_MS) {
        lastFollowRef.current = now;
        map.easeTo({ center, duration: 600, easing: (x) => x });
      }
    }
  }

  // Move the playhead marker (and the off-screen indicator) to `cur`.
  // Used by the animation frame AND by every manual time change (scrub, reset,
  // day pick, rate change, back-to-full) — previously only the rAF loop moved
  // it, so the dot stayed behind while the timeline jumped.
  function syncPlayhead(cur) {
    const p = preparedRef.current;
    if (!p || !p.n) return;
    const i = Math.max(0, lowerBound(p.times, cur + 0.0001) - 1);
    // Smooth playhead: interpolate between the two surrounding events when the
    // gap is short; jump (no interpolation) across long gaps by design.
    let lng = p.lngs[i];
    let lat = p.lats[i];
    const next = i + 1;
    if (next < p.n && cur > p.times[i]) {
      const gap = p.times[next] - p.times[i];
      if (gap > 0 && gap <= MAX_LINK_GAP) {
        const f = (cur - p.times[i]) / gap;
        lng += (p.lngs[next] - lng) * f;
        lat += (p.lats[next] - lat) * f;
      }
    }
    markerRef.current?.setLngLat([lng, lat]);
    updateOffscreen();
  }

  function frame(now) {
    if (!playingRef.current) return;
    const p = preparedRef.current;
    const dt = Math.min(0.1, (now - lastFrameRef.current) / 1000);
    lastFrameRef.current = now;
    curRef.current = Math.min(endRef.current, curRef.current + dt * rateRef.current);
    syncPlayhead(curRef.current);
    if (now - lastApplyRef.current >= FILTER_INTERVAL_MS) applyWindow(curRef.current);
    followCamera();
    if (curRef.current >= endRef.current) {
      playingRef.current = false;
      setPlaying(false);
      applyWindow(curRef.current, true);
      return;
    }
    rafRef.current = requestAnimationFrame(frame);
  }

  const togglePlay = () => {
    const p = preparedRef.current;
    if (!p || !p.n) return;
    if (!playingRef.current && curRef.current >= endRef.current) curRef.current = rangeRef.current.from;
    playingRef.current = !playingRef.current;
    setPlaying(playingRef.current);
    if (playingRef.current) {
      lastFrameRef.current = performance.now();
      rafRef.current = requestAnimationFrame(frame);
    } else {
      cancelAnimationFrame(rafRef.current);
      applyWindow(curRef.current, true);
      syncPlayhead(curRef.current);
    }
  };

  const reset = () => {
    const p = preparedRef.current;
    if (!p) return;
    playingRef.current = false;
    setPlaying(false);
    cancelAnimationFrame(rafRef.current);
    curRef.current = p.firstTs;
    endRef.current = p.lastTs;
    rangeRef.current = { from: p.firstTs, to: p.lastTs };
    setRange(rangeRef.current);
    setSingleDay(false);
    applyWindow(curRef.current, true);
    syncPlayhead(curRef.current);
  };

  const pickRate = (id, sec) => {
    rateRef.current = sec;
    setRate(id);
    applyWindow(curRef.current, true);
  };

  const scrub = (e) => {
    const p = preparedRef.current;
    if (!p) return;
    const { from, to } = rangeRef.current;
    curRef.current = from + (Number(e.target.value) / 1000) * (to - from);
    // Not forced: dragging stays inside the prefetched span and only updates
    // the native filter, so no per-input setData churn.
    applyWindow(curRef.current, false);
    syncPlayhead(curRef.current);
  };

  const pickDay = (dateStr) => {
    setDay(dateStr);
    setCalOpen(false);
    const p = preparedRef.current;
    if (!p) return;
    const start = Date.parse(`${dateStr}T00:00:00Z`) / 1000;
    if (!Number.isFinite(start)) return;
    curRef.current = start;
    endRef.current = start + 86400;
    rangeRef.current = { from: start, to: start + 86400 };
    setRange(rangeRef.current);
    setSingleDay(true);
    // Remember the rate the user was using, so "full range" can restore it.
    prevRateRef.current = { id: rate, sec: rateRef.current };
    rateRef.current = 3600;
    setRate("hour");
    playingRef.current = false;
    setPlaying(false);
    cancelAnimationFrame(rafRef.current);
    applyWindow(curRef.current, true);
    syncPlayhead(curRef.current);
  };

  const backToFull = () => {
    const p = preparedRef.current;
    if (!p) return;
    endRef.current = p.lastTs;
    rangeRef.current = { from: p.firstTs, to: p.lastTs };
    setRange(rangeRef.current);
    setSingleDay(false);
    if (prevRateRef.current) {
      rateRef.current = prevRateRef.current.sec;
      setRate(prevRateRef.current.id);
    }
    applyWindow(curRef.current, true);
    syncPlayhead(curRef.current);
  };

  const toggleFollow = () => {
    const next = !follow;
    setFollow(next);
    followRef.current = next;
    // Fast rates + camera following would hammer tile loading; clamp to day.
    if (next && rateRef.current > 86400) {
      rateRef.current = 86400;
      setRate("day");
    }
  };

  const gl = data.meta?.gameLog ?? {};
  const years =
    gl.firstTs && gl.lastTs
      ? Math.max(1, new Date(gl.lastTs * 1000).getUTCFullYear() - new Date(gl.firstTs * 1000).getUTCFullYear() + 1)
      : "—";
  const totalEvents = fmtCount(gl.coordEvents ?? gl.eventsInFile ?? 0);
  const catLegend = Object.entries(EVENT_COLORS).map(([cat, color]) => ({
    cat, color, label: eventLabel(cat, EVENT_LABELS[cat] ?? cat),
  }));

  // Faction theme: basemap palette + trail line, live (no reload, no setStyle).
  // Legend wording follows the theme: "blue" for Resistance, "green" for Enlightened.
  const accentWord = t(faction === "enlightened" ? "color.accentEnl" : "color.accent");
  useEffect(() => {
    const apply = () => {
      const map = mapRef.current;
      if (!map) return;
      syncFactionPaint(map, STYLES.intel, faction);
      if (map.getLayer("pb-lines")) map.setPaintProperty("pb-lines", "line-color", accentColor());
    };
    apply();
    window.addEventListener("factionchange", apply);
    mapRef.current?.on("style.load", apply);
    return () => {
      window.removeEventListener("factionchange", apply);
      mapRef.current?.off("style.load", apply);
    };
  }, [status, faction]);

  return (
    <div className="page playback-page">
      <div className="playback-head">
        <span className="tag">{t("play.tag")}</span>
        <b>{t("play.title")}</b>
        <span className="playback-sub">{t("play.p1", { years, events: totalEvents })}</span>
      </div>

      {status === "error" && <div className="error-box">{loadMsg || t("play.err")}</div>}
      {status === "empty" && <div className="error-box">{t("play.empty")}</div>}

      <div className="playback-ctrl">
        <button className={`pb-btn ${playing ? "on" : ""}`} onClick={togglePlay} disabled={status !== "ready"}>
          {playing ? t("play.pause") : t("play.play")}
        </button>
        <button className="pb-btn" onClick={reset} disabled={status !== "ready"}>{t("play.reset")}</button>
        <div className="seg">
          {RATES.map(([id, sec]) => (
            <button key={id} className={rate === id ? "on" : ""} onClick={() => pickRate(id, sec)} title={t("play.rateTip")}>
              {t(`play.rate.${id}`)}
            </button>
          ))}
        </div>
        <div className="pb-scrub-wrap">
          {heatGradient && <div className="pb-heat" style={{ background: heatGradient }} />}
          <input ref={scrubRef} className="pb-scrub" type="range" min="0" max="1000" defaultValue="0" onChange={scrub} disabled={status !== "ready"} />
          <div className="pb-ticks">
            {ticks.map((tk, i) => (
              <span key={i} className="pb-tick" style={{ left: `${tk.pct}%` }}>{tk.label}</span>
            ))}
          </div>
        </div>
        <span className="pb-time">{ui.time}</span>
        <button
          className="pb-btn"
          onClick={() => setCalOpen((v) => !v)}
          disabled={status !== "ready"}
          title={t("play.calTip")}
        >
          {t("play.cal")}
        </button>
        <label className="pb-follow" title={t("play.followTip")}>
          <input type="checkbox" checked={follow} onChange={toggleFollow} />
          {t("play.follow")}
        </label>
        {singleDay && <button className="pb-btn" onClick={backToFull}>{t("play.fullBtn")}</button>}
        {calOpen && (
          <div className="pb-cal">
            <div className="pb-cal-head">
              <button onClick={() => shiftMonth(-1)}>‹</button>
              <select className="pb-cal-select" value={calYear} onChange={(e) => setCalMonth(`${e.target.value}-${String(calMonthNum).padStart(2, "0")}`)}>
                {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <select className="pb-cal-select" value={calMonthNum} onChange={(e) => setCalMonth(`${calYear}-${String(e.target.value).padStart(2, "0")}`)}>
                {Array.from({ length: 12 }, (_, m) => <option key={m} value={m + 1}>{m + 1}</option>)}
              </select>
              <button onClick={() => shiftMonth(1)}>›</button>
              <button className="pb-cal-close" onClick={() => setCalOpen(false)}>×</button>
            </div>
            <div className="pb-cal-grid">
              {calCells && calCells.map((c, i) =>
                c ? (
                  <button
                    key={i}
                    className={`pb-cal-day lv${c.level}`}
                    title={`${c.date}: ${c.count.toLocaleString()} events`}
                    onClick={() => pickDay(c.date)}
                  >
                    {c.day}
                  </button>
                ) : (
                  <span key={i} />
                ),
              )}
            </div>
            <div className="pb-cal-hint">{t("play.calHint")}</div>
          </div>
        )}
      </div>

      <div className="playback-stats">
        <span>{t("play.win")}<b>{ui.win.toLocaleString()}</b></span>
        <span>{t("play.cum")}<b>{ui.cum.toLocaleString()}</b></span>
        <span>hack<b>{(ui.cats.hack || 0).toLocaleString()}</b></span>
        <span>{t("play.capture")}<b>{(ui.cats.capture || 0).toLocaleString()}</b></span>
        <span>{t("play.attack")}<b>{(ui.cats.attack || 0).toLocaleString()}</b></span>
        <span>{t("play.deploy")}<b>{(ui.cats.deploy || 0).toLocaleString()}</b></span>
        <span>{t("play.stays")}<b>{ui.stays.toLocaleString()}</b></span>
        <span className="pb-legend">
          <span className="pb-legend-item"><i className="pb-swatch pb-swatch-line" />{t("play.legend.line", { color: accentWord })}</span>
          <span className="pb-legend-item"><i className="pb-swatch pb-swatch-stay" />{t("play.legend.stay")}</span>
          <span className="pb-legend-item"><i className="pb-swatch pb-swatch-head" />{t("play.legend.head", { color: accentWord })}</span>
        </span>
        {hoverStay && (
          <span className="pb-stay-tip">{t("play.stayTip", { n: hoverStay.n, dur: fmtDuration(hoverStay.dur) })}</span>
        )}
      </div>

      <div className="playback-map-wrap">
        <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
        {status !== "empty" && (status !== "ready" || !mapReady) && (
          <div className="playback-loading">{loadMsg || t("play.loading")}</div>
        )}
        <div className="playback-cats">
          <span className="playback-cats-title">{t("play.legend.cats")}</span>
          {catLegend.map((c) => (
            <span key={c.cat} className="pb-cat-item">
              <i className="pb-swatch pb-swatch-cat" style={{ background: c.color }} />
              {c.label}
            </span>
          ))}
        </div>
        <div ref={offRef} className="pb-offscreen" style={{ display: "none" }}>
          <svg ref={offArrRef} width="26" height="26" viewBox="0 0 24 24">
            <path d="M12 1 L17.5 13 L14 13 L14 22 L10 22 L10 13 L6.5 13 Z" stroke="#fff" strokeWidth="1.2" />
          </svg>
          <span ref={offDistRef} className="pb-off-dist" />
        </div>
        <div className="playback-legend">{t("play.note")}</div>
      </div>
    </div>
  );
}
