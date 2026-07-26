import { describe, expect, it } from "vitest";
import { parseQuestionList } from "../src/ai/question-generator";

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
});
