import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cpSync, existsSync } from "node:fs";

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
        if (existsSync("data")) cpSync("data", "dist/data", { recursive: true });
      },
    },
  ],
});
