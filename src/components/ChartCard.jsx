import { useRef, useState } from "react";
import { useI18n } from "../i18n.jsx";

const DAY = 86400;

function fmtTs(ts, gran, t) {
  const d = new Date(ts * 1000);
  const y = d.getUTCFullYear();
  if (gran === "y") return `${y}${t("chart.year")}`;
  if (gran === "d") return `${y}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return `${y}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function fmtVal(v, lang) {
  if (v >= 1e8) return lang === "en" ? `${(v / 1e8).toFixed(2)} B` : `${(v / 1e8).toFixed(2)} 亿`;
  if (v >= 1e4) return lang === "en" ? `${(v / 1e3).toFixed(1)} k` : `${(v / 1e4).toFixed(2)} 万`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)} k`;
  return `${Math.round(v * 100) / 100}`;
}

function pct(cur, prev) {
  if (prev == null || prev === 0) return null;
  const p = ((cur - prev) / prev) * 100;
  return `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;
}

// Compact SVG monthly/daily/yearly area chart with hover tooltip.
export default function ChartCard({ name, unit, points, total, gran, color = "#4C9AFF" }) {
  const { t, lang } = useI18n();
  const cardRef = useRef(null);
  const [tip, setTip] = useState(null);

  const pts = points[gran] ?? points.m;
  if (!pts || pts.length < 2) return null;

  const W = 320;
  const H = 96;
  const PAD = 2;
  const values = pts.map((p) => p[1]);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;

  const xy = pts.map(([t, v], i) => [
    PAD + (i / (pts.length - 1)) * (W - PAD * 2),
    H - PAD - ((v - min) / span) * (H - PAD * 2 - 10),
  ]);
  const line = xy.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${W - PAD} ${H} L${PAD} ${H} Z`;

  const onMove = (e) => {
    const rect = cardRef.current.querySelector("svg").getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    let idx = Math.round(((x - PAD) / (W - PAD * 2)) * (pts.length - 1));
    idx = Math.max(0, Math.min(pts.length - 1, idx));
    const [ts, v] = pts[idx];
    const prev = idx > 0 ? pts[idx - 1][1] : null;
    let yoy = null;
    if (gran === "m") {
      for (let j = idx - 1; j >= 0; j--) {
        if (pts[j][0] <= ts - 330 * DAY) { yoy = pts[j][1]; break; }
      }
    } else if (gran === "d") {
      for (let j = idx - 1; j >= 0; j--) {
        if (pts[j][0] <= ts - 360 * DAY) { yoy = pts[j][1]; break; }
      }
    } else {
      yoy = idx >= 1 ? pts[idx - 1][1] : null;
    }
    setTip({ idx, ts, v, mom: pct(v, prev), yoy: pct(v, yoy), x: xy[idx][0], y: xy[idx][1] });
  };

  const fmtTotal = (v) => (v == null ? "—" : fmtVal(v, lang));

  return (
    <div className="chart-card" ref={cardRef} style={{ position: "relative" }}>
      <div className="head">
        <span className="name">{name}</span>
        <span className="total">{fmtTotal(total)} {unit}</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={lang === "en" ? `${name} trend` : `${name}趋势`}
        onMouseMove={onMove}
        onMouseLeave={() => setTip(null)}
      >
        <path d={area} fill={color} opacity="0.14" />
        <path d={line} fill="none" stroke={color} strokeWidth="1.5" />
        <circle cx={xy[xy.length - 1][0]} cy={xy[xy.length - 1][1]} r="2.5" fill={color} />
        {tip && (
          <g>
            <line x1={tip.x} y1={PAD} x2={tip.x} y2={H} stroke={color} strokeWidth="0.8" strokeDasharray="2 2" opacity="0.7" />
            <circle cx={tip.x} cy={tip.y} r="3" fill="#fff" stroke={color} strokeWidth="1.5" />
          </g>
        )}
      </svg>
      <div className="axis">
        <span>{fmtTs(pts[0][0], gran, t)}</span>
        <span>{t("chart.peak")} {fmtVal(max, lang)}</span>
        <span>{fmtTs(pts[pts.length - 1][0], gran, t)}</span>
      </div>
      {tip && (
        <div
          className="chart-tip"
          style={{
            left: `min(calc(${(tip.x / W) * 100}% + 8px), calc(100% - 150px))`,
            top: 4,
          }}
        >
          <div style={{ color: "var(--text-muted)" }}>{fmtTs(tip.ts, gran, t)}</div>
          <div>{fmtVal(tip.v, lang)} {unit}</div>
          <div style={{ color: "var(--text-dim)" }}>
            {t("chart.mom")} {tip.mom ?? "—"} · {t("chart.yoy")} {tip.yoy ?? "—"}
          </div>
        </div>
      )}
    </div>
  );
}
