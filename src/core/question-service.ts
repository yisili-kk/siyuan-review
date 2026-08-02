import { BLOCK_TEMPLATE_QUESTIONS, TEMPLATE_QUESTIONS } from "../constants";
import type { QuestionCache, ReviewItem, ReviewItemType } from "../types/review";
import type { AiSettings } from "../types/settings";

export type AiQuestionGenerator = (input: {
  item: ReviewItem;
  content: string;
  settings: AiSettings;
}) => Promise<string[]>;

export function getTemplateQuestions(itemType: ReviewItemType = "document"): string[] {
  return [...(itemType === "block" ? BLOCK_TEMPLATE_QUESTIONS : TEMPLATE_QUESTIONS)];
}

export function canUseAiQuestionGeneration(ai: AiSettings): boolean {
  return ai.enabled && Boolean(ai.baseUrl.trim()) && Boolean(ai.apiKey.trim()) && Boolean(ai.model.trim()) && ai.maxChars > 0;
}

export async function getReviewQuestions(input: {
  item: ReviewItem;
  content: string;
  ai: AiSettings;
  generateAiQuestions?: AiQuestionGenerator;
  nowIso?: string;
}): Promise<QuestionCache> {
  const nowIso = input.nowIso ?? new Date().toISOString();

  if (!canUseAiQuestionGeneration(input.ai) || !input.generateAiQuestions) {
    return {
      source: "template",
      questions: getTemplateQuestions(input.item.itemType),
      generatedAt: nowIso,
    };
  }

  try {
    const questions = await input.generateAiQuestions({
      item: input.item,
      content: input.content,
      settings: input.ai,
    });

    return {
      source: "ai",
      questions: normalizeQuestions(questions, input.item.itemType),
      generatedAt: nowIso,
    };
  } catch {
    return {
      source: "template",
      questions: getTemplateQuestions(input.item.itemType),
      generatedAt: nowIso,
    };
  }
}

function normalizeQuestions(questions: string[], itemType: ReviewItemType): string[] {
  const cleaned = questions.map((question) => question.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned.slice(0, 5) : getTemplateQuestions(itemType);
}
