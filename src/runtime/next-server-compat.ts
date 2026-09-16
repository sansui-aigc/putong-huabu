import { currentRequest } from "./request-context";

type CookieOptions = { httpOnly?: boolean; sameSite?: "lax" | "strict" | "none"; secure?: boolean; maxAge?: number; path?: string };

export class NextResponse extends Response {
    readonly cookies = {
        set: (name: string, value: string, options: CookieOptions = {}) => {
            const parts = [`${name}=${encodeURIComponent(value)}`];
            if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
            if (options.httpOnly) parts.push("HttpOnly");
            if (options.sameSite) parts.push(`SameSite=${options.sameSite[0].toUpperCase()}${options.sameSite.slice(1)}`);
            if (options.secure) parts.push("Secure");
            parts.push(`Path=${options.path || "/"}`);
            this.headers.append("set-cookie", parts.join("; "));
        },
    };

    static json<T>(data: T, init: ResponseInit = {}) {
        const headers = new Headers(init.headers);
        if (!headers.has("content-type")) headers.set("content-type", "application/json; charset=utf-8");
        return new NextResponse(JSON.stringify(data), { ...init, headers });
    }

    static redirect(url: string | URL, status = 307) {
        return new NextResponse(null, { status, headers: { location: String(url) } });
    }

    static next() {
        return new NextResponse(null, { status: 200 });
    }
}

export class NextRequest extends Request {
    readonly nextUrl: URL;

    constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(input, init);
        this.nextUrl = new URL(this.url);
    }
}

export function after(callback: () => unknown | Promise<unknown>) {
    queueMicrotask(() => void callback());
}

export function requestWithNextUrl(request: Request) {
    return new NextRequest(request.url, request);
}

export function currentRequestOrThrow() {
    const request = currentRequest();
    if (!request) throw new Error("当前请求上下文不可用");
    return request;
}
