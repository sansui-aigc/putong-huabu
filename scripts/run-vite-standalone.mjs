import { spawn } from "node:child_process";
const processes = [
    spawn(process.execPath, ["scripts/collab-relay.mjs"], { stdio: "inherit", windowsHide: true }),
    spawn(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["exec", "vite", "--host", "0.0.0.0", "--port", process.env.PORT || "3002"], { stdio: "inherit", windowsHide: true, shell: process.platform === "win32" }),
];
const stop = () => processes.forEach(child => child.kill());
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
process.on("exit", stop);
await Promise.race(processes.map(child => new Promise(resolve => child.once("exit", resolve))));
stop();
