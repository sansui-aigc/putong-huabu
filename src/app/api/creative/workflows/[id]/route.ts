import { NextResponse } from "@/runtime/next-server-compat";

import { getCurrentUser } from "@/lib/auth/session";
import { readJsonBodyResult } from "@/lib/auth/request";
import { CreativeWorkflowError, deleteCreativeWorkflow, forkCreativeWorkflow, getCreativeWorkflow, touchCreativeWorkflowRun } from "@/lib/server/creative-workflow-store";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    const { id } = await context.params;
    const workflow = await getCreativeWorkflow(user.id, id);
    if (!workflow) return NextResponse.json({ code: 404, data: null, msg: "工作流不存在" }, { status: 404 });
    return NextResponse.json({ code: 0, data: { workflow }, msg: "OK" });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    const { id } = await context.params;
    try {
        const parsed = await readJsonBodyResult<{ action: "fork" | "run" }>(request);
        if (!parsed.ok) return NextResponse.json({ code: parsed.status, data: null, msg: parsed.message }, { status: parsed.status });
        const action = parsed.data?.action;
        if (action === "fork") {
            const workflow = await forkCreativeWorkflow(user.id, id);
            return NextResponse.json({ code: 0, data: { workflow }, msg: "模板已复制到我的工作流" });
        }
        if (action === "run") {
            await touchCreativeWorkflowRun(user.id, id);
            return NextResponse.json({ code: 0, data: null, msg: "OK" });
        }
        return NextResponse.json({ code: 400, data: null, msg: "未知操作" }, { status: 400 });
    } catch (error) {
        if (error instanceof CreativeWorkflowError) return NextResponse.json({ code: error.status, data: null, msg: error.message }, { status: error.status });
        throw error;
    }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    const { id } = await context.params;
    await deleteCreativeWorkflow(user.id, id);
    return NextResponse.json({ code: 0, data: null, msg: "工作流已删除" });
}
