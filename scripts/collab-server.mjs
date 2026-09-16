import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";

const maxMediaBytes = 20 * 1024 * 1024;
const maxRoomBytes = 256 * 1024 * 1024;
const secretPattern = /^[A-Za-z0-9_-]{8,120}$/;

export function createCollabServer(instructions) {
    const rooms = new Map();
    const skill = typeof instructions === "string" ? { instructions } : instructions;
    const json = (res, status, data) => { res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(data)); };
    const server = createServer(async (req, res) => {
        try {
            const url = new URL(req.url, "http://collab.local");
            if (url.pathname === "/healthz") return json(res, 200, { ok: true, protocol: 2, rooms: rooms.size });
            if (url.pathname === "/collab/skills/server-nuyoah-xiezhen-prompt/use") {
                if (req.method !== "POST") return json(res, 405, { error: "只支持使用请求" });
                return json(res, 200, { id: skill.id || "server-nuyoah-xiezhen-prompt", version: skill.version || 2, source: skill.source, sourceCommit: skill.sourceCommit, files: skill.files, instructions: skill.instructions });
            }
            const match = url.pathname.match(/^\/collab\/media\/([\w-]+)(?:\/([\w-]+))?$/);
            if (!match) return json(res, 404, { error: "not found" });
            const room = rooms.get(match[1]);
            const token = req.headers.authorization?.replace(/^Bearer /, "") || url.searchParams.get("access");
            const role = room && roleFor(room, token);
            if (!role) return json(res, 403, { error: "协作邀请已失效" });
            room.updatedAt = Date.now();
            if (req.method === "POST" && role !== "viewer") {
                const mime = String(req.headers["content-type"] || "").split(";")[0];
                if (!/^(image\/(png|jpeg|webp|gif|avif)|video\/(mp4|webm)|audio\/[\w.+-]+)$/.test(mime)) return json(res, 415, { error: "不支持的协作素材格式" });
                const chunks = [];
                let size = 0;
                for await (const chunk of req) {
                    size += chunk.length;
                    if (size > maxMediaBytes) return json(res, 413, { error: "协作素材不能超过 20MB" });
                    chunks.push(chunk);
                }
                if (room.bytes + size > maxRoomBytes) return json(res, 413, { error: "房间素材已达到 256MB 上限" });
                const id = randomUUID();
                room.media.set(id, { mime, data: Buffer.concat(chunks) });
                room.bytes += size;
                return json(res, 201, { url: `/collab/media/${match[1]}/${id}?access=${room.viewerSecret}` });
            }
            const asset = room.media.get(match[2]);
            if (req.method !== "GET" || !asset) return json(res, 404, { error: "协作素材已过期或不存在" });
            res.writeHead(200, { "content-type": asset.mime, "content-length": asset.data.length, "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" });
            res.end(asset.data);
        } catch { if (!res.headersSent) json(res, 400, { error: "协作请求失败" }); else res.end(); }
    });
    const wss = new WebSocketServer({ server, path: "/collab/ws", maxPayload: 4 * 1024 * 1024 });
    const send = (ws, message) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message)); };
    const state = (room) => ({ type: "room_state", members: [...room.clients].map(ws => ws.member), snapshot: room.snapshot });
    const broadcast = (room, message) => { for (const ws of room.clients) send(ws, message); };
    wss.on("connection", (ws) => {
        ws.alive = true;
        ws.on("pong", () => { ws.alive = true; });
        ws.on("error", () => {});
        ws.on("message", (buffer) => {
            let message;
            try { message = JSON.parse(buffer.toString()); } catch { return send(ws, { type: "error", message: "协作消息格式无效" }); }
            if (message.type === "join") {
                if (ws.room) return;
                if (![message.roomId, message.secret, message.clientId].every(x => typeof x === "string" && secretPattern.test(x))) return ws.close(1008);
                let room = rooms.get(message.roomId);
                if (!room && message.role === "host" && [message.viewerSecret, message.editorSecret].every(x => typeof x === "string" && secretPattern.test(x))) {
                    room = { hostSecret: message.secret, viewerSecret: message.viewerSecret, editorSecret: message.editorSecret, clients: new Set(), revision: 0, media: new Map(), bytes: 0, updatedAt: Date.now() };
                    rooms.set(message.roomId, room);
                }
                const role = room && roleFor(room, message.secret);
                if (!role) return send(ws, { type: "error", message: "协作房间不存在或邀请已失效" });
                for (const peer of room.clients) if (peer.member.id === message.clientId) { room.clients.delete(peer); peer.close(); }
                ws.room = room;
                ws.member = { id: message.clientId, role, name: String(message.name || "协作者").slice(0, 40), joinedAt: Date.now() };
                room.clients.add(ws);
                room.updatedAt = Date.now();
                send(ws, { type: "joined", role, revision: room.revision });
                return broadcast(room, state(room));
            }
            const room = ws.room;
            if (!room) return;
            room.updatedAt = Date.now();
            if (message.type === "ping") return send(ws, { type: "pong", revision: room.revision });
            if (message.type === "sync") return send(ws, state(room));
            if (message.type !== "snapshot") return;
            if (ws.member.role === "viewer") return send(ws, { type: "error", message: "当前邀请只有查看权限" });
            if (message.baseRevision !== room.revision) {
                send(ws, { type: "error", message: "另一位成员已更新画布，已载入最新版本，请重新应用本次改动" });
                return send(ws, state(room));
            }
            const snapshot = message.snapshot;
            if (!snapshot || !Array.isArray(snapshot.nodes) || !Array.isArray(snapshot.connections) || typeof snapshot.projectId !== "string") return;
            if (room.snapshot && room.snapshot.projectId !== snapshot.projectId) return send(ws, { type: "error", message: "画布项目不匹配" });
            room.snapshot = { ...stripCredentials(snapshot), revision: ++room.revision };
            broadcast(room, { type: "snapshot", snapshot: room.snapshot, senderId: ws.member.id });
        });
        ws.on("close", () => {
            if (!ws.room) return;
            ws.room.clients.delete(ws);
            broadcast(ws.room, state(ws.room));
        });
    });
    const heartbeat = setInterval(() => {
        for (const ws of wss.clients) { if (!ws.alive) ws.terminate(); else { ws.alive = false; ws.ping(); } }
        for (const [id, room] of rooms) if (!room.clients.size && Date.now() - room.updatedAt > 12 * 3600_000) rooms.delete(id);
    }, 20_000);
    heartbeat.unref();
    server.on("close", () => clearInterval(heartbeat));
    return { server, wss, rooms };
}

function roleFor(room, secret) { return secret === room.hostSecret ? "host" : secret === room.editorSecret ? "editor" : secret === room.viewerSecret ? "viewer" : undefined; }
export function stripCredentials(value) {
    if (Array.isArray(value)) return value.map(stripCredentials);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).filter(([key]) => !/^(api.?key|key|authorization|password|secret|access.?token|refresh.?token)$/i.test(key)).map(([key, item]) => [key, stripCredentials(item)]));
}
