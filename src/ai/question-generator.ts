import type { AiQuestionGenerator } from "../core/question-service";
import { buildQuestionPrompt } from "./prompt";
import { createChatCompletion } from "./openai-compatible-client";

const MAX_QUESTION_LENGTH = 80;

export const generateAiQuestions: AiQuestionGenerator = async ({ item, content, settings }) => {
  const limitedContent = content.slice(0, settings.maxChars);
  const prompt = buildQuestionPrompt(item, limitedContent);
  const result = await createChatCompletion(settings, prompt);
  return parseQuestionList(result);
};

export function parseQuestionList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)、])\s*/, "").trim())
    .map(trimQuestionLength)
    .filter(Boolean)
    .slice(0, 5);
}

function trimQuestionLength(question: string): string {
  return question.length > MAX_QUESTION_LENGTH ? question.slice(0, MAX_QUESTION_LENGTH).trimEnd() : question;
}
