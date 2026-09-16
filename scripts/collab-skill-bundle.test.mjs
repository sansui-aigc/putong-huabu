import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadSkillBundle, runtimeSkillFiles } from "./collab-skill-bundle.mjs";

const temporaryDirectories = [];
afterEach(async () => {
    const { rm } = await import("node:fs/promises");
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("server skill bundle", () => {
    it("loads the complete runtime files and records their hashes", async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "creative-skill-"));
        temporaryDirectories.push(root);
        await mkdir(path.join(root, "references"));
        await writeFile(path.join(root, "SKILL.md"), "skill rules", "utf8");
        await writeFile(path.join(root, "references/prompt-logic.md"), "prompt rules", "utf8");
        await writeFile(path.join(root, "references/production-reshoot.md"), "reshoot rules", "utf8");

        const bundle = await loadSkillBundle(root, { sourceCommit: "test-commit" });
        expect(bundle.sourceCommit).toBe("test-commit");
        expect(bundle.files.map((file) => file.path)).toEqual(runtimeSkillFiles);
        expect(bundle.instructions).toContain("skill rules");
        expect(bundle.instructions).toContain("prompt rules");
        expect(bundle.instructions).toContain("reshoot rules");
        expect(bundle.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true);
    });
});
