import { useState } from "react";
import ChartCard from "./ChartCard.jsx";
import { useData } from "../dataContext.js";
import { useI18n } from "../i18n.jsx";

const CHART_COLORS = ["#4C9AFF", "#378ADD", "#EF9F27", "#7F77DD", "#D4537E", "#97C459", "#5C8DFF", "#E24B4A", "#888780"];

const GRANS = [["d", "dash.granD"], ["m", "dash.granM"], ["y", "dash.granY"]];

const CARD_TOTALS = [
  ["portals.upv", "dash.statUpv"],
  ["portals.captured", "dash.statUpc"],
  ["kilometers_walked", "dash.statKm"],
  ["xm_collected", "dash.statXm"],
  ["hacks", "dash.statHacks"],
  ["portals_captured", "dash.statCaptures"],
  ["missions_completed", "dash.statMissions"],
];

function fmtNum(v, lang) {
  if (v == null) return "—";
  if (v >= 1e8) return lang === "en" ? `${(v / 1e8).toFixed(2)} B` : `${(v / 1e8).toFixed(2)} 亿`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)} M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)} k`;
  return `${Math.round(v * 100) / 100}`;
}

export default function Dashboard() {
  const data = useData();
  const { t, lang, seriesName, unit } = useI18n();
  const meta = data.meta;
  const series = data.dashboard.series;
  const [gran, setGran] = useState("m");

  if (!meta || !series) return <div className="loading">…</div>;

  const totals = {};
  for (const s of series) totals[s.id] = s.total;
  const ALIAS = { hacks: "gl_hack", portals_captured: "gl_capture" };
  const getStat = (path) => {
    if (path.includes(".")) {
      const [a, b] = path.split(".");
      return meta[a]?.[b];
    }
    return totals[path] ?? totals[ALIAS[path]];
  };

  return (
    <div className="page">
      <div className="page-inner">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            game_log {meta.gameLog.uniqueRows.toLocaleString()} {t("dash.rows")}
            {meta.gameLog.duplicatesRemoved > 0
              ? `${t("dash.dedup")}${meta.gameLog.duplicatesRemoved.toLocaleString()} ${t("dash.rows")}${t("dash.dedupTail")}`
              : ""}
            <span style={{ marginLeft: 12 }}>
              {new Date(meta.gameLog.firstTs * 1000).getUTCFullYear()} – {new Date(meta.gameLog.lastTs * 1000).getUTCFullYear()}
            </span>
          </div>
          <div className="seg">
            {GRANS.map(([id, key]) => (
              <button key={id} className={gran === id ? "on" : ""} onClick={() => setGran(id)}>
                {t(key)}
              </button>
            ))}
          </div>
        </div>

        <div className="stat-cards">
          {CARD_TOTALS.map(([path, key]) => (
            <div className="stat-card" key={path}>
              <div className="label">{t(key)}</div>
              <div className="value">{fmtNum(getStat(path), lang)}</div>
            </div>
          ))}
        </div>


        {series.length === 0 && (
          <div className="text-block">
            <h3>{t("dash.emptyTitle")}</h3>
            <pre>{t("dash.emptyBody")}</pre>
          </div>
        )}
        {series.length > 0 && series.every((s) => s.id.startsWith("gl_")) && (
          <div className="text-block">
            <h3>{t("dash.partialTitle")}</h3>
            <pre>
              {t("dash.partialBody")}
              <a href="#" onClick={(e) => { e.preventDefault(); data.resetData?.(); }} style={{ color: "var(--accent)" }}>
                {t("dash.partialLink")}
              </a>
              {t("dash.partialTail")}
            </pre>
          </div>
        )}

        <div className="chart-grid">
          {series.map((s, i) => (
            <ChartCard
              key={s.id}
              name={seriesName(s)}
              unit={unit(s.unit)}
              points={s.points}
              total={s.total}
              gran={gran}
              color={CHART_COLORS[i % CHART_COLORS.length]}
            />
          ))}
        </div>

        {meta.badges?.length > 0 && (
          <div className="text-block">
            <h3>
              {t("dash.badgesTitle")}{meta.badges.length}{t("dash.badgesUnit")}
              <a href="https://ingress.plus/badges" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                ingress.plus
              </a>
              {lang === "zh" ? "）" : ")"}
            </h3>
            <div className="badge-grid">
              {meta.badges.map((b, i) => (
                <div key={i} className="badge-item" title={`${b.tier} ${b.name} · ${b.date}`}>
                  <img src={b.iconUrl} alt={`${b.tier} ${b.name}`} loading="lazy" width={48} height={48} />
                  <span className="badge-name">{b.tier} {b.name}</span>
                  <span className="badge-date">{b.date.slice(0, 10)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {meta.commMentions?.length > 0 && (
          <div className="text-block">
            <h3>{t("dash.commTitle")}{meta.commMentions.length}{t("dash.commUnit")}</h3>
            <pre>{meta.commMentions.map(([tm, msg]) => `${tm}  ${msg}`).join("\n")}</pre>
          </div>
        )}
        {meta.profile && <div className="text-block"><h3>{t("dash.profileTitle")}</h3><pre>{meta.profile}</pre></div>}
        {meta.devices && <div className="text-block"><h3>{t("dash.devicesTitle")}</h3><pre>{meta.devices}</pre></div>}
        {meta.storePurchases && <div className="text-block"><h3>{t("dash.storeTitle")}</h3><pre>{meta.storePurchases}</pre></div>}
        {meta.recursions && <div className="text-block"><h3>{t("dash.recursionsTitle")}</h3><pre>{meta.recursions}</pre></div>}
      </div>
    </div>
  );
}
