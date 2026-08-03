import { describe, expect, it, vi } from "vitest";
import { buildDailyPlan, getIncompleteCount, syncDailyPlanAvailability } from "../src/core/scheduler";
import type { ReviewCandidate } from "../src/types/review";
import type { ReviewGroupSettings } from "../src/types/settings";

const defaultGroups: ReviewGroupSettings[] = [
  { id: "default", name: "普通笔记", tag: "review", dailyLimit: 3, templateQuestions: ["问题"], enabled: true },
];

describe("buildDailyPlan", () => {
  it("keeps completed items when regenerating today's plan", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const plan = buildDailyPlan({
      date: "2026-07-26",
      reviewGroups: defaultGroups,
      candidates: [
        candidate("done-item", { lastReviewedAt: "2026-07-01" }),
        candidate("new-item"),
        candidate("due-item", { nextReviewAt: "2026-07-20" }),
        candidate("old-item", { lastReviewedAt: "2026-06-01" }),
      ],
      existingPlan: {
        date: "2026-07-26",
        generatedAt: "2026-07-26T08:00:00.000Z",
        updatedAt: "2026-07-26T08:00:00.000Z",
        items: [
          {
            itemId: "done-item",
            groupId: "default",
            reason: "oldestReviewed",
            status: "done",
            completedAt: "2026-07-26T08:10:00.000Z",
          },
          {
            itemId: "replace-me",
            groupId: "default",
            reason: "oldestReviewed",
            status: "pending",
          },
        ],
      },
      nowIso: "2026-07-26T09:00:00.000Z",
    });

    expect(plan.items.map((item) => item.itemId)).toEqual(["done-item", "due-item", "new-item"]);
    expect(plan.generatedAt).toBe("2026-07-26T08:00:00.000Z");
  });

  it("prioritizes due documents before maintenance and never reviewed documents", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const plan = buildDailyPlan({
      date: "2026-07-26",
      reviewGroups: defaultGroups,
      candidates: [
        candidate("never-reviewed"),
        candidate("needs-refactor", { status: "needsRefactor" }),
        candidate("due", { nextReviewAt: "2026-07-20", lastReviewedAt: "2026-07-01" }),
      ],
      nowIso: "2026-07-26T09:00:00.000Z",
    });

    expect(plan.items.map((item) => item.itemId)).toEqual(["due", "needs-refactor", "never-reviewed"]);
    expect(plan.items.map((item) => item.reason)).toEqual(["due", "priority", "neverReviewed"]);
  });

  it("prioritizes longer overdue documents when there are more due items than slots", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const plan = buildDailyPlan({
      date: "2026-07-26",
      reviewGroups: [{ ...defaultGroups[0], dailyLimit: 2 }],
      candidates: [
        candidate("due-today", { nextReviewAt: "2026-07-26", lastReviewedAt: "2026-07-01" }),
        candidate("overdue-one-week", { nextReviewAt: "2026-07-19", lastReviewedAt: "2026-07-01" }),
        candidate("overdue-three-weeks", { nextReviewAt: "2026-07-05", lastReviewedAt: "2026-07-01" }),
      ],
      nowIso: "2026-07-26T09:00:00.000Z",
    });

    expect(plan.items.map((item) => item.itemId)).toEqual(["overdue-three-weeks", "overdue-one-week"]);
    expect(plan.items.every((item) => item.reason === "due")).toBe(true);
  });

  it("leaves due documents unchanged when they do not fit today's plan", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const dueToday = candidate("due-today", { nextReviewAt: "2026-07-26", lastReviewedAt: "2026-07-01" });

    const plan = buildDailyPlan({
      date: "2026-07-26",
      reviewGroups: [{ ...defaultGroups[0], dailyLimit: 1 }],
      candidates: [
        dueToday,
        candidate("overdue-three-weeks", { nextReviewAt: "2026-07-05", lastReviewedAt: "2026-07-01" }),
      ],
      nowIso: "2026-07-26T09:00:00.000Z",
    });

    expect(plan.items.map((item) => item.itemId)).toEqual(["overdue-three-weeks"]);
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
          { itemId: "available", groupId: "default", reason: "neverReviewed", status: "pending" },
          { itemId: "removed", groupId: "default", reason: "neverReviewed", status: "reviewing" },
          { itemId: "done", groupId: "default", reason: "neverReviewed", status: "done" },
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
        items: [{ itemId: "restored", groupId: "default", reason: "neverReviewed", status: "missing" }],
      },
      [candidate("restored")],
      "2026-07-26T09:00:00.000Z",
    );

    expect(plan.items[0]?.status).toBe("pending");
  });

  it("allocates daily slots by review group before filling spare slots globally", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const plan = buildDailyPlan({
      date: "2026-07-26",
      reviewGroups: [
        { id: "default", name: "普通笔记", tag: "review", dailyLimit: 1, templateQuestions: ["普通问题"], enabled: true },
        { id: "language", name: "语言点", tag: "review/language", dailyLimit: 2, templateQuestions: ["语言问题"], enabled: true },
      ],
      candidates: [
        candidate("note", { groupId: "default", groupName: "普通笔记", groupTag: "review" }),
        candidate("language-a", { groupId: "language", groupName: "语言点", groupTag: "review/language" }),
        candidate("language-b", { groupId: "language", groupName: "语言点", groupTag: "review/language" }),
        candidate("language-c", { groupId: "language", groupName: "语言点", groupTag: "review/language" }),
      ],
      nowIso: "2026-07-26T09:00:00.000Z",
    });

    expect(plan.items.map((item) => item.groupId)).toEqual(["default", "language", "language"]);
    expect(plan.items.map((item) => item.itemId)).toContain("note");
  });
});

function candidate(itemId: string, overrides: Partial<ReviewCandidate> = {}): ReviewCandidate {
  return {
    itemId,
    itemType: "document",
    docId: itemId,
    notebookId: "notebook",
    blockType: "d",
    title: itemId,
    sourceTitle: itemId,
    path: `/${itemId}`,
    groupId: "default",
    groupName: "普通笔记",
    groupTag: "review",
    templateQuestions: ["问题"],
    contentPreview: itemId,
    exists: true,
    ...overrides,
  };
}
