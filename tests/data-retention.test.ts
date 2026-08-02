import { describe, expect, it } from "vitest";
import { markMissingItems, pruneReviewData } from "../src/storage/data-retention";
import type { DailyPlan, ReviewData, ReviewItem, ReviewEvent } from "../src/types/review";
import type { DataRetentionSettings } from "../src/types/settings";

const settings: DataRetentionSettings = {
  enabled: true,
  keepDailyPlansDays: 180,
  keepHistoryLimit: 3,
  pruneMissingDocsDays: 90,
};

describe("pruneReviewData", () => {
  it("removes old daily plans while keeping recent and future plans", () => {
    const result = pruneReviewData(
      data({
        dailyPlans: {
          "2026-01-01": plan("2026-01-01", ["old"]),
          "2026-07-27": plan("2026-07-27", ["today"]),
          "2026-08-01": plan("2026-08-01", ["future"]),
        },
      }),
      settings,
      "2026-07-27",
    );

    expect(Object.keys(result.data.dailyPlans)).toEqual(["2026-07-27", "2026-08-01"]);
    expect(result.removedDailyPlans).toBe(1);
    expect(result.changed).toBe(true);
  });

  it("keeps only the newest history events by configured limit", () => {
    const result = pruneReviewData(
      data({
        history: [event("a"), event("b"), event("c"), event("d")],
      }),
      settings,
      "2026-07-27",
    );

    expect(result.data.history.map((item) => item.itemId)).toEqual(["b", "c", "d"]);
    expect(result.removedHistoryEvents).toBe(1);
  });

  it("removes stale missing items but keeps referenced and protected items", () => {
    const result = pruneReviewData(
      data({
        items: {
          stale: item("stale", { missingSince: "2026-01-01" }),
          inPlan: item("inPlan", { missingSince: "2026-01-01" }),
          inHistory: item("inHistory", { missingSince: "2026-01-01" }),
          protectedDoc: item("protectedDoc", { missingSince: "2026-01-01" }),
          recent: item("recent", { lastReviewedAt: "2026-07-01" }),
          unknownAge: item("unknownAge"),
        },
        dailyPlans: {
          "2026-07-27": plan("2026-07-27", ["inPlan"]),
        },
        history: [event("inHistory")],
      }),
      settings,
      "2026-07-27",
      ["protectedDoc"],
    );

    expect(Object.keys(result.data.items).sort()).toEqual([
      "inHistory",
      "inPlan",
      "protectedDoc",
      "recent",
      "unknownAge",
    ]);
    expect(result.removedItems).toBe(1);
  });

  it("does not prune items that left the pool before their missing retention window ends", () => {
    const result = pruneReviewData(
      data({
        items: {
          recentlyMissing: item("recentlyMissing", {
            lastReviewedAt: "2026-01-01",
            missingSince: "2026-07-01",
          }),
        },
      }),
      settings,
      "2026-07-27",
    );

    expect(result.data.items.recentlyMissing).toBeDefined();
    expect(result.removedItems).toBe(0);
  });

  it("marks items as missing once they leave the current candidate pool", () => {
    const marked = markMissingItems(
      {
        active: item("active"),
        missing: item("missing"),
        alreadyMarked: item("alreadyMarked", { missingSince: "2026-07-01" }),
      },
      ["active"],
      "2026-07-27",
    );

    expect(marked).toEqual([item("missing", { missingSince: "2026-07-27" })]);
  });

  it("does nothing when retention is disabled", () => {
    const original = data({
      dailyPlans: {
        "2026-01-01": plan("2026-01-01", ["old"]),
      },
      history: [event("a"), event("b"), event("c"), event("d")],
    });

    const result = pruneReviewData(original, { ...settings, enabled: false }, "2026-07-27");

    expect(result.data).toBe(original);
    expect(result.changed).toBe(false);
    expect(result.removedDailyPlans).toBe(0);
    expect(result.removedHistoryEvents).toBe(0);
  });
});

function data(overrides: Partial<ReviewData> = {}): ReviewData {
  return {
    schemaVersion: 2,
    items: {},
    dailyPlans: {},
    history: [],
    ...overrides,
  };
}

function item(itemId: string, overrides: Partial<ReviewItem> = {}): ReviewItem {
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
    ...overrides,
  };
}

function plan(date: string, itemIds: string[]): DailyPlan {
  return {
    date,
    generatedAt: `${date}T08:00:00.000Z`,
    updatedAt: `${date}T08:00:00.000Z`,
    items: itemIds.map((itemId) => ({
      itemId,
      reason: "neverReviewed",
      status: "pending",
    })),
  };
}

function event(itemId: string): ReviewEvent {
  return {
    id: `${itemId}-event`,
    itemId,
    feedback: "normal",
    completedAt: "2026-07-27T08:00:00.000Z",
    nextReviewAt: "2026-08-03",
  };
}
