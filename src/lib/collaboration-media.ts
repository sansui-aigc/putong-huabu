import { imageToDataUrl } from "@/services/image-storage";
import type { CanvasNodeData } from "@/app/(user)/canvas/types";

export function createCollaborationMediaPublisher(roomId: string, secret: string) {
    const uploaded = new Map<string, Promise<string>>();
    const publish = (source: string) => {
        let pending = uploaded.get(source);
        if (!pending) {
            pending = (async () => {
                const asset = await fetch(source);
                if (!asset.ok) throw new Error("协作素材读取失败，请重新上传素材");
                const response = await fetch(`/collab/media/${roomId}`, { method: "POST", headers: { Authorization: `Bearer ${secret}` }, body: await asset.blob() });
                const body = await response.text();
                let result: { url?: unknown; error?: unknown } = {};
                if (body.trim()) {
                    try { result = JSON.parse(body) as typeof result; } catch { throw new Error(`协作素材服务返回了无效响应（HTTP ${response.status}）`); }
                }
                if (!response.ok || typeof result.url !== "string" || !result.url) {
                    throw new Error(typeof result.error === "string" ? result.error : `协作素材上传失败（HTTP ${response.status}）`);
                }
                return result.url;
            })().catch(error => { uploaded.delete(source); throw error; });
            uploaded.set(source, pending);
        }
        return pending;
    };
    const visit = async (value: unknown): Promise<unknown> => {
        if (typeof value === "string" && /^(data:|blob:|\/api\/(reference-assets|generation-log-assets)\/)/.test(value)) return publish(value);
        if (Array.isArray(value)) return Promise.all(value.map(visit));
        if (!value || typeof value !== "object") return value;
        const entries = await Promise.all(Object.entries(value).filter(([key]) => !/^(api.?key|key|authorization|password|secret|access.?token|refresh.?token)$/i.test(key)).map(async ([key, item]) => [key, await visit(item)]));
        return Object.fromEntries(entries);
    };
    return async (nodes: CanvasNodeData[]) => Promise.all(nodes.map(async node => {
        const metadata = { ...node.metadata };
        if (["image", "panorama", "video", "audio"].includes(node.type) && metadata.storageKey) {
            const source = await imageToDataUrl({ storageKey: metadata.storageKey, dataUrl: metadata.content, serverUrl: metadata.serverUrl, remoteUrl: metadata.remoteUrl });
            if (source) metadata.content = source;
            delete metadata.storageKey;
            delete metadata.serverUrl;
        }
        return await visit({ ...node, metadata }) as CanvasNodeData;
    }));
}
