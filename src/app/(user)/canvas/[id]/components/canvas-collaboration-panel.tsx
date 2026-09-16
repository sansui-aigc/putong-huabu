"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Input, Modal, Tag } from "antd";
import { Check, Copy, Link2, Users, Wifi, X } from "lucide-react";

import type { CanvasConnection, CanvasNodeData, ViewportTransform } from "../../types";
import { useCanvasCollaboration, type CanvasCollaborationSnapshot } from "../use-canvas-collaboration";

export function CanvasCollaborationPanel(props: {
    projectId: string;
    title: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    viewport: ViewportTransform;
    onApplyRemoteSnapshot: (snapshot: CanvasCollaborationSnapshot) => void;
    onReadOnlyChange?: (readOnly: boolean) => void;
}) {
    const [open, setOpen] = useState(false);
    const [joinValue, setJoinValue] = useState("");
    const [copied, setCopied] = useState("");
    const autoJoinedRef = useRef(false);
    const collaboration = useCanvasCollaboration({ ...props, onRemoteSnapshot: props.onApplyRemoteSnapshot });
    useEffect(() => { props.onReadOnlyChange?.(collaboration.invite?.role === "viewer"); }, [collaboration.invite?.role]);
    const inviteLinks = useMemo(() => {
        if (!collaboration.invite || collaboration.invite.role !== "host") return undefined;
        const { roomId, viewerSecret, editorSecret } = collaboration.invite;
        return {
            viewer: collaboration.formatInvite({ roomId, secret: viewerSecret!, role: "viewer" }),
            editor: collaboration.formatInvite({ roomId, secret: editorSecret!, role: "editor" }),
        };
    }, [collaboration]);

    useEffect(() => {
        const fragment = window.location.hash;
        if (fragment.startsWith("#collab=") && !collaboration.invite && !autoJoinedRef.current) {
            autoJoinedRef.current = true;
            setJoinValue(window.location.href);
            try { collaboration.joinInvite(window.location.href); } catch { setOpen(true); }
        }
    }, [collaboration.invite]);

    const copy = async (value: string, key: string) => {
        await navigator.clipboard?.writeText(value);
        setCopied(key);
        window.setTimeout(() => setCopied(""), 1200);
    };

    return <>
        <button type="button" className="pointer-events-auto absolute left-3 top-[4.75rem] z-40 inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium shadow-sm backdrop-blur transition hover:opacity-90 sm:left-auto sm:right-6" onClick={() => setOpen(true)} aria-label="打开多人协作" title="多人协作">
            <Users className="size-4" />
            <span className="hidden sm:inline">协作</span>
            {collaboration.status === "connected" ? <span className="size-2 rounded-full bg-emerald-500" /> : null}
        </button>
        <Modal open={open} onCancel={() => setOpen(false)} footer={null} title={<span className="inline-flex items-center gap-2"><Users className="size-4" />多人协作</span>} width={620} destroyOnClose>
            <div className="space-y-4">
                <Alert type={collaboration.status === "error" ? "error" : "info"} showIcon message={collaboration.error || (collaboration.status === "connected" ? `协作房间已连接，${collaboration.members.length} 人在线` : "创建房间后分享邀请链接，成员无需在同一局域网") }  />
                {!collaboration.invite ? <div className="grid gap-2 sm:grid-cols-2">
                    <Button type="primary" icon={<Link2 className="size-4" />} onClick={() => collaboration.createInvite("viewer")}>创建协作房间</Button>
                    <div className="flex gap-2"><Input value={joinValue} onChange={(event) => setJoinValue(event.target.value)} placeholder="粘贴邀请链接" /><Button onClick={() => { try { collaboration.joinInvite(joinValue); } catch (error) { window.alert(error instanceof Error ? error.message : "邀请链接无效"); } }}>加入</Button></div>
                </div> : <>
                    <div className="flex flex-wrap items-center justify-between gap-2"><Tag color={collaboration.status === "connected" ? "green" : "orange"} icon={<Wifi className="size-3" />}>{collaboration.status === "connected" ? "已连接" : "连接中"}</Tag><Button danger type="text" icon={<X className="size-4" />} onClick={collaboration.close}>结束协作</Button></div>
                    {inviteLinks ? <div className="space-y-2"><p className="text-xs font-medium text-stone-500">查看邀请链接</p><div className="flex gap-2"><Input readOnly value={inviteLinks?.viewer || ""} /><Button icon={copied === "viewer" ? <Check className="size-4" /> : <Copy className="size-4" />} onClick={() => inviteLinks && void copy(inviteLinks.viewer, "viewer")} /></div><p className="text-xs font-medium text-stone-500">编辑邀请链接</p><div className="flex gap-2"><Input readOnly value={inviteLinks?.editor || ""} /><Button icon={copied === "editor" ? <Check className="size-4" /> : <Copy className="size-4" />} onClick={() => inviteLinks && void copy(inviteLinks.editor, "editor")} /></div></div> : <p className="text-sm">当前权限：{collaboration.invite?.role === "viewer" ? "查看" : "编辑"}</p>}
                    <p className="text-xs text-stone-500">{collaboration.syncedAt ? `画布已同步 · ${new Date(collaboration.syncedAt).toLocaleTimeString()}` : "等待画布同步"}</p><div><p className="mb-2 text-xs font-medium text-stone-500">在线成员</p><div className="flex flex-wrap gap-2">{collaboration.members.length ? collaboration.members.map((member) => <Tag key={member.id}>{member.name} · {member.role === "host" ? "主持人" : member.role === "editor" ? "编辑" : "查看"}</Tag>) : <span className="text-xs text-stone-500">等待成员加入</span>}</div></div>
                </>}
                {collaboration.remoteSnapshot ? <div className="border-t pt-3"><p className="mb-2 text-sm font-medium">画布内容 · {collaboration.remoteSnapshot.nodes.length} 个节点 · {collaboration.remoteSnapshot.connections.length} 条连线</p><div className="max-h-64 space-y-2 overflow-y-auto text-xs">{collaboration.remoteSnapshot.nodes.map(node => <details key={node.id}><summary className="cursor-pointer">{node.title || node.id} · {node.metadata?.status || "待处理"}</summary><p className="whitespace-pre-wrap break-words py-2">{node.metadata?.prompt || (node.type === "text" ? node.metadata?.content : "") || "暂无提示词"}</p></details>)}{collaboration.remoteSnapshot.connections.map(connection => <p key={connection.id} className="break-all">{connection.fromNodeId} → {connection.toNodeId}</p>)}</div></div> : null}
            </div>
        </Modal>
    </>;
}
