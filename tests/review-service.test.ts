import { describe, expect, it } from "vitest";
import { completeReview, recordClozeCheck, startReview } from "../src/core/review-service";
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

  it("uses adaptive intervals for successful review streaks", () => {
    const plan: DailyPlan = {
      date: "2026-07-26",
      generatedAt: "2026-07-26T08:00:00.000Z",
      updatedAt: "2026-07-26T08:00:00.000Z",
      items: [{ docId: "doc-a", reason: "due", status: "reviewing", startedAt: "2026-07-26T08:00:00.000Z" }],
    };
    const doc: ReviewDocState = {
      docId: "doc-a",
      notebookId: "notebook",
      title: "Doc A",
      path: "/Doc A",
      reviewCount: 2,
      successStreak: 2,
      currentIntervalDays: 7,
    };

    const result = completeReview({
      doc,
      plan,
      feedback: "normal",
      intervals,
      completedAt: "2026-07-26T08:05:00.000Z",
    });

    expect(result.doc.nextReviewAt).toBe("2026-08-09");
    expect(result.doc.reviewCount).toBe(3);
    expect(result.doc.successStreak).toBe(3);
    expect(result.doc.currentIntervalDays).toBe(14);
    expect(result.event.intervalDays).toBe(14);
  });

  it("shrinks intervals and resets success streak when a document needs more work", () => {
    const plan: DailyPlan = {
      date: "2026-07-26",
      generatedAt: "2026-07-26T08:00:00.000Z",
      updatedAt: "2026-07-26T08:00:00.000Z",
      items: [{ docId: "doc-a", reason: "due", status: "reviewing", startedAt: "2026-07-26T08:00:00.000Z" }],
    };
    const doc: ReviewDocState = {
      docId: "doc-a",
      notebookId: "notebook",
      title: "Doc A",
      path: "/Doc A",
      reviewCount: 4,
      successStreak: 4,
      lapseCount: 1,
      currentIntervalDays: 28,
    };

    const result = completeReview({
      doc,
      plan,
      feedback: "needsRefactor",
      intervals,
      completedAt: "2026-07-26T08:05:00.000Z",
    });

    expect(result.doc.nextReviewAt).toBe("2026-07-29");
    expect(result.doc.successStreak).toBe(0);
    expect(result.doc.lapseCount).toBe(2);
    expect(result.doc.currentIntervalDays).toBe(3);
  });

  it("caps growing intervals with the configured maximum", () => {
    const plan: DailyPlan = {
      date: "2026-07-26",
      generatedAt: "2026-07-26T08:00:00.000Z",
      updatedAt: "2026-07-26T08:00:00.000Z",
      items: [{ docId: "doc-a", reason: "due", status: "reviewing", startedAt: "2026-07-26T08:00:00.000Z" }],
    };
    const doc: ReviewDocState = {
      docId: "doc-a",
      notebookId: "notebook",
      title: "Doc A",
      path: "/Doc A",
      reviewCount: 8,
      successStreak: 8,
      currentIntervalDays: 120,
    };

    const result = completeReview({
      doc,
      plan,
      feedback: "valuable",
      intervals,
      scheduling: { maxIntervalDays: 180 },
      completedAt: "2026-07-26T08:05:00.000Z",
    });

    expect(result.doc.nextReviewAt).toBe("2027-01-22");
    expect(result.doc.currentIntervalDays).toBe(180);
    expect(result.event.intervalDays).toBe(180);
  });

  it("does not advance memory progress when review is skipped", () => {
    const plan: DailyPlan = {
      date: "2026-07-26",
      generatedAt: "2026-07-26T08:00:00.000Z",
      updatedAt: "2026-07-26T08:00:00.000Z",
      items: [{ docId: "doc-a", reason: "due", status: "reviewing", startedAt: "2026-07-26T08:00:00.000Z" }],
    };
    const doc: ReviewDocState = {
      docId: "doc-a",
      notebookId: "notebook",
      title: "Doc A",
      path: "/Doc A",
      reviewCount: 3,
      successStreak: 2,
      currentIntervalDays: 7,
    };

    const result = completeReview({
      doc,
      plan,
      feedback: "skipped",
      intervals,
      completedAt: "2026-07-26T08:05:00.000Z",
    });

    expect(result.doc.nextReviewAt).toBe("2026-07-27");
    expect(result.doc.reviewCount).toBe(3);
    expect(result.doc.successStreak).toBe(2);
    expect(result.doc.currentIntervalDays).toBe(7);
    expect(result.plan.items[0]?.status).toBe("skipped");
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

  it("increments cloze check count without changing review scheduling", () => {
    const doc: ReviewDocState = {
      docId: "doc-a",
      notebookId: "notebook",
      title: "Doc A",
      path: "/Doc A",
      nextReviewAt: "2026-08-02",
      clozeCheckCount: 2,
    };

    const result = recordClozeCheck(doc);

    expect(result.clozeCheckCount).toBe(3);
    expect(result.nextReviewAt).toBe("2026-08-02");
  });
});
