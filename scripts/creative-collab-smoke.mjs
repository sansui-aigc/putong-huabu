import { chromium } from "@playwright/test";
import sharp from "sharp";
import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";

const base = process.env.CREATIVE_SMOKE_URL || "http://127.0.0.1:3002";
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const hostContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const viewerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
const host = await hostContext.newPage();
const viewer = await viewerContext.newPage();
const errors = [];
for (const page of [host, viewer]) page.on("pageerror", error => errors.push(error.message));
await mkdir("artifacts/creative-repair", { recursive: true });
try {
    await host.goto(base + "/canvas");
    await host.getByRole("heading", { name: "我的画布" }).waitFor();
    const png = await sharp(randomBytes(600 * 600 * 3), { raw: { width: 600, height: 600, channels: 3 } }).png().toBuffer();
    assert(png.length > 450_000);
    const project = await host.evaluate(async dataUrl => {
        const response = await fetch("/api/canvas/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "协作回归验证", project: { nodes: [
            { id: "reference-one", type: "image", title: "大图同步验证", position: { x: 60, y: 90 }, width: 260, height: 260, metadata: { content: dataUrl, prompt: "测试参考图", status: "success" } },
            { id: "text-one", type: "text", title: "同步文案", position: { x: 390, y: 90 }, width: 280, height: 180, metadata: { content: "跨浏览器同步检查", prompt: "测试提示词", status: "success" } }
        ], connections: [{ id: "edge-one", fromNodeId: "reference-one", toNodeId: "text-one" }], viewport: { x: 0, y: 0, k: 0.8 } } }) });
        return (await response.json()).data.project;
    }, "data:image/png;base64," + png.toString("base64"));
    await host.goto(base + "/canvas/" + project.id);
    await host.getByRole("button", { name: "打开多人协作", exact: true }).click();
    await host.getByRole("button", { name: "创建协作房间", exact: true }).click();
    const invite = host.getByRole("dialog").locator("input[readonly]").first();
    await invite.waitFor();
    const link = await invite.inputValue();
    assert(link.includes("#collab="));
    await host.getByText("画布已同步", { exact: false }).waitFor();
    await viewer.goto(link);
    await viewer.locator('[data-node-id="reference-one"] img').first().waitFor();
    await viewer.waitForFunction(() => [...document.querySelectorAll('[data-node-id="reference-one"] img')].some(img => img.naturalWidth === 600));
    assert.equal(await viewer.locator('[data-node-id="text-one"]').count(), 1);
    assert.equal(await viewer.getByRole("button", { name: "清空画布", exact: true }).count(), 0);
    await host.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
    await host.getByRole("button", { name: "文本", exact: true }).click();
    await viewer.waitForFunction(() => document.querySelectorAll("[data-node-id]").length >= 3);
    await viewer.getByRole("button", { name: "打开多人协作", exact: true }).click();
    await viewer.getByText("当前权限：查看", { exact: true }).waitFor();
    await viewer.getByText("画布内容", { exact: false }).waitFor();
    const clipped = await viewer.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(clipped, false);
    await host.screenshot({ path: "artifacts/creative-repair/host-desktop.png" });
    await viewer.screenshot({ path: "artifacts/creative-repair/viewer-mobile.png" });
    await viewerContext.setOffline(true);
    await viewerContext.setOffline(false);
    await viewer.reload();
    await viewer.waitForFunction(() => [...document.querySelectorAll('[data-node-id="reference-one"] img')].some(img => img.naturalWidth === 600));
    for (const route of ["/playground", "/unknown-smoke-route", "/canvas"]) {
        await host.goto(base + route);
        await host.waitForURL(url => url.pathname === "/canvas");
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: "PASS", largeImageBytes: png.length, checks: ["isolated browser viewer join", "initial nodes and connection", "large image renders", "new node broadcast", "viewer controls", "mobile overflow", "rejoin snapshot", "canvas/redirect routes", "no page errors"] }));
} catch (error) {
    await host.screenshot({ path: "artifacts/creative-repair/failure-host.png" });
    await viewer.screenshot({ path: "artifacts/creative-repair/failure-viewer.png" });
    console.log(JSON.stringify({ errors, host: (await host.locator("body").innerText()).slice(0, 1800), viewer: (await viewer.locator("body").innerText()).slice(0, 1800) }));
    throw error;
} finally { await browser.close(); }
