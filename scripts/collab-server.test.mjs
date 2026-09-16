import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { createCollabServer } from "./collab-server.mjs";

const cleanups = [];
afterEach(async () => { for (const fn of cleanups.splice(0)) await fn(); });
async function setup() {
    const { server, wss } = createCollabServer("fixture skill");
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    cleanups.push(() => { for (const ws of wss.clients) ws.terminate(); wss.close(); return new Promise(resolve => server.close(resolve)); });
    const join = async (role, secret, id) => {
        const ws = new WebSocket(origin.replace("http:", "ws:") + "/collab/ws");
        const events = [];
        ws.on("message", data => events.push(JSON.parse(data.toString())));
        await new Promise(resolve => ws.once("open", resolve));
        ws.send(JSON.stringify({ type: "join", roomId: "room-test", secret, role, clientId: id, viewerSecret: "viewer-secret", editorSecret: "editor-secret" }));
        await expect.poll(() => events.some(event => event.type === "joined")).toBe(true);
        return { ws, events, send: value => ws.send(JSON.stringify(value)) };
    };
    return { origin, join };
}
describe("collaboration relay", () => {
    it("only serves the server skill through its use action", async () => {
        const { origin } = await setup();
        const skill = await (await fetch(origin + "/collab/skills/server-nuyoah-xiezhen-prompt/use", { method: "POST" })).json();
        expect(skill.instructions).toBe("fixture skill");
        expect((await fetch(origin + "/collab/skills/server-nuyoah-xiezhen-prompt/use")).status).toBe(405);
    });

    it("delivers late-join snapshots, edits, fragmented frames and protects viewer permissions", async () => {
        const { join } = await setup();
        const host = await join("host", "host-secret", "host-client");
        const snapshot = { projectId: "canvas-test", title: "共享画布", nodes: [{ id: "n1", type: "text", metadata: { content: "prompt", apiKey: "test-only" } }], connections: [], viewport: { x: 0, y: 0, k: 1 } };
        const encoded = JSON.stringify({ type: "snapshot", baseRevision: 0, snapshot });
        host.ws.send(encoded.slice(0, 45), { fin: false });
        host.ws.send(encoded.slice(45), { fin: true });
        await expect.poll(() => host.events.find(e => e.type === "snapshot")?.snapshot.revision).toBe(1);
        const viewer = await join("editor", "viewer-secret", "view-client");
        expect(viewer.events.find(e => e.type === "joined").role).toBe("viewer");
        const state = viewer.events.find(e => e.type === "room_state").snapshot;
        expect(state.nodes[0].metadata).toEqual({ content: "prompt" });
        viewer.send({ type: "snapshot", baseRevision: 1, snapshot: { ...snapshot, nodes: [] } });
        await expect.poll(() => viewer.events.some(e => e.message?.includes("查看权限"))).toBe(true);
        const editor = await join("editor", "editor-secret", "edit-client");
        editor.send({ type: "snapshot", baseRevision: 1, snapshot: { ...snapshot, title: "updated" } });
        await expect.poll(() => viewer.events.some(e => e.snapshot?.title === "updated")).toBe(true);
        host.send({ type: "snapshot", baseRevision: 1, snapshot });
        await expect.poll(() => host.events.some(e => e.type === "error" && e.message.includes("更新"))).toBe(true);
        viewer.send({ type: "ping" });
        await expect.poll(() => viewer.events.some(e => e.type === "pong" && e.revision === 2)).toBe(true);
    });
    it("shares media larger than the previous cutoff without dropping bytes", async () => {
        const { origin, join } = await setup();
        await join("host", "host-secret", "host-client");
        const bytes = Buffer.alloc(600_000, 73);
        const upload = await fetch(origin + "/collab/media/room-test", { method: "POST", headers: { Authorization: "Bearer host-secret", "Content-Type": "image/png" }, body: bytes });
        expect(upload.status).toBe(201);
        const { url } = await upload.json();
        const response = await fetch(origin + url);
        expect(Buffer.from(await response.arrayBuffer()).equals(bytes)).toBe(true);
        expect((await fetch(origin + url.split("?")[0])).status).toBe(403);
        expect((await fetch(origin + "/collab/media/room-test", { method: "POST", headers: { Authorization: "Bearer viewer-secret" }, body: bytes })).status).toBe(404);
    });
});
