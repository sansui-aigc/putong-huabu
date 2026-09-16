import { nanoid } from "nanoid";

import type { CreativeWorkflow, CreativeWorkflowRecord } from "@/lib/creative-workflow-contract";
import { createStarterWorkflows, normalizeWorkflow } from "@/lib/creative-workflow-contract";
import { readJsonDataFile, withJsonDataFileLock, writeJsonDataFile } from "@/lib/server/data-adapter";

type WorkflowDatabase = { version: 1; records: CreativeWorkflowRecord[] };

const PUBLIC_FILE = "creative-workflows-public.json";
const userFile = (userId: string) => `creative-workflows-${userId}.json`;

export class CreativeWorkflowError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
    }
}

async function readUserRecords(userId: string): Promise<CreativeWorkflowRecord[]> {
    const database = await readJsonDataFile<WorkflowDatabase>(userFile(userId), { version: 1, records: [] });
    return database.records || [];
}

async function writeUserRecords(userId: string, records: CreativeWorkflowRecord[]) {
    await writeJsonDataFile(userFile(userId), { version: 1, records });
}

async function readPublicRecords(): Promise<CreativeWorkflowRecord[]> {
    const database = await readJsonDataFile<WorkflowDatabase>(PUBLIC_FILE, { version: 1, records: [] });
    return database.records || [];
}

async function writePublicRecords(records: CreativeWorkflowRecord[]) {
    await writeJsonDataFile(PUBLIC_FILE, { version: 1, records });
}

export function workflowToRecord(workflow: CreativeWorkflow): CreativeWorkflowRecord {
    const { id, ownerUserId, scope, editable, name, category, description, createdAt, updatedAt, lastRunAt, ...data } = workflow;
    return {
        id,
        ownerUserId,
        scope,
        editable,
        name,
        category,
        description,
        data,
        createdAt: new Date(createdAt).toISOString(),
        updatedAt: new Date(updatedAt).toISOString(),
        lastRunAt: lastRunAt ? new Date(lastRunAt).toISOString() : undefined,
    };
}

export function recordToWorkflow(record: CreativeWorkflowRecord): CreativeWorkflow {
    const now = Date.now();
    return normalizeWorkflow({
        ...record.data,
        id: record.id,
        ownerUserId: record.ownerUserId,
        scope: record.scope,
        editable: record.editable,
        name: record.name,
        category: record.category,
        description: record.description,
        createdAt: Date.parse(record.createdAt) || now,
        updatedAt: Date.parse(record.updatedAt) || now,
        lastRunAt: record.lastRunAt ? Date.parse(record.lastRunAt) || now : undefined,
    });
}

/** 列出当前用户可见的工作流：自己的私有 + 全部公开（含内置） */
export async function listCreativeWorkflows(userId: string): Promise<CreativeWorkflow[]> {
    const [userRecords, publicRecords] = await Promise.all([readUserRecords(userId), readPublicRecords()]);
    const own = userRecords.map(recordToWorkflow);
    const ownIds = new Set(own.map((item) => item.id));
    const publics = publicRecords.map(recordToWorkflow).filter((item) => !ownIds.has(item.id));
    const builtin = createStarterWorkflows().filter((item) => !ownIds.has(item.id) && !publicRecords.some((record) => record.id === item.id));
    return [...own, ...publics, ...builtin].sort((a, b) => b.updatedAt - a.updatedAt);
}

/** 公开模板（供未登录或全局浏览） */
export async function listPublicCreativeWorkflows(): Promise<CreativeWorkflow[]> {
    const publicRecords = await readPublicRecords();
    const builtin = createStarterWorkflows().filter((item) => !publicRecords.some((record) => record.id === item.id));
    return [...publicRecords.map(recordToWorkflow), ...builtin].sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getCreativeWorkflow(userId: string, id: string): Promise<CreativeWorkflow | null> {
    const workflows = await listCreativeWorkflows(userId);
    return workflows.find((item) => item.id === id) || null;
}

export async function saveCreativeWorkflow(userId: string, input: CreativeWorkflow): Promise<CreativeWorkflow> {
    const workflow = normalizeWorkflow({ ...input, ownerUserId: input.ownerUserId || userId, editable: input.scope === "public" ? input.editable !== false : true });
    const record = workflowToRecord(workflow);
    if (workflow.scope === "public") {
        await withJsonDataFileLock(PUBLIC_FILE, async () => {
            const records = await readPublicRecords();
            const next = records.some((item) => item.id === record.id) ? records.map((item) => (item.id === record.id ? record : item)) : [record, ...records];
            await writePublicRecords(next);
        });
        return workflow;
    }
    await withJsonDataFileLock(userFile(userId), async () => {
        const records = await readUserRecords(userId);
        const next = records.some((item) => item.id === record.id) ? records.map((item) => (item.id === record.id ? record : item)) : [record, ...records];
        await writeUserRecords(userId, next);
    });
    return workflow;
}

/** 从公开模板复制为自己的私有模板 */
export async function forkCreativeWorkflow(userId: string, id: string): Promise<CreativeWorkflow> {
    const publicWorkflows = await listPublicCreativeWorkflows();
    const source = publicWorkflows.find((item) => item.id === id);
    if (!source) throw new CreativeWorkflowError("模板不存在", 404);
    const now = Date.now();
    const fork = normalizeWorkflow({
        ...source,
        id: nanoid(),
        ownerUserId: userId,
        scope: "private",
        editable: true,
        name: `${source.name} 副本`,
        createdAt: now,
        updatedAt: now,
        lastRunAt: undefined,
    });
    await saveCreativeWorkflow(userId, fork);
    return fork;
}

export async function deleteCreativeWorkflow(userId: string, id: string) {
    await withJsonDataFileLock(userFile(userId), async () => {
        const records = await readUserRecords(userId);
        const next = records.filter((item) => item.id !== id);
        if (next.length !== records.length) await writeUserRecords(userId, next);
    });
}

/** 记录最近一次运行时间 */
export async function touchCreativeWorkflowRun(userId: string, id: string) {
    const workflow = await getCreativeWorkflow(userId, id);
    if (!workflow || !workflow.editable) return;
    await saveCreativeWorkflow(userId, { ...workflow, lastRunAt: Date.now(), updatedAt: Date.now() });
}
