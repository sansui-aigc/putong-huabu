import path from "node:path";
import { fileURLToPath } from "node:url";

import { generationRuntimeEnvironment, superviseGenerationRuntime } from "./generation-runtime.mjs";

const mode = process.argv[2];
if (mode !== "dev") throw new Error("Usage: run-app.mjs dev");

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextEntry = path.join(webRoot, "node_modules", "next", "dist", "bin", "next");
const port = process.env.PORT?.trim() || "3002";
const runtime = generationRuntimeEnvironment({ environment: { ...process.env, PORT: port }, allowEphemeralToken: true });
const environment = {
    ...runtime.environment,
    PORT: port,
    NEXT_DIST_DIR: runtime.environment.NEXT_DIST_DIR?.trim() || ".next-dev",
    VOZEB_PRO_MODEL_CONFIG_FILE: runtime.environment.VOZEB_PRO_MODEL_CONFIG_FILE?.trim() || path.join(webRoot, "config", "models.json"),
};
if (runtime.ephemeralToken) console.log("Generated ephemeral maintenance and worker tokens for this local development process.");

process.exitCode = await superviseGenerationRuntime({
    app: { command: process.execPath, args: [nextEntry, "dev", "--webpack", "-H", "0.0.0.0", "-p", port], cwd: webRoot },
    workerScript: path.join(webRoot, "scripts", "generation-worker.mjs"),
    environment,
});
