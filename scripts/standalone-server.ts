import fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import { Readable } from "node:stream";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { apiRoutes } from "@/standalone/route-registry";
import { requestWithNextUrl, NextResponse } from "@/runtime/next-server-compat";
import { runWithRequest } from "@/runtime/request-context";

const root = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(root, "..");
const port = Number(process.env.STANDALONE_API_PORT || process.env.PORT || 3002);
const host = process.env.HOST || "0.0.0.0";
const app = fastify({ logger: false, bodyLimit: 256 * 1024 * 1024 });

await app.register(fastifyCookie);
app.removeAllContentTypeParsers();
app.addContentTypeParser("*", { parseAs: "buffer" }, (_request, _payload, done) => done(null, _payload));

app.all("/api/*", async (request, reply) => {
    const url = new URL(request.raw.url || "/", `http://${request.headers.host || "localhost"}`);
    const match = apiRoutes.find((item) => item.pattern.test(url.pathname));
    if (!match) return reply.code(404).send({ code: 404, data: null, msg: "接口不存在" });
    const captures = match.pattern.exec(url.pathname)?.slice(1) || [];
    const params = Object.fromEntries(match.params.map((name, index) => [name, name === "path" ? captures[index]?.split("/").map(decodeURIComponent) || [] : decodeURIComponent(captures[index] || "") ]));
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
    const body = request.body as Buffer | undefined;
    const webRequest = requestWithNextUrl(new Request(url, { method: request.method, headers, body: ["GET", "HEAD"].includes(request.method) ? undefined : body?.length ? body : undefined }));
    try {
        const handler = match.module[request.method] as ((request: Request, context?: { params: Promise<Record<string, string | string[]>> }) => Promise<Response> | Response) | undefined;
        if (!handler) return reply.code(405).send({ code: 405, data: null, msg: "不支持的请求方法" });
        const response = await runWithRequest(webRequest, () => handler(webRequest, { params: Promise.resolve(params) }));
        await sendResponse(response, reply);
    } catch (error) {
        request.log.error(error);
        await sendResponse(NextResponse.json({ code: 500, data: null, msg: "服务端处理失败" }, { status: 500 }), reply);
    }
});

await app.listen({ port, host });
console.log(`社会牛码独立服务已启动: http://localhost:${port}`);

async function sendResponse(response: Response, reply: { code: (status: number) => typeof reply; headers: (headers: Record<string, string | string[]>) => typeof reply; send: (payload?: unknown) => unknown }) {
    const headers: Record<string, string | string[]> = {};
    response.headers.forEach((value, key) => { if (key !== "set-cookie") headers[key] = value; });
    const setCookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : response.headers.get("set-cookie");
    if (setCookies) headers["set-cookie"] = setCookies;
    reply.code(response.status).headers(headers);
    if (!response.body) return reply.send();
    return reply.send(Buffer.from(await response.arrayBuffer()));
}
