import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// SINGLEFILE=1 builds one self-contained HTML file (used for design previews).
export default defineConfig({
  plugins: [react(), ...(process.env.SINGLEFILE ? [viteSingleFile()] : [])],
  base: process.env.SINGLEFILE ? "./" : "/",
});
