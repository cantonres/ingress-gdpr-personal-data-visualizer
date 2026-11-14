import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { STYLES, EVENT_COLORS, EVENT_LABELS, EVENT_DESC, UPV_COLOR, UPC_COLOR, fmtDate } from "./mapShared.js";
import { useFaction, factionStyle, syncFactionPaint, readFaction } from "../faction.js";
import { useData } from "../dataContext.js";
import { eventsToGeoJSON } from "../lib/ingestCore.js";
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

const DEFAULT_CAT = "login";

export default function MapWorkspace() {
  const data = useData();
  const { t, eventLabel, eventDesc } = useI18n();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const eventsRef = useRef(null);
  const oprRef = useRef(null);
  const stateRef = useRef({ cats: new Set([DEFAULT_CAT]), upc: false, upv: true });
  const [base, setBase] = useState("intel");
  const faction = useFaction();
  const [cats, setCats] = useState(new Set([DEFAULT_CAT]));
  const [portalLayers, setPortalLayers] = useState({ upc: false, upv: true });
  const [eventsOn, setEventsOn] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [oprOn, setOprOn] = useState(false);
  const [error, setError] = useState(null);
  const [hover, setHover] = useState(null);
  const firstStyleEffect = useRef(true);
  const meta = data.meta;

  useEffect(() => {
    stateRef.current = { cats, ...portalLayers, oprOn };
  }, [cats, portalLayers, oprOn]);

  const applyPortals = (map, fc) => {
    if (map.getSource("portals") && map.getLayer("portal-captured")) {
      refreshFilters(map);
      return;
    }
    ["portal-visited", "portal-captured"].forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    if (map.getSource("portals")) map.removeSource("portals");
    try {
      map.addSource("portals", { type: "geojson", data: fc });
      // UPV layer = every portal with any portal-anchored game_log event
      map.addLayer({
        id: "portal-visited",
        type: "circle",
        source: "portals",
        paint: {
          "circle-color": UPV_COLOR,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 1.6, 11, 3, 16, 5],
          "circle-opacity": 0.55,
        },
      });
      map.addLayer({
        id: "portal-captured",
        type: "circle",
        source: "portals",
        filter: ["==", ["get", "s"], "captured"],
        paint: {
          "circle-color": UPC_COLOR,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 2, 11, 3.5, 16, 6],
          "circle-opacity": 0.85,
          "circle-stroke-width": 0.5,
          "circle-stroke-color": "rgba(14,27,32,0.6)",
        },
      });
    } catch (err) {
      console.warn("applyPortals skipped:", err.message);
      return;
    }
    for (const id of ["portal-captured", "portal-visited"]) {
      map.on("mousemove", id, (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties;
        const parts = [];
        if (p.s === "captured") parts.push(`${t("map.hoverCaptured")} ${p.c} ${t("map.hoverTimes")}`);
        else parts.push(t("map.hoverVisited"));
        if (p.h > 0) parts.push(`${t("map.hoverHack")} ${p.h} ${t("map.hoverTimes")}`);
        if (p.d > 0) parts.push(`${t("map.hoverDeploy")} ${p.d}`);
        if (p.u > 0) parts.push(`${t("map.hoverUpgrade")} ${p.u}`);
        if (p.m > 0) parts.push(`${t("map.hoverMod")} ${p.m}`);
        setHover({ x: e.point.x, y: e.point.y, text: parts.join(" · ") });
      });
      map.on("mouseleave", id, () => setHover(null));
    }
    // events draw on top of portals
    if (map.getLayer("events-points")) map.moveLayer("events-points");
    if (map.getLayer("opr-points")) map.moveLayer("opr-points");
    refreshFilters(map);
  };

  const applyEvents = (map, compact) => {
    // Only active categories are converted into GeoJSON features — the
    // 568k-row compact file stays in memory, the map renders just a few
    // thousand points (default: 登录). This is the key loading speedup.
    const fc = eventsToGeoJSON(compact, stateRef.current.cats);
    if (map.getSource("events")) {
      try {
        map.getSource("events").setData(fc);
        refreshFilters(map);
        return;
      } catch (err) {
        console.warn("events setData failed, rebuilding:", err.message);
      }
    }
    if (map.getLayer("events-points")) map.removeLayer("events-points");
    if (map.getSource("events")) map.removeSource("events");
    try {
      map.addSource("events", { type: "geojson", data: fc });
      map.addLayer({
        id: "events-points",
        type: "circle",
        source: "events",
        paint: {
          "circle-color": ["match", ["get", "c"], ...Object.entries(EVENT_COLORS).flat(), "#888780"],
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"], 4, 1.3, 11, 2.4, 16, 4,
          ],
          "circle-opacity": 0.5,
        },
      });
    } catch (err) {
      console.warn("applyEvents skipped:", err.message);
      return;
    }
    refreshFilters(map);
  };

  const applyOpr = (map, fc) => {
    if (map.getSource("opr") && map.getLayer("opr-points")) {
      map.setLayoutProperty("opr-points", "visibility", stateRef.current.oprOn ? "visible" : "none");
      return;
    }
    if (map.getLayer("opr-points")) map.removeLayer("opr-points");
    if (map.getSource("opr")) map.removeSource("opr");
    try {
      map.addSource("opr", { type: "geojson", data: fc });
      map.addLayer({
        id: "opr-points",
        type: "circle",
        source: "opr",
        paint: {
          "circle-color": "#E29BD8",
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 1.6, 11, 3, 16, 5],
          "circle-opacity": 0.85,
          "circle-stroke-width": 0.5,
          "circle-stroke-color": "rgba(14,27,32,0.6)",
        },
      });
    } catch (err) {
      console.warn("applyOpr skipped:", err.message);
      return;
    }
    map.setLayoutProperty("opr-points", "visibility", stateRef.current.oprOn ? "visible" : "none");
    if (map.getLayer("events-points")) map.moveLayer("opr-points");
  };

  const refreshFilters = (map) => {
    const { cats } = stateRef.current;
    if (map.getLayer("events-points")) {
      map.setFilter("events-points", ["in", ["get", "c"], ["literal", [...cats]]]);
    }
    const { upc, upv } = stateRef.current;
    if (map.getLayer("portal-captured")) map.setLayoutProperty("portal-captured", "visibility", upc ? "visible" : "none");
    if (map.getLayer("portal-visited")) map.setLayoutProperty("portal-visited", "visibility", upv ? "visible" : "none");
  };

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: factionStyle(STYLES.intel, readFaction()),
      center: initialView().center,
      zoom: initialView().zoom,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    mapRef.current = map;
    if (window.__PB_TEST__) window.__mwMap = map; // test hook (set window.__PB_TEST__ before load)
    const onReady = () => {
      applyPortals(map, data.portalsFC);
      if (eventsRef.current) applyEvents(map, eventsRef.current);
      if (oprRef.current) applyOpr(map, oprRef.current);
    };
    if (map.isStyleLoaded()) onReady();
    else map.on("load", onReady);
    map.on("style.load", () => {
      applyPortals(map, data.portalsFC);
      if (eventsRef.current) applyEvents(map, eventsRef.current);
      if (oprRef.current) applyOpr(map, oprRef.current);
    });
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (firstStyleEffect.current) {
      firstStyleEffect.current = false;
      return;
    }
    const map = mapRef.current;
    if (map) map.setStyle(STYLES[base]);
  }, [base]);

  // Faction palette: repaint basemap layers in place (data layers untouched).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (mapRef.current === map) syncFactionPaint(map, STYLES[base], faction);
    };
    apply();
    map.on("style.load", apply);
    return () => map.off("style.load", apply);
  }, [base, faction]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    refreshFilters(map);
    if (!eventsOn) return;
    if (eventsRef.current) {
      applyEvents(map, eventsRef.current); // category toggles -> setData
      return;
    }
    if (eventsLoading) return;
    setEventsLoading(true);
    data
      .getEvents()
      .then((compact) => {
        if (mapRef.current !== map) return;
        eventsRef.current = compact;
        applyEvents(map, compact);
      })
      .catch((err) => setError(`${t("map.errEvents")}${err.message}`))
      .finally(() => setEventsLoading(false));
  }, [eventsOn, cats, portalLayers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!oprOn) {
      if (map.getLayer("opr-points")) map.setLayoutProperty("opr-points", "visibility", "none");
      return;
    }
    if (!data.getOpr) return;
    if (oprRef.current) {
      applyOpr(map, oprRef.current);
      return;
    }
    data
      .getOpr()
      .then((fc) => {
        if (mapRef.current !== map) return;
        oprRef.current = fc;
        applyOpr(map, fc);
      })
      .catch((err) => setError(`${t("map.errOpr")}${err.message}`));
  }, [oprOn]);

  const toggleCat = (cat) => {
    setCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  return (
    <div className="map-wrap">
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />

      <div className="map-ctrl map-ctrl-col">
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div className="seg">
            <button className={base === "intel" ? "on" : ""} onClick={() => setBase("intel")}>{t("map.styleIntel")}</button>
            <button className={base === "light" ? "on" : ""} onClick={() => setBase("light")}>{t("map.styleLight")}</button>
          </div>
          <label className={portalLayers.upc ? "on" : ""}>
            <input type="checkbox" checked={portalLayers.upc} onChange={() => setPortalLayers((p) => ({ ...p, upc: !p.upc }))} />
            UPC
          </label>
          <label className={portalLayers.upv ? "on" : ""}>
            <input type="checkbox" checked={portalLayers.upv} onChange={() => setPortalLayers((p) => ({ ...p, upv: !p.upv }))} />
            UPV
          </label>
          <label className={eventsOn ? "on" : ""}>
            <input type="checkbox" checked={eventsOn} onChange={(e) => setEventsOn(e.target.checked)} />
            {t("map.events")}{eventsLoading ? t("map.loading") : ""}
          </label>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
          {eventsOn && !eventsLoading &&
            Object.entries(EVENT_LABELS).map(([k, label]) => (
              <span
                key={k}
                onClick={() => toggleCat(k)}
                className={cats.has(k) ? "chip chip-on" : "chip"}
                style={cats.has(k) ? { "--chip-color": EVENT_COLORS[k] } : {}}
                title={eventDesc(k, EVENT_DESC[k])}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: cats.has(k) ? EVENT_COLORS[k] : "transparent", border: `1px solid ${EVENT_COLORS[k]}`, display: "inline-block" }} />
                {eventLabel(k, label)}
              </span>
            ))}
          {eventsOn && !eventsLoading && data.getOpr && (
            <span
              onClick={() => setOprOn((v) => !v)}
              className={oprOn ? "chip chip-on" : "chip"}
              style={oprOn ? { "--chip-color": "#E29BD8" } : {}}
              title={eventDesc("opr", EVENT_DESC.opr)}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: oprOn ? "#E29BD8" : "transparent", border: "1px solid #E29BD8", display: "inline-block" }} />
              {t("map.oprChip")}
            </span>
          )}
        </div>
      </div>

      {meta && (
        <div className="map-stats">
          <span className="upv">UPV<b>{meta.portals.upv.toLocaleString()}</b></span>
          <span className="upc">UPC<b>{meta.portals.captured.toLocaleString()}</b></span>
          <span>{t("map.activeRange")}<b>{fmtDate(meta.gameLog.firstTs)} ~ {fmtDate(meta.gameLog.lastTs)}</b></span>
        </div>
      )}
      {hover && (
        <div style={{ position: "absolute", left: hover.x + 14, top: hover.y + 10, zIndex: 6, pointerEvents: "none", background: "rgba(14,27,32,0.95)", border: "0.5px solid var(--border)", borderRadius: 6, padding: "4px 10px", fontSize: 12, color: "var(--text)" }}>
          {hover.text}
        </div>
      )}
      {error && <div className="error-box" style={{ position: "absolute", top: 60, left: 12, zIndex: 5 }}>{error}</div>}
    </div>
  );
}
