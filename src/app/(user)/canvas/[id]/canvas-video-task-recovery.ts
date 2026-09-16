import { isGenerationTaskNeedsReviewError } from "@/services/api/generation-task-state";
import { VideoGenerationUpstreamError } from "@/services/api/video-types";
import { CanvasNodeType, type CanvasNodeData } from "../types";

export type CanvasVideoTaskFailureKind = "needs_review" | "upstream_failed" | "query_pending";

export function classifyCanvasVideoTaskFailure(error: unknown): CanvasVideoTaskFailureKind {
    if (isGenerationTaskNeedsReviewError(error)) return "needs_review";
    return error instanceof VideoGenerationUpstreamError ? "upstream_failed" : "query_pending";
}

export function recoverInterruptedCanvasVideoNodes(nodes: CanvasNodeData[]) {
    return nodes.map((node) =>
        node.type === CanvasNodeType.Video && node.metadata?.status === "loading" && !node.metadata.videoTask
            ? {
                  ...node,
                  metadata: {
                      ...node.metadata,
                      status: "error" as const,
                      errorDetails: node.metadata.errorDetails || "视频请求未完成，未收到任务编号，请点击重试",
                  },
              }
            : node,
    );
}
