import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
    plugins: [react()],
    // Keep standalone builds relocatable so Caddy can mount the workbench
    // below new-api at /creative/ without changing API origins.
    base: process.env.VITE_BASE_PATH || "/",
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    server: { proxy: { "/collab": { target: "http://127.0.0.1:3202", ws: true } } },
    build: { outDir: "dist", emptyOutDir: true, sourcemap: false },
});
