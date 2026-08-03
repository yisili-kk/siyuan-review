import { describe, expect, it } from "vitest";
import { parseQuestionList } from "../src/ai/question-generator";
import { buildQuestionPrompt } from "../src/ai/prompt";
import type { ReviewItem } from "../src/types/review";

describe("parseQuestionList", () => {
  it("normalizes numbered lists and keeps at most five questions", () => {
    const questions = parseQuestionList(
      [
        "1. 第一条问题？",
        "2、第二条问题？",
        "- 第三条问题？",
        "* 第四条问题？",
        "5) 第五条问题？",
        "6. 第六条问题？",
      ].join("\n"),
    );

    expect(questions).toEqual(["第一条问题？", "第二条问题？", "第三条问题？", "第四条问题？", "第五条问题？"]);
  });

  it("trims overly long questions to protect the dock layout", () => {
    const longQuestion = "这个问题非常长".repeat(20);
    const [question] = parseQuestionList(`1. ${longQuestion}`);

    expect(question).toHaveLength(80);
  });

  it("includes review group template directions in AI prompts", () => {
    const prompt = buildQuestionPrompt(item(), "resource means useful supply");

    expect(prompt).toContain("回顾分组：语言点");
    expect(prompt).toContain("分组默认问题方向");
    expect(prompt).toContain("这个词或短语的核心含义是什么？");
  });
});

function item(): ReviewItem {
  return {
    itemId: "word-resource",
    itemType: "document",
    docId: "word-resource",
    notebookId: "language",
    blockType: "d",
    title: "resource",
    sourceTitle: "resource",
    path: "/resource",
    groupId: "language",
    groupName: "语言点",
    groupTag: "review/language",
    templateQuestions: ["这个词或短语的核心含义是什么？"],
    contentPreview: "resource",
  };
}
