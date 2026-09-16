import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCollabServer } from "./collab-server.mjs";
import { loadSkillBundle } from "./collab-skill-bundle.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = process.env.CREATIVE_SKILL_ROOT || path.join(scriptDir, "server-skills", "nuyoah-xiezhen-prompt");
const skill = await loadSkillBundle(skillRoot, { sourceCommit: process.env.CREATIVE_SKILL_COMMIT });
const { server } = createCollabServer(skill);
server.listen(Number(process.env.CREATIVE_COLLAB_PORT || 3202), "127.0.0.1");
