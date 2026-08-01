import { describe, expect, it } from "vitest";
import { compareClozeAnswer, parseClozeMarkdown } from "../src/core/cloze";

describe("cloze", () => {
  it("turns markdown highlights into blanks", () => {
    const result = parseClozeMarkdown("# Title\nThe core idea is ==active recall==.");

    expect(result.blanks).toEqual([{ id: "blank-1", answer: "active recall" }]);
    expect(result.segments).toEqual([
      { type: "text", text: "# Title\nThe core idea is " },
      { type: "blank", id: "blank-1", answer: "active recall" },
      { type: "text", text: "." },
    ]);
  });

  it("supports html mark and span highlights", () => {
    const result = parseClozeMarkdown("A <mark>first answer</mark> and <span data-type=\"mark\">second answer</span>.");

    expect(result.blanks.map((blank) => blank.answer)).toEqual(["first answer", "second answer"]);
  });

  it("removes SiYuan kramdown block attributes before rendering", () => {
    const result = parseClozeMarkdown("Text ==answer==\n{: id=\"20260726000000-abcdefg\" updated=\"20260726000000\"}");

    expect(result.blanks).toHaveLength(1);
    expect(result.segments.at(-1)).toEqual({ type: "blank", id: "blank-1", answer: "answer" });
  });

  it("removes inline SiYuan kramdown attributes from list items", () => {
    const result = parseClozeMarkdown("- {: id=\"20260718221210-s74jppf\" updated=\"20260801140216\"} ==take== - /teik/");

    expect(result.segments).toEqual([
      { type: "text", text: "-  " },
      { type: "blank", id: "blank-1", answer: "take" },
      { type: "text", text: " - /teik/" },
    ]);
  });

  it("compares exact and normalized answers as correct", () => {
    expect(compareClozeAnswer("Active   Recall", "active recall")).toBe("correct");
    expect(compareClozeAnswer("主动回忆。", "主动回忆")).toBe("correct");
  });

  it("returns close for partial keyword overlap", () => {
    expect(compareClozeAnswer("active recall practice", "active recall method")).toBe("close");
  });

  it("returns different for unrelated answers", () => {
    expect(compareClozeAnswer("spacing", "active recall")).toBe("different");
  });
});
