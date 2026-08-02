import { describe, expect, it, vi } from "vitest";
import { canUseAiQuestionGeneration, getReviewQuestions } from "../src/core/question-service";
import { BLOCK_TEMPLATE_QUESTIONS, TEMPLATE_QUESTIONS } from "../src/constants";
import type { ReviewItem } from "../src/types/review";
import type { AiSettings } from "../src/types/settings";

const item: ReviewItem = {
  itemId: "item-a",
  itemType: "document",
  docId: "item-a",
  notebookId: "notebook",
  blockType: "d",
  title: "Doc A",
  sourceTitle: "Doc A",
  path: "/Doc A",
  contentPreview: "Doc A",
};

describe("question-service", () => {
  it("uses template questions without calling AI when AI settings are incomplete", async () => {
    const generateAiQuestions = vi.fn(async () => ["AI question"]);
    const result = await getReviewQuestions({
      item,
      content: "content",
      ai: aiSettings({ enabled: true, apiKey: "" }),
      generateAiQuestions,
      nowIso: "2026-07-26T08:00:00.000Z",
    });

    expect(result.source).toBe("template");
    expect(result.questions).toEqual(TEMPLATE_QUESTIONS);
    expect(generateAiQuestions).not.toHaveBeenCalled();
  });

  it("detects usable AI settings only when required fields are present", () => {
    expect(canUseAiQuestionGeneration(aiSettings())).toBe(true);
    expect(canUseAiQuestionGeneration(aiSettings({ baseUrl: "" }))).toBe(false);
    expect(canUseAiQuestionGeneration(aiSettings({ model: "" }))).toBe(false);
    expect(canUseAiQuestionGeneration(aiSettings({ enabled: false }))).toBe(false);
  });

  it("uses block-specific template questions for review fragments", async () => {
    const result = await getReviewQuestions({
      item: {
        ...item,
        itemId: "block-a",
        itemType: "block",
        blockType: "i",
      },
      content: "fragment",
      ai: aiSettings({ enabled: false }),
      nowIso: "2026-07-26T08:00:00.000Z",
    });

    expect(result.questions).toEqual(BLOCK_TEMPLATE_QUESTIONS);
  });

});

function aiSettings(overrides: Partial<AiSettings> = {}): AiSettings {
  return {
    enabled: true,
    baseUrl: "https://api.example.com/v1",
    apiKey: "key",
    model: "model",
    contentStrategy: "full",
    maxChars: 16000,
    ...overrides,
  };
}
