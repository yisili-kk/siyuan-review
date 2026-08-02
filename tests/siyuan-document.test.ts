import { describe, expect, it } from "vitest";
import { buildReviewBlocksByTagStmt } from "../src/siyuan/review-query";

describe("siyuan document api", () => {
  it("matches both document tags and inline textmark tags", async () => {
    const stmt = buildReviewBlocksByTagStmt({
      notebookIds: ["notebook-a"],
      tag: "review",
    });

    expect(stmt).toContain("s.type like '%tag%'");
  });

  it("lifts tagged paragraphs inside list items to the parent list item", async () => {
    const stmt = buildReviewBlocksByTagStmt({
      notebookIds: ["notebook-a"],
      tag: "review",
    });

    expect(stmt).toContain("left join blocks parent on parent.id = tagged.parent_id");
    expect(stmt).toContain("when tagged.type <> 'd' and parent.type = 'i' then parent.id");
  });
});
