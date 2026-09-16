import path from "node:path";
import { fileURLToPath } from "node:url";

import { generationRuntimeEnvironment, superviseGenerationRuntime } from "./generation-runtime.mjs";
import { prepareStandaloneAssets } from "./standalone-assets.mjs";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = process.env.NEXT_DIST_DIR?.trim() || ".next";
const buildRoot = path.join(webRoot, distDir);
const standaloneRoot = path.join(buildRoot, "standalone");
const port = process.env.PORT?.trim() || "3002";

await prepareStandaloneAssets({ webRoot, distDir });

const runtime = generationRuntimeEnvironment({
    environment: {
        ...process.env,
        PORT: port,
        HOSTNAME: process.env.HOSTNAME || "0.0.0.0",
        VOZEB_PRO_DATA_DIR: process.env.VOZEB_PRO_DATA_DIR || path.join(webRoot, ".data"),
        VOZEB_PRO_INTERNAL_ORIGIN: process.env.VOZEB_PRO_INTERNAL_ORIGIN || `http://127.0.0.1:${port}`,
        VOZEB_PRO_MODEL_CONFIG_FILE: process.env.VOZEB_PRO_MODEL_CONFIG_FILE || path.join(webRoot, "config", "models.json"),
        VOZEB_PRO_STANDALONE_STATIC_AUTH: process.env.VOZEB_PRO_STANDALONE_STATIC_AUTH || "1",
    },
});
process.exitCode = await superviseGenerationRuntime({
    app: { command: process.execPath, args: ["server.js"], cwd: standaloneRoot },
    workerScript: path.join(webRoot, "scripts", "generation-worker.mjs"),
    environment: runtime.environment,
});
