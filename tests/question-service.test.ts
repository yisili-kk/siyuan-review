import { describe, expect, it, vi } from "vitest";
import { canUseAiQuestionGeneration, getReviewQuestions, shouldAutoGenerateQuestions } from "../src/core/question-service";
import { TEMPLATE_QUESTIONS } from "../src/constants";
import type { ReviewDocState } from "../src/types/review";
import type { AiSettings } from "../src/types/settings";

const doc: ReviewDocState = {
  docId: "doc-a",
  notebookId: "notebook",
  title: "Doc A",
  path: "/Doc A",
};

describe("question-service", () => {
  it("uses template questions without calling AI when AI settings are incomplete", async () => {
    const generateAiQuestions = vi.fn(async () => ["AI question"]);
    const result = await getReviewQuestions({
      doc,
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

  it("auto-generates questions only when the document has no question cache", () => {
    expect(shouldAutoGenerateQuestions(doc)).toBe(true);
    expect(
      shouldAutoGenerateQuestions({
        ...doc,
        questionCache: {
          source: "ai",
          questions: ["Cached question"],
          generatedAt: "2026-07-26T08:00:00.000Z",
        },
      }),
    ).toBe(false);
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
