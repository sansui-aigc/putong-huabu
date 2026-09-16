import { currentRequestOrThrow } from "./next-server-compat";

export async function cookies() {
    const request = currentRequestOrThrow();
    const values = new Map<string, string>();
    for (const part of (request.headers.get("cookie") || "").split(";")) {
        const index = part.indexOf("=");
        if (index < 0) continue;
        values.set(part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim()));
    }
    return { get: (name: string) => (values.has(name) ? { name, value: values.get(name)! } : undefined) };
}

export async function headers() {
    return currentRequestOrThrow().headers;
}
