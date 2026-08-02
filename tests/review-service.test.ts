import { describe, expect, it } from "vitest";
import { completeReview, recordClozeCheck, startReview } from "../src/core/review-service";
import type { DailyPlan, ReviewItem } from "../src/types/review";
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
      items: [{ itemId: "item-a", reason: "neverReviewed", status: "pending" }],
    };
    const item: ReviewItem = {
      itemId: "item-a",
      itemType: "document",
      docId: "item-a",
      notebookId: "notebook",
      blockType: "d",
      title: "Doc A",
      sourceTitle: "Doc A",
      path: "/Doc A",
      contentPreview: "Doc A",
    };

    startReview(plan, "item-a", "2026-07-26T08:00:00.000Z");
    const result = completeReview({
      item,
      plan,
      feedback: "needsSupplement",
      intervals,
      completedAt: "2026-07-26T08:05:30.000Z",
    });

    expect(result.item.nextReviewAt).toBe("2026-07-29");
    expect(result.item.status).toBe("needsSupplement");
    expect(result.event.durationSeconds).toBe(330);
    expect(result.plan.items[0]?.status).toBe("done");
  });

  it("uses adaptive intervals for successful review streaks", () => {
    const plan: DailyPlan = {
      date: "2026-07-26",
      generatedAt: "2026-07-26T08:00:00.000Z",
      updatedAt: "2026-07-26T08:00:00.000Z",
      items: [{ itemId: "item-a", reason: "due", status: "reviewing", startedAt: "2026-07-26T08:00:00.000Z" }],
    };
    const item: ReviewItem = {
      itemId: "item-a",
      itemType: "document",
      docId: "item-a",
      notebookId: "notebook",
      blockType: "d",
      title: "Doc A",
      sourceTitle: "Doc A",
      path: "/Doc A",
      contentPreview: "Doc A",
      reviewCount: 2,
      successStreak: 2,
      currentIntervalDays: 7,
    };

    const result = completeReview({
      item,
      plan,
      feedback: "normal",
      intervals,
      completedAt: "2026-07-26T08:05:00.000Z",
    });

    expect(result.item.nextReviewAt).toBe("2026-08-09");
    expect(result.item.reviewCount).toBe(3);
    expect(result.item.successStreak).toBe(3);
    expect(result.item.currentIntervalDays).toBe(14);
    expect(result.event.intervalDays).toBe(14);
  });

  it("shrinks intervals and resets success streak when a document needs more work", () => {
    const plan: DailyPlan = {
      date: "2026-07-26",
      generatedAt: "2026-07-26T08:00:00.000Z",
      updatedAt: "2026-07-26T08:00:00.000Z",
      items: [{ itemId: "item-a", reason: "due", status: "reviewing", startedAt: "2026-07-26T08:00:00.000Z" }],
    };
    const item: ReviewItem = {
      itemId: "item-a",
      itemType: "document",
      docId: "item-a",
      notebookId: "notebook",
      blockType: "d",
      title: "Doc A",
      sourceTitle: "Doc A",
      path: "/Doc A",
      contentPreview: "Doc A",
      reviewCount: 4,
      successStreak: 4,
      lapseCount: 1,
      currentIntervalDays: 28,
    };

    const result = completeReview({
      item,
      plan,
      feedback: "needsRefactor",
      intervals,
      completedAt: "2026-07-26T08:05:00.000Z",
    });

    expect(result.item.nextReviewAt).toBe("2026-07-29");
    expect(result.item.successStreak).toBe(0);
    expect(result.item.lapseCount).toBe(2);
    expect(result.item.currentIntervalDays).toBe(3);
  });

  it("stores processing notes on review events", () => {
    const plan: DailyPlan = {
      date: "2026-07-26",
      generatedAt: "2026-07-26T08:00:00.000Z",
      updatedAt: "2026-07-26T08:00:00.000Z",
      items: [{ itemId: "item-a", reason: "due", status: "reviewing", startedAt: "2026-07-26T08:00:00.000Z" }],
    };
    const item: ReviewItem = {
      itemId: "item-a",
      itemType: "document",
      docId: "item-a",
      notebookId: "notebook",
      blockType: "d",
      title: "Doc A",
      sourceTitle: "Doc A",
      path: "/Doc A",
      contentPreview: "Doc A",
    };

    const result = completeReview({
      item,
      plan,
      feedback: "needsSupplement",
      intervals,
      note: "  补充案例和来源  ",
      completedAt: "2026-07-26T08:05:00.000Z",
    });

    expect(result.event.note).toBe("补充案例和来源");
  });

  it("caps growing intervals with the configured maximum", () => {
    const plan: DailyPlan = {
      date: "2026-07-26",
      generatedAt: "2026-07-26T08:00:00.000Z",
      updatedAt: "2026-07-26T08:00:00.000Z",
      items: [{ itemId: "item-a", reason: "due", status: "reviewing", startedAt: "2026-07-26T08:00:00.000Z" }],
    };
    const item: ReviewItem = {
      itemId: "item-a",
      itemType: "document",
      docId: "item-a",
      notebookId: "notebook",
      blockType: "d",
      title: "Doc A",
      sourceTitle: "Doc A",
      path: "/Doc A",
      contentPreview: "Doc A",
      reviewCount: 8,
      successStreak: 8,
      currentIntervalDays: 120,
    };

    const result = completeReview({
      item,
      plan,
      feedback: "valuable",
      intervals,
      scheduling: { maxIntervalDays: 180 },
      completedAt: "2026-07-26T08:05:00.000Z",
    });

    expect(result.item.nextReviewAt).toBe("2027-01-22");
    expect(result.item.currentIntervalDays).toBe(180);
    expect(result.event.intervalDays).toBe(180);
  });

  it("does not advance memory progress when review is skipped", () => {
    const plan: DailyPlan = {
      date: "2026-07-26",
      generatedAt: "2026-07-26T08:00:00.000Z",
      updatedAt: "2026-07-26T08:00:00.000Z",
      items: [{ itemId: "item-a", reason: "due", status: "reviewing", startedAt: "2026-07-26T08:00:00.000Z" }],
    };
    const item: ReviewItem = {
      itemId: "item-a",
      itemType: "document",
      docId: "item-a",
      notebookId: "notebook",
      blockType: "d",
      title: "Doc A",
      sourceTitle: "Doc A",
      path: "/Doc A",
      contentPreview: "Doc A",
      reviewCount: 3,
      successStreak: 2,
      currentIntervalDays: 7,
    };

    const result = completeReview({
      item,
      plan,
      feedback: "skipped",
      intervals,
      completedAt: "2026-07-26T08:05:00.000Z",
    });

    expect(result.item.nextReviewAt).toBe("2026-07-27");
    expect(result.item.reviewCount).toBe(3);
    expect(result.item.successStreak).toBe(2);
    expect(result.item.currentIntervalDays).toBe(7);
    expect(result.plan.items[0]?.status).toBe("skipped");
  });

  it("does not start or complete terminal plan items", () => {
    const plan: DailyPlan = {
      date: "2026-07-26",
      generatedAt: "2026-07-26T08:00:00.000Z",
      updatedAt: "2026-07-26T08:00:00.000Z",
      items: [{ itemId: "item-a", reason: "neverReviewed", status: "done" }],
    };
    const item: ReviewItem = {
      itemId: "item-a",
      itemType: "document",
      docId: "item-a",
      notebookId: "notebook",
      blockType: "d",
      title: "Doc A",
      sourceTitle: "Doc A",
      path: "/Doc A",
      contentPreview: "Doc A",
    };

    expect(() => startReview(plan, "item-a", "2026-07-26T08:00:00.000Z")).toThrow(/cannot be started/);
    expect(() =>
      completeReview({
        item,
        plan,
        feedback: "normal",
        intervals,
        completedAt: "2026-07-26T08:05:30.000Z",
      }),
    ).toThrow(/cannot be completed/);
  });

  it("increments cloze check count without changing review scheduling", () => {
    const item: ReviewItem = {
      itemId: "item-a",
      itemType: "document",
      docId: "item-a",
      notebookId: "notebook",
      blockType: "d",
      title: "Doc A",
      sourceTitle: "Doc A",
      path: "/Doc A",
      contentPreview: "Doc A",
      nextReviewAt: "2026-08-02",
      clozeCheckCount: 2,
    };

    const result = recordClozeCheck(item);

    expect(result.clozeCheckCount).toBe(3);
    expect(result.nextReviewAt).toBe("2026-08-02");
  });
});
