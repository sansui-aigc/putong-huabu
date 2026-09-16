import * as agentPromptOptimization from "@/app/api/agent/prompt-optimization/route";
import * as agentReview from "@/app/api/agent/review/route";
import * as agentRuns from "@/app/api/agent/runs/route";
import * as agentRun from "@/app/api/agent/runs/[id]/route";
import * as agentRunAction from "@/app/api/agent/runs/[id]/[action]/route";
import * as agentRunEvents from "@/app/api/agent/runs/[id]/events/route";
import * as agentRunRetry from "@/app/api/agent/runs/[id]/tasks/[taskId]/retry/route";
import * as agentSkills from "@/app/api/agent/skills/route";
import * as systemAi from "@/app/api/ai/system/[channelId]/[...path]/route";
import * as audioTasks from "@/app/api/audio-tasks/route";
import * as audioTask from "@/app/api/audio-tasks/[id]/route";
import * as authLogin from "@/app/api/auth/login/route";
import * as authLogout from "@/app/api/auth/logout/route";
import * as authRegister from "@/app/api/auth/register/route";
import * as authSession from "@/app/api/auth/session/route";
import * as canvasProjects from "@/app/api/canvas/projects/route";
import * as canvasProject from "@/app/api/canvas/projects/[id]/route";
import * as canvasAssistantConversations from "@/app/api/canvas/projects/[id]/assistant-conversations/route";
import * as creativeAssets from "@/app/api/creative/assets/route";
import * as creativeAsset from "@/app/api/creative/assets/[id]/route";
import * as creativeConversations from "@/app/api/creative/conversations/route";
import * as creativeConversation from "@/app/api/creative/conversations/[id]/route";
import * as creativeConversationAssets from "@/app/api/creative/conversations/[id]/assets/route";
import * as creativeConversationMessages from "@/app/api/creative/conversations/[id]/messages/route";
import * as creativeWorkflows from "@/app/api/creative/workflows/route";
import * as creativeWorkflow from "@/app/api/creative/workflows/[id]/route";
import * as generationLogs from "@/app/api/generation-logs/route";
import * as generationLogAssets from "@/app/api/generation-log-assets/[...path]/route";
import * as healthLive from "@/app/api/health/live/route";
import * as healthReady from "@/app/api/health/ready/route";
import * as imageTasks from "@/app/api/image-tasks/route";
import * as imageTask from "@/app/api/image-tasks/[id]/route";
import * as installInitialize from "@/app/api/install/initialize/route";
import * as installStatus from "@/app/api/install/status/route";
import * as libraryAssets from "@/app/api/library-assets/route";
import * as libraryAsset from "@/app/api/library-assets/[id]/route";
import * as generationTaskHeartbeat from "@/app/api/maintenance/generation-tasks/heartbeat/route";
import * as generationTaskRecovery from "@/app/api/maintenance/generation-tasks/run/route";
import * as mediaAssets from "@/app/api/media-assets/route";
import * as mediaProxy from "@/app/api/media-proxy/route";
import * as points from "@/app/api/points/route";
import * as referenceAssets from "@/app/api/reference-assets/route";
import * as referenceAssetPath from "@/app/api/reference-assets/[...path]/route";
import * as siteIcon from "@/app/api/site-icon/route";
import * as textTasks from "@/app/api/text-tasks/route";
import * as textTask from "@/app/api/text-tasks/[id]/route";
import * as videoGenerationTasks from "@/app/api/video-generation-tasks/route";
import * as videoTasks from "@/app/api/video-tasks/route";
import * as videoTask from "@/app/api/video-tasks/[id]/route";

type RouteModule = Record<string, unknown>;
type RouteDefinition = { pattern: RegExp; params: string[]; module: RouteModule };

const definitions: Array<[string, string[], RouteModule]> = [
    ["/api/agent/prompt-optimization", [], agentPromptOptimization], ["/api/agent/review", [], agentReview], ["/api/agent/runs", [], agentRuns],
    ["/api/agent/runs/:id", ["id"], agentRun], ["/api/agent/runs/:id/:action", ["id", "action"], agentRunAction], ["/api/agent/runs/:id/events", ["id"], agentRunEvents],
    ["/api/agent/runs/:id/tasks/:taskId/retry", ["id", "taskId"], agentRunRetry], ["/api/agent/skills", [], agentSkills], ["/api/ai/system/:channelId/*", ["channelId", "path"], systemAi],
    ["/api/audio-tasks", [], audioTasks], ["/api/audio-tasks/:id", ["id"], audioTask], ["/api/auth/login", [], authLogin], ["/api/auth/logout", [], authLogout],
    ["/api/auth/register", [], authRegister], ["/api/auth/session", [], authSession], ["/api/canvas/projects", [], canvasProjects], ["/api/canvas/projects/:id", ["id"], canvasProject],
    ["/api/canvas/projects/:id/assistant-conversations", ["id"], canvasAssistantConversations], ["/api/creative/assets", [], creativeAssets], ["/api/creative/assets/:id", ["id"], creativeAsset],
    ["/api/creative/conversations", [], creativeConversations], ["/api/creative/conversations/:id", ["id"], creativeConversation], ["/api/creative/conversations/:id/assets", ["id"], creativeConversationAssets],
    ["/api/creative/conversations/:id/messages", ["id"], creativeConversationMessages],
    ["/api/generation-logs", [], generationLogs], ["/api/generation-log-assets/*", ["path"], generationLogAssets], ["/api/health/live", [], healthLive], ["/api/health/ready", [], healthReady],
    ["/api/image-tasks", [], imageTasks], ["/api/image-tasks/:id", ["id"], imageTask], ["/api/install/initialize", [], installInitialize], ["/api/install/status", [], installStatus],
    ["/api/library-assets", [], libraryAssets], ["/api/library-assets/:id", ["id"], libraryAsset],
    ["/api/creative/workflows", [], creativeWorkflows], ["/api/creative/workflows/:id", ["id"], creativeWorkflow],
    ["/api/maintenance/generation-tasks/heartbeat", [], generationTaskHeartbeat], ["/api/maintenance/generation-tasks/run", [], generationTaskRecovery],
    ["/api/media-assets", [], mediaAssets], ["/api/media-proxy", [], mediaProxy], ["/api/points", [], points], ["/api/reference-assets", [], referenceAssets], ["/api/reference-assets/*", ["path"], referenceAssetPath],
    ["/api/site-icon", [], siteIcon], ["/api/text-tasks", [], textTasks], ["/api/text-tasks/:id", ["id"], textTask], ["/api/video-generation-tasks", [], videoGenerationTasks],
    ["/api/video-tasks", [], videoTasks], ["/api/video-tasks/:id", ["id"], videoTask],
];

export const apiRoutes: RouteDefinition[] = definitions.map(([path, params, module]) => ({ pattern: pathToRegex(path), params, module }));

function pathToRegex(path: string) {
    const source = path.split("/").map((part) => (part === "*" ? "(.+)" : part.startsWith(":") ? "([^/]+)" : escapeRegex(part))).join("\\/");
    return new RegExp(`^${source}\\/?$`);
}

function escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
