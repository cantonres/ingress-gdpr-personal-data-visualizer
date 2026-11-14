import { useState, useEffect } from "react";
import TopBar from "./components/TopBar.jsx";
import MapWorkspace from "./components/MapWorkspace.jsx";
import HeatmapWorkspace from "./components/HeatmapWorkspace.jsx";
import Dashboard from "./components/Dashboard.jsx";
import Playback from "./components/Playback.jsx";
import Onboarding from "./components/Onboarding.jsx";
import { DataContext, loadPreGenerated } from "./dataContext.js";
import { I18nProvider } from "./i18n.jsx";

export default function AppContainer() {
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading"); // loading | onboarding | ready
  const [tab, setTab] = useState("map");

  const resetData = () => {
    setData(null);
    setState("onboarding");
  };

  useEffect(() => {
    // ?setup=1 forces the onboarding screen (simulate a fresh deployment).
    if (new URLSearchParams(window.location.search).has("setup")) {
      setState("onboarding");
      return;
    }
    loadPreGenerated()
      .then((d) => {
        setData(d);
        setState("ready");
      })
      .catch(() => setState("onboarding"));
  }, []);

  return (
    <I18nProvider>
      {/* Shared header on every screen: language, faction theme, about, GitHub.
          Tabs are inert until data is loaded. */}
      <TopBar tab={tab} onTab={setTab} tabsDisabled={state !== "ready"} onReset={resetData} />
      {state === "loading" && <div className="loading">…</div>}
      {state === "onboarding" && (
        <div className="main">
          <Onboarding
            onReady={(d) => {
              setData(d);
              setState("ready");
            }}
          />
        </div>
      )}
      {state === "ready" && (
        <DataContext.Provider value={{ ...data, resetData }}>
          <div className="main">
            {tab === "map" && <MapWorkspace />}
            {tab === "heatmap" && <HeatmapWorkspace />}
            {tab === "dashboard" && <Dashboard />}
            {tab === "playback" && <Playback />}
          </div>
        </DataContext.Provider>
      )}
    </I18nProvider>
  );
}
