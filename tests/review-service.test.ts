import { describe, expect, it } from "vitest";
import { completeReview, startReview } from "../src/core/review-service";
import type { DailyPlan, ReviewDocState } from "../src/types/review";
import type { ReviewIntervals } from "../src/types/settings";

const intervals: ReviewIntervals = {
  valuable: 14,
  normal: 7,
  needsSupplement: 3,
  needsRefactor: 3,
  skipped: 1,
};

describe("review-service", () => {
  it("records duration and schedules next review after feedback", () => {
    const plan: DailyPlan = {
      date: "2026-07-26",
      generatedAt: "2026-07-26T08:00:00.000Z",
      updatedAt: "2026-07-26T08:00:00.000Z",
      items: [{ docId: "doc-a", reason: "neverReviewed", status: "pending" }],
    };
    const doc: ReviewDocState = {
      docId: "doc-a",
      notebookId: "notebook",
      title: "Doc A",
      path: "/Doc A",
    };

    startReview(plan, "doc-a", "2026-07-26T08:00:00.000Z");
    const result = completeReview({
      doc,
      plan,
      feedback: "needsSupplement",
      intervals,
      completedAt: "2026-07-26T08:05:30.000Z",
    });

    expect(result.doc.nextReviewAt).toBe("2026-07-29");
    expect(result.doc.status).toBe("needsSupplement");
    expect(result.event.durationSeconds).toBe(330);
    expect(result.plan.items[0]?.status).toBe("done");
  });

  it("does not start or complete terminal plan items", () => {
    const plan: DailyPlan = {
      date: "2026-07-26",
      generatedAt: "2026-07-26T08:00:00.000Z",
      updatedAt: "2026-07-26T08:00:00.000Z",
      items: [{ docId: "doc-a", reason: "neverReviewed", status: "done" }],
    };
    const doc: ReviewDocState = {
      docId: "doc-a",
      notebookId: "notebook",
      title: "Doc A",
      path: "/Doc A",
    };

    expect(() => startReview(plan, "doc-a", "2026-07-26T08:00:00.000Z")).toThrow(/cannot be started/);
    expect(() =>
      completeReview({
        doc,
        plan,
        feedback: "normal",
        intervals,
        completedAt: "2026-07-26T08:05:30.000Z",
      }),
    ).toThrow(/cannot be completed/);
  });
});
