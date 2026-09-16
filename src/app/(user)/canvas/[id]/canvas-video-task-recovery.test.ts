import { describe, expect, it } from "vitest";

import { CanvasNodeType, type CanvasNodeData } from "../types";
import { recoverInterruptedCanvasVideoNodes } from "./canvas-video-task-recovery";

function videoNode(id: string, metadata: CanvasNodeData["metadata"]): CanvasNodeData {
    return { id, type: CanvasNodeType.Video, title: id, position: { x: 0, y: 0 }, width: 320, height: 180, metadata };
}

describe("recoverInterruptedCanvasVideoNodes", () => {
    it("turns a loading video without a server task into a retryable error", () => {
        const [node] = recoverInterruptedCanvasVideoNodes([videoNode("video-one", { status: "loading", prompt: "测试视频" })]);

        expect(node.metadata).toMatchObject({ status: "error", errorDetails: "视频请求未完成，未收到任务编号，请点击重试" });
    });

    it("keeps videos with a task id resumable and leaves other nodes unchanged", () => {
        const resumable = videoNode("video-one", { status: "loading", videoTask: { id: "task-one", provider: "generation", model: "video-v1" }, prompt: "测试视频" });
        const image = { ...videoNode("image-one", { status: "loading", prompt: "测试图片" }), type: CanvasNodeType.Image };

        expect(recoverInterruptedCanvasVideoNodes([resumable, image])).toEqual([resumable, image]);
    });
});
