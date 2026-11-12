import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { STYLES } from "./mapShared.js";
import { useData } from "../dataContext.js";
import { useI18n } from "../i18n.jsx";

maplibregl.setWorkerUrl(mapWorkerUrl);

// Optional deep-link view params: ?lat=23.129&lng=113.264&zoom=12
function initialView() {
  const p = new URLSearchParams(window.location.search);
  const lat = parseFloat(p.get("lat"));
  const lng = parseFloat(p.get("lng"));
  const zoom = parseFloat(p.get("zoom"));
  return {
    center: [Number.isFinite(lng) ? lng : 109.5, Number.isFinite(lat) ? lat : 25],
    zoom: Number.isFinite(zoom) ? zoom : 4,
  };
}

// weight = portal action count, log-ish scale via interpolation stops
const METRICS = {
  h: { labelKey: "heat.hack", color: "#97C459", stops: [1, 3, 10, 30, 100, 300] },
  c: { labelKey: "heat.capture", color: "#28EE4E", stops: [1, 2, 3, 5, 10, 20] },
  d: { labelKey: "heat.deploy", color: "#378ADD", stops: [1, 3, 10, 30, 100, 300] },
  u: { labelKey: "heat.upgrade", color: "#45C6D8", stops: [1, 3, 10, 30, 100, 300] },
};

const HEAT_COLOR = [
  "interpolate",
  ["linear"],
  ["heatmap-density"],
  0, "rgba(0,0,0,0)",
  0.2, "#1a4a8a",
  0.4, "#1d75c8",
  0.6, "#efc745",
  0.8, "#ef8f27",
  1, "#e24b4a",
];

const weightExpr = (key) => {
  const metric = METRICS[key];
  const stops = metric.stops;
  // 0 -> invisible; count 1 -> density 0.3 (visible blue); log-ish up to 1.0.
  return [
    "interpolate",
    ["linear"],
    ["coalesce", ["get", key], 0],
    0, 0,
    ...stops.flatMap((s, i) => [s, 0.3 + (i / (stops.length - 1)) * 0.7]),
    stops[stops.length - 1] * 3, 1.2,
  ];
};

export default function HeatmapWorkspace() {
  const data = useData();
  const { t } = useI18n();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const dataRef = useRef(null);
  const stateRef = useRef({ active: new Set(["h"]) });
  const [base, setBase] = useState("intel");
  const [active, setActive] = useState(new Set(["h"]));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const firstStyleEffect = useRef(true);

  const rebuildLayers = (map) => {
    for (const key of Object.keys(METRICS)) {
      const id = `heat-${key}`;
      if (map.getLayer(id)) map.removeLayer(id);
    }
    if (!map.getSource("portals-heat")) {
      map.addSource("portals-heat", { type: "geojson", data: dataRef.current });
    }
    for (const key of Object.keys(METRICS)) {
      if (!stateRef.current.active.has(key)) continue;
      map.addLayer({
        id: `heat-${key}`,
        type: "heatmap",
        source: "portals-heat",
        paint: {
          "heatmap-weight": weightExpr(key),
          "heatmap-intensity": 0.9,
          "heatmap-color": HEAT_COLOR,
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 4, 18, 10, 45, 14, 80],
          "heatmap-opacity": 0.75,
        },
      });
    }
  };

  useEffect(() => {
    stateRef.current = { active };
    const map = mapRef.current;
    if (map && dataRef.current && map.isStyleLoaded()) rebuildLayers(map);
  }, [active]);

  useEffect(() => {
    if (firstStyleEffect.current) {
      firstStyleEffect.current = false;
      return;
    }
    const map = mapRef.current;
    if (map) map.setStyle(STYLES[base]);
  }, [base]);

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLES.intel,
      center: initialView().center,
      zoom: initialView().zoom,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    mapRef.current = map;
    const onReady = () => {
      dataRef.current = data.portalsFC;
      setLoading(false);
      rebuildLayers(map);
    };
    // "load" may already have fired synchronously for cached styles.
    if (map.isStyleLoaded()) onReady();
    else map.on("load", onReady);
    map.on("style.load", () => {
      if (dataRef.current) rebuildLayers(map);
    });
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const toggle = (key) => {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="map-wrap">
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      <div className="map-ctrl map-ctrl-col">
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div className="seg">
            <button className={base === "intel" ? "on" : ""} onClick={() => setBase("intel")}>{t("map.styleIntel")}</button>
            <button className={base === "light" ? "on" : ""} onClick={() => setBase("light")}>{t("map.styleLight")}</button>
          </div>
          {loading && <span style={{ color: "var(--text-muted)" }}>{t("heat.loading")}</span>}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
          {Object.entries(METRICS).map(([key, m]) => (
            <span
              key={key}
              onClick={() => toggle(key)}
              className={active.has(key) ? "chip chip-on" : "chip"}
              style={active.has(key) ? { "--chip-color": m.color } : {}}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: active.has(key) ? m.color : "transparent", border: `1px solid ${m.color}`, display: "inline-block" }} />
              {t(m.labelKey)}
            </span>
          ))}
        </div>
        {active.size > 0 && (() => {
          const activeKeys = Object.keys(METRICS).filter((k) => active.has(k));
          const single = activeKeys.length === 1 ? METRICS[activeKeys[0]] : null;
          const ticks = single ? [0, ...single.stops] : null;
          return (
            <div className="colorbar" style={{ marginTop: 6 }}>
              <div className="colorbar-label">
                {single
                  ? `${t(single.labelKey)}${t("heat.single")}`
                  : t("heat.multi")}
              </div>
              <div className="colorbar-gradient" />
              <div className="colorbar-ticks">
                {(ticks ?? [t("heat.weak"), "", "", "", "", t("heat.strong")]).map((v, i, arr) => (
                  <span
                    key={i}
                    style={
                      i === 0
                        ? { left: 0 }
                        : i === arr.length - 1
                          ? { right: 0, transform: "none", left: "auto" }
                          : { left: `${(i / (arr.length - 1)) * 100}%` }
                    }
                  >
                    {v}
                  </span>
                ))}
              </div>
            </div>
          );
        })()}
        <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
          {t("heat.note")}
        </div>
      </div>
      {error && <div className="error-box" style={{ position: "absolute", top: 60, left: 12, zIndex: 5 }}>{error}</div>}
    </div>
  );
}
