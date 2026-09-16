"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { createCollaborationMediaPublisher } from "@/lib/collaboration-media";
import type { CanvasConnection, CanvasNodeData, ViewportTransform } from "../types";

export type CanvasCollaborationRole = "host" | "editor" | "viewer";
export type CanvasCollaborationStatus = "idle" | "connecting" | "connected" | "error";
export type CanvasCollaborationMember = { id: string; name: string; role: CanvasCollaborationRole; joinedAt: number };
export type CanvasCollaborationSnapshot = { projectId: string; title: string; nodes: CanvasNodeData[]; connections: CanvasConnection[]; viewport: ViewportTransform; revision: number };
export type CollaborationInvite = { roomId: string; secret: string; role: CanvasCollaborationRole; viewerSecret?: string; editorSecret?: string };
type Input = Omit<CanvasCollaborationSnapshot, "revision"> & { onRemoteSnapshot?: (snapshot: CanvasCollaborationSnapshot) => void };

export function useCanvasCollaboration(input: Input) {
    const inputRef = useRef(input);
    inputRef.current = input;
    const clientId = useRef("client-" + nanoid(12));
    const socketRef = useRef<WebSocket | null>(null);
    const roomRef = useRef<CollaborationInvite | undefined>(undefined);
    const revisionRef = useRef(0);
    const receivedRef = useRef(-1);
    const lastRemote = useRef<CanvasCollaborationSnapshot | undefined>(undefined);
    const retryRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const publishRef = useRef<() => void>(() => {});
    const [status, setStatus] = useState<CanvasCollaborationStatus>("idle");
    const [error, setError] = useState("");
    const [members, setMembers] = useState<CanvasCollaborationMember[]>([]);
    const [remoteSnapshot, setRemoteSnapshot] = useState<CanvasCollaborationSnapshot>();
    const [invite, setInvite] = useState<CollaborationInvite>();
    const [syncedAt, setSyncedAt] = useState<number>();

    const close = useCallback(() => {
        roomRef.current = undefined;
        clearTimeout(retryRef.current);
        const socket = socketRef.current;
        socketRef.current = null;
        socket?.close();
        setInvite(undefined);
        setMembers([]);
        setRemoteSnapshot(undefined);
        setStatus("idle");
        setError("");
        setSyncedAt(undefined);
        revisionRef.current = 0;
        receivedRef.current = -1;
    }, []);

    const connect = useCallback((next: CollaborationInvite) => {
        close();
        roomRef.current = next;
        setInvite(next);
        const publishMedia = createCollaborationMediaPublisher(next.roomId, next.secret);
        let retry = 0;
        let publishing = false;
        let pending = false;
        const open = () => {
            if (roomRef.current !== next) return;
            setStatus("connecting");
            const socket = new WebSocket((location.protocol === "https:" ? "wss:" : "ws:") + "//" + location.host + "/collab/ws");
            socketRef.current = socket;
            let joined = false;
            let lastPong = Date.now();
            const send = (data: unknown) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data)); };
            const publish = async () => {
                if (!joined || next.role === "viewer") return;
                if (publishing) { pending = true; return; }
                publishing = true;
                const current = inputRef.current;
                const baseRevision = revisionRef.current;
                try {
                    const nodes = await publishMedia(current.nodes);
                    if (socketRef.current !== socket || socket.readyState !== WebSocket.OPEN) return;
                    send({ type: "snapshot", baseRevision, snapshot: { projectId: current.projectId, title: current.title, nodes, connections: current.connections, viewport: current.viewport } });
                } catch (reason) {
                    publishing = false;
                    setError(reason instanceof Error ? reason.message : "协作同步失败");
                }
            };
            publishRef.current = () => { void publish(); };
            socket.onopen = () => send({ type: "join", ...next, clientId: clientId.current, name: getClientName() });
            socket.onmessage = (event) => {
                if (roomRef.current !== next) return;
                try {
                    const message = JSON.parse(String(event.data));
                    lastPong = Date.now();
                    if (message.type === "joined") {
                        joined = true;
                        retry = 0;
                        revisionRef.current = message.revision;
                        setStatus("connected");
                        setError("");
                        if (next.role === "host" && message.revision === 0) void publish();
                    }
                    if (message.type === "error") {
                        publishing = false;
                        pending = false;
                        receivedRef.current = -1;
                        setError(String(message.message));
                        if (!joined) { setStatus("error"); socket.close(1000); }
                    }
                    if (message.type === "pong" && message.revision > revisionRef.current) send({ type: "sync" });
                    if (message.type === "room_state") setMembers(message.members || []);
                    if (!message.snapshot) return;
                    const snapshot = message.snapshot as CanvasCollaborationSnapshot;
                    revisionRef.current = snapshot.revision;
                    if (message.senderId === clientId.current) {
                        publishing = false;
                        receivedRef.current = snapshot.revision;
                        setSyncedAt(Date.now());
                        setError("");
                        if (pending) { pending = false; void publish(); }
                        return;
                    }
                    if (snapshot.revision <= receivedRef.current) return;
                    receivedRef.current = snapshot.revision;
                    // Remote tasks belong to the publishing browser; receivers must not resume them.
                    snapshot.nodes = snapshot.nodes.map(node => ({ ...node, metadata: { ...node.metadata, collaborationRemote: true } }));
                    lastRemote.current = snapshot;
                    setRemoteSnapshot(snapshot);
                    setSyncedAt(Date.now());
                    inputRef.current.onRemoteSnapshot?.(snapshot);
                } catch { setError("协作消息格式无效"); }
            };
            const heartbeat = window.setInterval(() => {
                if (Date.now() - lastPong > 45_000) socket.close();
                else send({ type: "ping" });
            }, 15_000);
            socket.onerror = () => setError("协作连接中断，正在重连");
            socket.onclose = (event) => {
                clearInterval(heartbeat);
                publishing = false;
                if (socketRef.current !== socket || roomRef.current !== next) return;
                socketRef.current = null;
                if (event.code === 1000 && !joined) return;
                setStatus("connecting");
                retryRef.current = setTimeout(open, Math.min(15_000, 1000 * 2 ** retry++));
            };
        };
        open();
    }, [close]);

    useEffect(() => () => close(), [close]);
    useEffect(() => {
        if (!roomRef.current || roomRef.current.role === "viewer" || (input.nodes === lastRemote.current?.nodes && input.connections === lastRemote.current?.connections)) return;
        const timer = setTimeout(() => publishRef.current(), 220);
        return () => clearTimeout(timer);
    }, [input.nodes, input.connections, input.title]);

    const createInvite = useCallback((role: "viewer" | "editor") => {
        const next: CollaborationInvite = { roomId: nanoid(12), secret: nanoid(32), viewerSecret: nanoid(32), editorSecret: nanoid(32), role: "host" };
        connect(next);
        return formatInvite({ roomId: next.roomId, secret: role === "viewer" ? next.viewerSecret! : next.editorSecret!, role });
    }, [connect]);
    const joinInvite = useCallback((value: string) => {
        const parsed = parseInvite(value);
        if (!parsed) throw new Error("邀请链接无效");
        connect(parsed);
    }, [connect]);
    return { status, error, members, remoteSnapshot, invite, syncedAt, createInvite, joinInvite, close, formatInvite };
}

export function formatInvite(invite: CollaborationInvite) {
    return location.origin + location.pathname + "#collab=" + invite.roomId + "." + invite.secret + "." + invite.role;
}
export function parseInvite(value: string): CollaborationInvite | null {
    const match = value.trim().match(/(?:#collab=|^)([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.(viewer|editor)$/i);
    return match ? { roomId: match[1], secret: match[2], role: match[3].toLowerCase() as "viewer" | "editor" } : null;
}
function getClientName() {
    const stored = sessionStorage.getItem("creative:collab-name");
    if (stored) return stored;
    const name = "协作者 " + Math.floor(Math.random() * 900 + 100);
    sessionStorage.setItem("creative:collab-name", name);
    return name;
}
