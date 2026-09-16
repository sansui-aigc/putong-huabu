import { describe, expect, it } from "vitest";

import { GenerationSubmissionUncertainError } from "./generation-submission-error";
import { DEFAULT_CHANNEL_CONNECT_ERROR, UNKNOWN_SUBMISSION_REVIEW_ERROR, toSafeGenerationErrorMessage, toSafeGenerationReviewReason } from "./generation-errors";

describe("generation error messages", () => {
    it("keeps actionable business errors", () => {
        expect(toSafeGenerationErrorMessage(new Error("当前用户视频任务已达到并发上限"), "视频生成失败")).toBe("当前用户视频任务已达到并发上限");
        expect(toSafeGenerationErrorMessage(new Error('{"code":400,"data":null,"msg":"积分不足，无法生成"}'), "生成失败")).toBe("积分不足");
        expect(toSafeGenerationErrorMessage(new Error('{"error":{"message":"MetaJing video requests must use application/json"}}'), "生成失败")).toBe("MetaJing video requests must use application/json");
        expect(toSafeGenerationErrorMessage(new Error('{"error":{"message":"视频模型不受12API适配器支持"}}'), "视频生成失败")).toBe("中转站的 12API 适配器不支持当前视频模型，请在中转站开通视频模型路由或更换支持视频的模型与 API Key。");
        expect(toSafeGenerationErrorMessage(new Error('model gpt-image-2 tiered expr run failed: image size tier is not configured for this group'), "图片生成失败")).toBe("当前图片渠道未配置所选尺寸档位，请管理员在 New API 为该模型用户组启用对应图片档位后重试。");
    });

    it("does not expose infrastructure addresses or environment names", () => {
        expect(toSafeGenerationErrorMessage(new Error("POST http://localhost:3000 failed"), "生成失败")).toBe(DEFAULT_CHANNEL_CONNECT_ERROR);
        expect(toSafeGenerationErrorMessage(new Error("参考图需要公网图片 URL，请配置 NEXT_PUBLIC_SITE_URL"), "生成失败")).toBe("参考素材暂时无法提交给当前生成渠道，请重新上传或稍后重试。");
        expect(toSafeGenerationErrorMessage(new Error("<html><head><title>502 Bad Gateway</title></head><body><center><h1>502 Bad Gateway</h1></center><hr><center>nginx</center></body></html>"), "生成失败")).toBe(DEFAULT_CHANNEL_CONNECT_ERROR);
    });

    it("does not mislabel an uncertain upstream submission as a missing reference", () => {
        expect(toSafeGenerationReviewReason(new GenerationSubmissionUncertainError("参考图处理失败：https://provider.example/images/edits"), "图片任务创建结果未知")).toBe(UNKNOWN_SUBMISSION_REVIEW_ERROR);
    });
});
