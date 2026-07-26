import { TEMPLATE_QUESTIONS } from "../constants";
import type { QuestionCache, ReviewDocState } from "../types/review";
import type { AiSettings } from "../types/settings";

export type AiQuestionGenerator = (input: {
  doc: ReviewDocState;
  content: string;
  settings: AiSettings;
}) => Promise<string[]>;

export function getTemplateQuestions(): string[] {
  return [...TEMPLATE_QUESTIONS];
}

export function canUseAiQuestionGeneration(ai: AiSettings): boolean {
  return ai.enabled && Boolean(ai.baseUrl.trim()) && Boolean(ai.apiKey.trim()) && Boolean(ai.model.trim()) && ai.maxChars > 0;
}

export function shouldAutoGenerateQuestions(doc: ReviewDocState): boolean {
  return !doc.questionCache;
}

export async function getReviewQuestions(input: {
  doc: ReviewDocState;
  content: string;
  ai: AiSettings;
  generateAiQuestions?: AiQuestionGenerator;
  nowIso?: string;
}): Promise<QuestionCache> {
  const nowIso = input.nowIso ?? new Date().toISOString();

  if (!canUseAiQuestionGeneration(input.ai) || !input.generateAiQuestions) {
    return {
      source: "template",
      questions: getTemplateQuestions(),
      generatedAt: nowIso,
    };
  }

  try {
    const questions = await input.generateAiQuestions({
      doc: input.doc,
      content: input.content,
      settings: input.ai,
    });

    return {
      source: "ai",
      questions: normalizeQuestions(questions),
      generatedAt: nowIso,
    };
  } catch {
    return {
      source: "template",
      questions: getTemplateQuestions(),
      generatedAt: nowIso,
    };
  }
}

function normalizeQuestions(questions: string[]): string[] {
  const cleaned = questions.map((question) => question.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned.slice(0, 5) : getTemplateQuestions();
}
