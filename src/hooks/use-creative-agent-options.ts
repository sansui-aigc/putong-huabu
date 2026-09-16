"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { CreativeAgentModelOption } from "@/components/agent/creative-agent-controls";
import type { AgentSkillWorkspace } from "@/lib/auth/store-types";
import { createAgentSkill, deleteAgentSkill, exportAgentSkills, importAgentSkillsFromFile, listAgentSkills, updateAgentSkill, type AgentSkillInput, type AgentSkillSummary } from "@/services/api/agent-skills";
import { modelOptionLabel, selectableModelsByCapability, type AiConfig, useConfigStore } from "@/stores/use-config-store";
import { creativeModelProfileForLogicalModel } from "@/lib/creative-model-capabilities";

export function useCreativeAgentModels(capabilities: CreativeAgentModelOption["capability"][] = ["text", "image", "video", "audio"]) {
    const config = useConfigStore((state) => state.config);
    const capabilityKey = capabilities.join(",");
    return useMemo(() => creativeAgentModelsFromConfig(config, capabilityKey.split(",") as CreativeAgentModelOption["capability"][]), [capabilityKey, config]);
}

export function creativeAgentModelsFromConfig(config: AiConfig, capabilities: CreativeAgentModelOption["capability"][] = ["text", "image", "video", "audio"]) {
    return Array.from(new Set(capabilities)).flatMap((capability) =>
        selectableModelsByCapability(config, capability).map((id) => {
            const capabilityProfile = creativeModelProfileForLogicalModel(config.logicalModels.find((model) => model.id.toLowerCase() === id.toLowerCase()));
            return { id, name: modelOptionLabel(config, id), capability, ...(capabilityProfile ? { capabilityProfile } : {}) };
        }),
    );
}

export function useCreativeAgentOptions(workspace: AgentSkillWorkspace, capabilities: CreativeAgentModelOption["capability"][] = ["text", "image", "video", "audio"]) {
    const [skills, setSkills] = useState<AgentSkillSummary[]>([]);
    const [skillsLoading, setSkillsLoading] = useState(true);
    const models = useCreativeAgentModels(capabilities);

    const refreshSkills = useCallback(async () => {
        setSkillsLoading(true);
        try {
            const items = await listAgentSkills(workspace);
            setSkills(items);
            return items;
        } finally {
            setSkillsLoading(false);
        }
    }, [workspace]);

    const createSkill = useCallback(async (input: AgentSkillInput) => {
        const skill = await createAgentSkill(input);
        setSkills((current) => [...current, skill]);
        return skill;
    }, []);

    const editSkill = useCallback(async (id: string, input: Partial<AgentSkillInput>) => {
        const skill = await updateAgentSkill(id, input);
        setSkills((current) => current.map((item) => (item.id === id ? skill : item)));
        return skill;
    }, []);

    const removeSkill = useCallback(async (id: string) => {
        await deleteAgentSkill(id);
        setSkills((current) => current.filter((item) => item.id !== id));
    }, []);

    const exportSkills = useCallback(() => {
        exportAgentSkills(skills);
    }, [skills]);

    const importSkills = useCallback(async (file: File) => {
        const inputs = await importAgentSkillsFromFile(file);
        const created: AgentSkillSummary[] = [];
        for (const input of inputs) {
            try {
                const skill = await createAgentSkill(input);
                created.push(skill);
            } catch (error) {
                console.warn(`导入 Skill "${input.name}" 失败:`, error);
            }
        }
        if (created.length > 0) {
            setSkills((current) => [...current, ...created]);
        }
        return created;
    }, []);

    useEffect(() => {
        let active = true;
        setSkillsLoading(true);
        void listAgentSkills(workspace)
            .then((items) => {
                if (active) setSkills(items);
            })
            .catch(() => {
                if (active) setSkills([]);
            })
            .finally(() => {
                if (active) setSkillsLoading(false);
            });
        return () => {
            active = false;
        };
    }, [workspace]);

    return { skills, skillsLoading, models, refreshSkills, createSkill, editSkill, removeSkill, exportSkills, importSkills };
}
