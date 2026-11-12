import { useData } from "../dataContext.js";
import { useI18n } from "../i18n.jsx";

// Phase-2 placeholder: trajectory playback is designed but intentionally
// not implemented in round one. All data-derived numbers here come from the
// loaded dataset — never hardcoded.
export default function Playback() {
  const { t, fmtCount } = useI18n();
  const data = useData();
  const gl = data.meta?.gameLog ?? {};
  const firstYear = gl.firstTs ? new Date(gl.firstTs * 1000).getUTCFullYear() : null;
  const lastYear = gl.lastTs ? new Date(gl.lastTs * 1000).getUTCFullYear() : null;
  const years = firstYear && lastYear ? Math.max(1, lastYear - firstYear + 1) : "—";
  const events = fmtCount(gl.coordEvents ?? gl.eventsInFile ?? 0);

  return (
    <div className="page">
      <div className="playback-placeholder">
        <span className="tag">{t("play.tag")}</span>
        <h2>{t("play.title")}</h2>
        <p>{t("play.p1", { years, events })}</p>
        <ul>
          <li>{t("play.i1")}</li>
          <li>{t("play.i2")}</li>
          <li>{t("play.i3")}</li>
          <li>{t("play.i4")}</li>
        </ul>
        <p style={{ color: "var(--text-dim)" }}>{t("play.note")}</p>
      </div>
    </div>
  );
}
