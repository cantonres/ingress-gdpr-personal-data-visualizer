// Faction theme: Resistance keeps the original blue palette; Enlightened
// shifts the cool blue hues of the basemap toward green, preserving the
// lightness / saturation of every colour so the map keeps its contrast.
import { useEffect, useState } from "react";

export const FACTION_KEY = "gdpr.faction";
export const RESISTANCE_ACCENT = "#4C9AFF";
export const ENLIGHTENED_ACCENT = "#2fd98c";

// Cool hues (blue / teal) rotate by this much: ~207deg -> ~149deg (green).
// Saturation is capped so large fills (water, landuse) stay muted like the
// dark intel basemap instead of turning vivid green.
const ENLIGHTENED_HUE_SHIFT = -58;
const MAX_SATURATION = 0.30;
const SATURATION_SCALE = 0.9;
const COOL_HUE_MIN = 165;
const COOL_HUE_MAX = 275;
const MIN_SATURATION = 0.08; // near-greys (white labels, neutral darks) stay put

export function readFaction() {
  try {
    return localStorage.getItem(FACTION_KEY) === "enlightened" ? "enlightened" : "resistance";
  } catch {
    return "resistance";
  }
}

export function applyFactionAttr(faction) {
  if (faction === "enlightened") document.documentElement.dataset.faction = "enlightened";
  else delete document.documentElement.dataset.faction;
}

export function writeFaction(faction) {
  try {
    localStorage.setItem(FACTION_KEY, faction);
  } catch {
    /* storage unavailable: theme applies for this session only */
  }
  // Apply synchronously before notifying: listeners read --accent, which
  // derives from data-faction.
  applyFactionAttr(faction);
  window.dispatchEvent(new Event("factionchange"));
}

export function useFaction() {
  const [faction, setFaction] = useState(readFaction);
  useEffect(() => {
    // Re-apply the stored preference on startup: writeFaction() only runs on a
    // click, so without this a reload restored the UI state but left --accent
    // (and the basemap) on the default blue theme.
    applyFactionAttr(readFaction());
    const sync = () => setFaction(readFaction());
    window.addEventListener("factionchange", sync);
    return () => window.removeEventListener("factionchange", sync);
  }, []);
  return faction;
}

// ---- colour maths -------------------------------------------------------

function parseColor(str) {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(str);
  if (hex) {
    let v = hex[1];
    if (v.length === 3) v = v.split("").map((c) => c + c).join("");
    const n = parseInt(v, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1, kind: "hex" };
  }
  const rgb = /^rgba?\(\s*(\d+)\s*[,\s]\s*(\d+)\s*[,\s]\s*(\d+)\s*(?:[,/]\s*([\d.]+)\s*)?\)$/i.exec(str);
  if (rgb) {
    return { r: +rgb[1], g: +rgb[2], b: +rgb[3], a: rgb[4] === undefined ? 1 : +rgb[4], kind: "rgb" };
  }
  return null;
}

function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return { h: h * 360, s, l };
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [r + m, g + m, b + m].map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255));
}

function shiftColor(value) {
  const c = parseColor(value);
  if (!c) return null;
  const { h, s, l } = rgbToHsl(c.r, c.g, c.b);
  if (s < MIN_SATURATION) return null; // neutral: white text, greys
  if (h < COOL_HUE_MIN || h > COOL_HUE_MAX) return null; // reds / greens / oranges
  const shiftedSat = Math.min(s, MAX_SATURATION) * SATURATION_SCALE;
  const [r, g, b] = hslToRgb(h + ENLIGHTENED_HUE_SHIFT, shiftedSat, l);
  if (c.kind === "hex") {
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  }
  return `rgba(${r},${g},${b},${c.a})`;
}

function shiftPaintValue(value) {
  if (typeof value === "string") return shiftColor(value) ?? value;
  if (Array.isArray(value)) return value.map(shiftPaintValue);
  return value;
}

// Returns a style whose paint colours follow the faction. Resistance returns
// the original style untouched (the shipped blue-teal intel look).
export function factionStyle(style, faction) {
  if (faction !== "enlightened") return style;
  return {
    ...style,
    layers: style.layers.map((layer) => {
      if (!layer.paint) return layer;
      let changed = false;
      const paint = {};
      for (const [prop, value] of Object.entries(layer.paint)) {
        const next = shiftPaintValue(value);
        paint[prop] = next;
        if (next !== value) changed = true;
      }
      return changed ? { ...layer, paint } : layer;
    }),
  };
}

// Live palette swap without map.setStyle(): rewrite each basemap layer's paint
// in place, so data layers, event handlers and camera state survive untouched.
export function syncFactionPaint(map, baseStyle, faction) {
  if (!map) return;
  const tinted = factionStyle(baseStyle, faction);
  for (const layer of tinted.layers) {
    if (!layer.paint || !map.getLayer(layer.id)) continue;
    for (const [prop, value] of Object.entries(layer.paint)) {
      map.setPaintProperty(layer.id, prop, value);
    }
  }
}
