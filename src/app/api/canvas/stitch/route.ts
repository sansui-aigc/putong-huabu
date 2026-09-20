import { NextResponse } from "@/runtime/next-server-compat";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { isAuthInputError } from "@/lib/auth/store";
import { StitchImagesError, stitchImages, type StitchDirection } from "@/lib/server/detail-page-stitch-service";
import { resolveInternalOrigin } from "@/lib/server/internal-origin";
import { checkGenerationRateLimit, rateLimitHeaders } from "@/lib/server/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 1200;

type StitchBody = {
    images?: unknown;
    direction?: unknown;
    gap?: unknown;
    background?: unknown;
    align?: unknown;
};

export async function POST(request: Request) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    const rate = await checkGenerationRateLimit(user.id, request, "image");
    if (!rate.allowed) return NextResponse.json({ code: 429, data: null, msg: "图片拼接请求过于频繁，请稍后重试" }, { status: 429, headers: rateLimitHeaders(rate) });

    let body: StitchBody;
    try {
        body = await readJsonBody(request);
    } catch (error) {
        if (isAuthInputError(error)) return NextResponse.json({ code: error.status, data: null, msg: error.message }, { status: error.status });
        throw error;
    }

    const images = Array.isArray(body.images) ? body.images.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).slice(0, 20) : [];
    const direction: StitchDirection = body.direction === "horizontal" ? "horizontal" : "vertical";
    const gap = Number(body.gap);
    const background = typeof body.background === "string" ? body.background.slice(0, 32) : "";
    const align = body.align === "start" || body.align === "end" ? body.align : "center";
    if (images.length < 2) return NextResponse.json({ code: 400, data: null, msg: "至少需要 2 张图片" }, { status: 400 });

    try {
        const result = await stitchImages({
            origin: resolveInternalOrigin(new URL(request.url).origin),
            cookie: request.headers.get("cookie") || "",
            body: { images, direction, gap, background, align },
        });
        return NextResponse.json({ code: 0, data: result, msg: "OK" });
    } catch (error) {
        const status = error instanceof StitchImagesError ? error.status : 502;
        const message = error instanceof StitchImagesError ? error.message : "图片拼接失败，请稍后重试";
        return NextResponse.json({ code: status, data: null, msg: message }, { status });
    }
}
