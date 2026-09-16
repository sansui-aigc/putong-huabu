import { describe, expect, it } from "vitest";

import { buildJui87VideoApiUrl, isJui87VideoBaseUrl, resolveJui87VideoBaseUrl } from "./jui87-video";

describe("JUI87 video gateway", () => {
    it("routes the New API host to the Sub2 video host and preserves /v1", () => {
        expect(resolveJui87VideoBaseUrl("https://api.jui87.com/v1", "jui87")).toBe("https://sub.jui87.com/v1");
        expect(resolveJui87VideoBaseUrl("https://api.jui87.com", "jui87")).toBe("https://sub.jui87.com");
    });

    it("recognizes both JUI87 hosts without changing unrelated providers", () => {
        expect(isJui87VideoBaseUrl("https://api.jui87.com/v1")).toBe(true);
        expect(isJui87VideoBaseUrl("https://sub.jui87.com/v1")).toBe(true);
        expect(resolveJui87VideoBaseUrl("https://provider.example/v1")).toBe("https://provider.example/v1");
    });

    it("does not duplicate /v1 when building absolute video paths", () => {
        expect(buildJui87VideoApiUrl("https://api.jui87.com/v1", "/v1/videos", "jui87")).toBe("https://sub.jui87.com/v1/videos");
        expect(buildJui87VideoApiUrl("https://provider.example/v1", "/v1/videos/generations")).toBe("https://provider.example/v1/videos/generations");
    });
});
