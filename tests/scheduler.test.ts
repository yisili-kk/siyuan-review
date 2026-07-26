import { describe, expect, it, vi } from "vitest";
import { buildDailyPlan, getIncompleteCount, syncDailyPlanAvailability } from "../src/core/scheduler";
import type { ReviewCandidate } from "../src/types/review";

describe("buildDailyPlan", () => {
  it("keeps completed items when regenerating today's plan", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const plan = buildDailyPlan({
      date: "2026-07-26",
      dailyLimit: 3,
      candidates: [
        candidate("done-doc", { lastReviewedAt: "2026-07-01" }),
        candidate("new-doc"),
        candidate("due-doc", { nextReviewAt: "2026-07-20" }),
        candidate("old-doc", { lastReviewedAt: "2026-06-01" }),
      ],
      existingPlan: {
        date: "2026-07-26",
        generatedAt: "2026-07-26T08:00:00.000Z",
        updatedAt: "2026-07-26T08:00:00.000Z",
        items: [
          {
            docId: "done-doc",
            reason: "oldestReviewed",
            status: "done",
            completedAt: "2026-07-26T08:10:00.000Z",
          },
          {
            docId: "replace-me",
            reason: "oldestReviewed",
            status: "pending",
          },
        ],
      },
      nowIso: "2026-07-26T09:00:00.000Z",
    });

    expect(plan.items.map((item) => item.docId)).toEqual(["done-doc", "due-doc", "new-doc"]);
    expect(plan.generatedAt).toBe("2026-07-26T08:00:00.000Z");
  });

  it("prioritizes due documents before maintenance and never reviewed documents", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const plan = buildDailyPlan({
      date: "2026-07-26",
      dailyLimit: 3,
      candidates: [
        candidate("never-reviewed"),
        candidate("needs-refactor", { status: "needsRefactor" }),
        candidate("due", { nextReviewAt: "2026-07-20", lastReviewedAt: "2026-07-01" }),
      ],
      nowIso: "2026-07-26T09:00:00.000Z",
    });

    expect(plan.items.map((item) => item.docId)).toEqual(["due", "needs-refactor", "never-reviewed"]);
    expect(plan.items.map((item) => item.reason)).toEqual(["due", "priority", "neverReviewed"]);
  });

  it("marks non-terminal plan items as missing when they leave the review pool", () => {
    const plan = syncDailyPlanAvailability(
      {
        date: "2026-07-26",
        generatedAt: "2026-07-26T08:00:00.000Z",
        updatedAt: "2026-07-26T08:00:00.000Z",
        items: [
          { docId: "available", reason: "neverReviewed", status: "pending" },
          { docId: "removed", reason: "neverReviewed", status: "reviewing" },
          { docId: "done", reason: "neverReviewed", status: "done" },
        ],
      },
      [candidate("available")],
      "2026-07-26T09:00:00.000Z",
    );

    expect(plan.items.map((item) => item.status)).toEqual(["pending", "missing", "done"]);
    expect(getIncompleteCount(plan)).toBe(1);
    expect(plan.updatedAt).toBe("2026-07-26T09:00:00.000Z");
  });

  it("restores missing items when they enter the review pool again", () => {
    const plan = syncDailyPlanAvailability(
      {
        date: "2026-07-26",
        generatedAt: "2026-07-26T08:00:00.000Z",
        updatedAt: "2026-07-26T08:00:00.000Z",
        items: [{ docId: "restored", reason: "neverReviewed", status: "missing" }],
      },
      [candidate("restored")],
      "2026-07-26T09:00:00.000Z",
    );

    expect(plan.items[0]?.status).toBe("pending");
  });
});

function candidate(docId: string, overrides: Partial<ReviewCandidate> = {}): ReviewCandidate {
  return {
    docId,
    notebookId: "notebook",
    title: docId,
    path: `/${docId}`,
    exists: true,
    ...overrides,
  };
}
