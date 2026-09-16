import type { CreativeWorkflow } from "@/lib/creative-workflow-contract";

export type CreativeWorkflowList = { workflows: CreativeWorkflow[] };

export function listCreativeWorkflows(signal?: AbortSignal) {
    return request<CreativeWorkflowList>("/api/creative/workflows", { cache: "no-store", signal }).then((data) => data.workflows);
}

export function getCreativeWorkflow(id: string) {
    return request<{ workflow: CreativeWorkflow }>(`/api/creative/workflows/${encodeURIComponent(id)}`, { cache: "no-store" }).then((data) => data.workflow);
}

export function saveCreativeWorkflow(workflow: CreativeWorkflow) {
    return request<{ workflow: CreativeWorkflow }>("/api/creative/workflows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(workflow) }).then((data) => data.workflow);
}

export function deleteCreativeWorkflow(id: string) {
    return request<null>(`/api/creative/workflows/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function forkCreativeWorkflow(id: string) {
    return request<{ workflow: CreativeWorkflow }>(`/api/creative/workflows/${encodeURIComponent(id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "fork" }) }).then((data) => data.workflow);
}

export function touchCreativeWorkflowRun(id: string) {
    return request<null>(`/api/creative/workflows/${encodeURIComponent(id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "run" }) });
}

async function request<T>(url: string, init?: RequestInit) {
    const response = await fetch(url, init);
    const payload = (await response.json().catch(() => ({}))) as { data?: T; msg?: string };
    if (!response.ok || (!payload.data && response.status !== 204)) throw new Error(payload.msg || "工作流请求失败");
    return payload.data as T;
}
