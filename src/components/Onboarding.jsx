import { useRef, useState } from "react";
import { ingestFromFiles } from "../dataContext.js";
import { useI18n } from "../i18n.jsx";
import { CHANGELOG } from "../changelog.js";

// Shown when no pre-generated data exists (fresh open-source deployment)
// or when the user opens the app with ?setup=1. Everything is parsed
// locally in the browser; nothing is uploaded anywhere.
export default function Onboarding({ onReady }) {
  const { t, lang } = useI18n();
  const folderInputRef = useRef(null);
  const filesInputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState(null);

  const supportsDirectoryPicker = typeof window.showDirectoryPicker === "function";

  const handleFolder = async () => {
    setError(null);
    try {
      if (supportsDirectoryPicker) {
        const dir = await window.showDirectoryPicker();
        setBusy(true);
        setProgress(t("onb.readingFolder"));
        const files = [];
        for await (const [, handle] of dir.entries()) {
          if (handle.kind === "file") files.push(await handle.getFile());
        }
        await ingest(files);
      } else {
        folderInputRef.current?.click();
      }
    } catch (e) {
      if (e?.name !== "AbortError") fail(e);
    }
  };

  const handleFiles = async () => {
    setError(null);
    try {
      if (typeof window.showOpenFilePicker === "function") {
        const handles = await window.showOpenFilePicker({
          multiple: true,
          types: [{ description: "Ingress game_log export", accept: { "text/tab-separated-values": [".tsv"] } }],
        });
        setBusy(true);
        setProgress(t("onb.readingFiles"));
        const files = [];
        for (const handle of handles) files.push(await handle.getFile());
        await ingest(files);
      } else {
        filesInputRef.current?.click();
      }
    } catch (e) {
      if (e?.name !== "AbortError") fail(e);
    }
  };

  const ingest = async (files) => {
    setProgress(`${t("onb.parsing")}${files.length}${t("onb.parsingTail")}`);
    // yield one frame so the progress text paints before the heavy parse
    await new Promise((r) => setTimeout(r, 30));
    try {
      const data = await ingestFromFiles(files);
      onReady(data);
    } catch (e) {
      fail(e);
    }
  };

  const fail = (e) => {
    setBusy(false);
    setProgress("");
    const msg = e?.message?.includes("game_log") ? t("onb.errNoLog") : (e?.message ?? String(e));
    setError(msg);
  };

  return (
    <div className="page">
      <div className="onboarding">
        <h1>{t("onb.title")}</h1>
        <p className="onb-tagline">
          {t("onb.tagline1")}<b>{t("onb.taglineBold")}</b>{t("onb.tagline2")}
        </p>

        <div className="onb-cards">
          <div className="onb-card featured">
            <h2>{t("onb.folderTitle")}<span className="onb-rec">{t("onb.rec")}</span></h2>
            <p>{t("onb.folderBody")}</p>
            <button onClick={handleFolder} disabled={busy}>
              {supportsDirectoryPicker ? t("onb.folderBtn") : t("onb.folderBtnCompat")}
            </button>
          </div>
          <div className="onb-card">
            <h2>{t("onb.glTitle")}</h2>
            <p>
              {t("onb.glBody1")}<b>{t("onb.glBodyBold")}</b>{t("onb.glBody2")}
              <b>{t("onb.glBodyBold2")}</b>{t("onb.glBody3")}
            </p>
            <button onClick={handleFiles} disabled={busy}>{t("onb.glBtn")}</button>
          </div>
        </div>

        <input
          ref={folderInputRef}
          type="file"
          webkitdirectory=""
          directory=""
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            const files = [...e.target.files];
            if (files.length) {
              setBusy(true);
              setProgress(t("onb.readingFolder"));
              ingest(files);
            }
          }}
        />
        <input
          ref={filesInputRef}
          type="file"
          multiple
          accept=".tsv"
          style={{ display: "none" }}
          onChange={(e) => {
            const files = [...e.target.files];
            if (files.length) {
              setBusy(true);
              setProgress(t("onb.readingFiles"));
              ingest(files);
            }
          }}
        />

        {busy && <div className="onb-status">{progress}</div>}
        {error && <div className="error-box">{error}</div>}

        <div className="onb-features">
          <h3>{t("onb.featuresTitle")}</h3>
          <ul>
            <li>{t("onb.f1")}</li>
            <li>{t("onb.f2")}</li>
            <li>{t("onb.f3")}</li>
            <li>{t("onb.f4")}</li>
            <li>{t("onb.f5")}</li>
            <li>{t("onb.f6")}</li>
          </ul>
          <p className="onb-note">{t("onb.note")}</p>
        </div>

        <div className="onb-changelog">
          <h3>{t("onb.changelogTitle")}</h3>
          <ol className="cl-list">
            {CHANGELOG.map((e, i) => (
              <li key={i} className="cl-item">
                <div className="cl-meta">
                  <span className="cl-date">{e.date}</span>
                  {e.commit && <span className="cl-commit">{e.commit}</span>}
                  {e.unreleased && <span className="cl-tag">{t("onb.unreleased")}</span>}
                </div>
                <p className="cl-text">{lang === "en" ? e.en : e.zh}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
