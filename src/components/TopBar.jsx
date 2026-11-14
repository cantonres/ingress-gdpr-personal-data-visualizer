import { useEffect, useState } from "react";
import { useI18n } from "../i18n.jsx";
import { useFaction, writeFaction, ENLIGHTENED_ACCENT, RESISTANCE_ACCENT } from "../faction.js";

const TABS = [
  ["map", "tab.map"],
  ["heatmap", "tab.heatmap"],
  ["dashboard", "tab.dashboard"],
  ["playback", "tab.playback"],
];

function GitHubIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-label="GitHub">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
      />
    </svg>
  );
}

export default function TopBar({ tab, onTab, tabsDisabled = false, onReset }) {
  const { t, lang, setLang } = useI18n();
  const [aboutOpen, setAboutOpen] = useState(false);
  const faction = useFaction();
  const setFaction = (f) => writeFaction(f);

  return (
    <header className="topbar">
      <div className="brand">
        <span className="xm-dot" />
        {t("brand")}
      </div>
      <nav className="tabs">
        {TABS.map(([id, key]) => (
          <button
            key={id}
            className={!tabsDisabled && tab === id ? "active" : ""}
            onClick={() => onTab(id)}
            disabled={tabsDisabled}
          >
            {t(key)}
          </button>
        ))}
      </nav>
      <div className="topbar-right">
        <div className="faction-switch" title={t("top.faction")} role="group" aria-label={t("top.faction")}>
          <button
            className={faction === "enlightened" ? "on" : ""}
            onClick={() => setFaction("enlightened")}
            aria-pressed={faction === "enlightened"}
          >
            <span className="f-dot" style={{ background: ENLIGHTENED_ACCENT }} />
            {t("faction.enlightened")}
          </button>
          <button
            className={faction === "resistance" ? "on" : ""}
            onClick={() => setFaction("resistance")}
            aria-pressed={faction === "resistance"}
          >
            <span className="f-dot" style={{ background: RESISTANCE_ACCENT }} />
            {t("faction.resistance")}
          </button>
        </div>
        {!tabsDisabled && (
          <button className="top-link" onClick={onReset} title={t("data.reselect")}>
            {t("data.reselect")}
          </button>
        )}
        <button className="lang-switch" onClick={() => setLang(lang === "zh" ? "en" : "zh")} title="中文 / English">
          {t("lang.switch")}
        </button>
        <a
          className="icon-btn"
          href="https://github.com/cantonres/ingress-gdpr-personal-data-visualizer"
          target="_blank"
          rel="noreferrer"
          title={t("map.githubTitle")}
        >
          <GitHubIcon />
        </a>
        <button
          className={`icon-btn ${aboutOpen ? "on" : ""}`}
          onClick={() => setAboutOpen((v) => !v)}
          title={t("about.button")}
          aria-expanded={aboutOpen}
        >
          ⓘ
        </button>
      </div>
      {aboutOpen && (
        <div className="about-popover">
          <div className="about-head">
            <b>{t("about.title")}</b>
            <button onClick={() => setAboutOpen(false)} title={t("about.close")}>×</button>
          </div>
          <p>{t("map.disclaimer")}</p>
          <p className="about-muted">{t("about.local")}</p>
          <a href="https://github.com/cantonres/ingress-gdpr-personal-data-visualizer" target="_blank" rel="noreferrer">
            <GitHubIcon /> {t("about.github")}
          </a>
        </div>
      )}
    </header>
  );
}
