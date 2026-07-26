import type { AiQuestionGenerator } from "../core/question-service";
import { buildQuestionPrompt } from "./prompt";
import { createChatCompletion } from "./openai-compatible-client";

export const generateAiQuestions: AiQuestionGenerator = async ({ doc, content, settings }) => {
  const limitedContent = content.slice(0, settings.maxChars);
  const prompt = buildQuestionPrompt(doc, limitedContent);
  const result = await createChatCompletion(settings, prompt);
  return parseQuestionList(result);
};

export function parseQuestionList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)、])\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 5);
}
