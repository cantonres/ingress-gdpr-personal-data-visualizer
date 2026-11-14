import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cpSync, existsSync, mkdirSync } from "node:fs";

// Only the JSON/GeoJSON the app actually fetches. Everything else in data/
// (notably DATA-NOTES.md and the raw export) must never reach dist/.
const DATA_FILES = [
  "meta.json",
  "dashboard.json",
  "portals.geojson",
  "events.json",
  "opr.geojson",
];

// base "./" so the build output can be served from any sub-path.
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    {
      name: "copy-data",
      // Keep generated data/ next to dist/ on build so the static
      // bundle can fetch it without a special server layout.
      closeBundle() {
        if (!existsSync("data")) return;
        mkdirSync("dist/data", { recursive: true });
        for (const file of DATA_FILES) {
          if (existsSync(`data/${file}`)) cpSync(`data/${file}`, `dist/data/${file}`);
        }
      },
    },
  ],
});
