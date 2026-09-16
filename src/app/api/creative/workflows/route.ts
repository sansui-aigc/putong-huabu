import { NextResponse } from "@/runtime/next-server-compat";

import { getCurrentUser } from "@/lib/auth/session";
import { readJsonBodyResult } from "@/lib/auth/request";
import type { CreativeWorkflow } from "@/lib/creative-workflow-contract";
import { CreativeWorkflowError, listCreativeWorkflows, saveCreativeWorkflow } from "@/lib/server/creative-workflow-store";

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    const workflows = await listCreativeWorkflows(user.id);
    return NextResponse.json({ code: 0, data: { workflows }, msg: "OK" });
}

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const parsed = await readJsonBodyResult<Partial<CreativeWorkflow>>(request);
        if (!parsed.ok) return NextResponse.json({ code: parsed.status, data: null, msg: parsed.message }, { status: parsed.status });
        const workflow = await saveCreativeWorkflow(user.id, parsed.data as CreativeWorkflow);
        return NextResponse.json({ code: 0, data: { workflow }, msg: "工作流已保存" });
    } catch (error) {
        return serviceError(error);
    }
}

function serviceError(error: unknown) {
    if (error instanceof CreativeWorkflowError) return NextResponse.json({ code: error.status, data: null, msg: error.message }, { status: error.status });
    throw error;
}
