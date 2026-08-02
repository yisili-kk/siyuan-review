import { describe, expect, it } from "vitest";
import {
  getActiveTodayItemIds,
  getPoolCategories,
  getPoolStatusKey,
  getReviewCenterStats,
} from "../src/ui/review-center-model";
import type { DailyPlan, ReviewCandidate } from "../src/types/review";

describe("review center model", () => {
  it("counts only active daily plan items as today reviews", () => {
    const plan: DailyPlan = {
      date: "2026-08-02",
      generatedAt: "2026-08-02T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z",
      items: [
        { itemId: "pending", reason: "due", status: "pending" },
        { itemId: "reviewing", reason: "due", status: "reviewing" },
        { itemId: "done", reason: "due", status: "done" },
        { itemId: "skipped", reason: "due", status: "skipped" },
        { itemId: "missing", reason: "due", status: "missing" },
      ],
    };

    expect(Array.from(getActiveTodayItemIds(plan))).toEqual(["pending", "reviewing"]);
    expect(getReviewCenterStats([
      item("pending"),
      item("reviewing"),
      item("done"),
      item("skipped"),
      item("missing"),
    ], plan, "2026-08-02")).toMatchObject({
      total: 5,
      today: 2,
    });
  });

  it("shows completed needs-supplement items as needs supplement instead of today", () => {
    const todayIds = new Set<string>();
    const reviewed = item("reviewed", {
      status: "needsSupplement",
      lastReviewedAt: "2026-08-02",
      nextReviewAt: "2026-08-05",
    });

    expect(getPoolStatusKey(reviewed, todayIds, "2026-08-02")).toBe("needsSupplement");
    expect(getPoolCategories(reviewed, todayIds, "2026-08-02")).not.toContain("today");
  });
});

function item(itemId: string, overrides: Partial<ReviewCandidate> = {}): ReviewCandidate {
  return {
    itemId,
    itemType: "document",
    docId: itemId,
    notebookId: "notebook",
    blockType: "d",
    title: itemId,
    sourceTitle: itemId,
    path: `/${itemId}`,
    contentPreview: itemId,
    exists: true,
    ...overrides,
  };
}
