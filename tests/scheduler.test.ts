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

  it("prioritizes longer overdue documents when there are more due docs than slots", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const plan = buildDailyPlan({
      date: "2026-07-26",
      dailyLimit: 2,
      candidates: [
        candidate("due-today", { nextReviewAt: "2026-07-26", lastReviewedAt: "2026-07-01" }),
        candidate("overdue-one-week", { nextReviewAt: "2026-07-19", lastReviewedAt: "2026-07-01" }),
        candidate("overdue-three-weeks", { nextReviewAt: "2026-07-05", lastReviewedAt: "2026-07-01" }),
      ],
      nowIso: "2026-07-26T09:00:00.000Z",
    });

    expect(plan.items.map((item) => item.docId)).toEqual(["overdue-three-weeks", "overdue-one-week"]);
    expect(plan.items.every((item) => item.reason === "due")).toBe(true);
  });

  it("leaves due documents unchanged when they do not fit today's plan", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const dueToday = candidate("due-today", { nextReviewAt: "2026-07-26", lastReviewedAt: "2026-07-01" });

    const plan = buildDailyPlan({
      date: "2026-07-26",
      dailyLimit: 1,
      candidates: [
        dueToday,
        candidate("overdue-three-weeks", { nextReviewAt: "2026-07-05", lastReviewedAt: "2026-07-01" }),
      ],
      nowIso: "2026-07-26T09:00:00.000Z",
    });

    expect(plan.items.map((item) => item.docId)).toEqual(["overdue-three-weeks"]);
    expect(dueToday.nextReviewAt).toBe("2026-07-26");
    expect(dueToday.status).toBeUndefined();
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
