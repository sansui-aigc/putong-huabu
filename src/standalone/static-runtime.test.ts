import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

async function source() {
    return readFile(resolve(process.cwd(), "src/standalone/static-runtime.ts"), "utf8");
}

describe("static Agent runtime persistence guards", () => {
    it("keeps idempotent requests tied to a persisted client request id", async () => {
        const content = await source();

        expect(content).toContain("staticAgentRequestPromises");
        expect(content).toContain("run.clientRequestId === clientRequestId");
        expect(content).toContain("return response.clone()");
        expect(content).toContain("clientRequestId, conversationId:");
    });

    it("propagates cancellation through the model request and does not convert it into a 500 response", async () => {
        const content = await source();

        expect(content).toContain("if (init?.signal?.aborted) throw error");
        expect(content).toContain("signal: options.signal");
        expect(content).toContain("signal });");
    });

    it("keeps custom skills scoped and searchable in the static workspace", async () => {
        const content = await source();

        expect(content).toContain("skill.workspaces.includes(surface)");
        expect(content).toContain("normalizeStaticSkillKeywords");
        expect(content).toContain("keywords: normalizeStaticSkillKeywords(input, normalized)");
        expect(content).toContain("instructions: skill.instructions");
    });

    it("deletes persisted conversations and related records instead of returning a no-op", async () => {
        const content = await source();

        expect(content).toContain("deleteStaticCreativeConversation");
        expect(content).toContain('dbDelete("creative-messages", item.id)');
        expect(content).toContain('dbDelete("creative-assets", item.id)');
        expect(content).toContain('dbDelete("agent-runs", item.id)');
    });
});
