import { describe, expect, it } from "vitest";
import { markMissingDocs, pruneReviewData } from "../src/storage/data-retention";
import type { DailyPlan, ReviewData, ReviewDocState, ReviewEvent } from "../src/types/review";
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

    expect(result.data.history.map((item) => item.docId)).toEqual(["b", "c", "d"]);
    expect(result.removedHistoryEvents).toBe(1);
  });

  it("removes stale missing docs but keeps referenced and protected docs", () => {
    const result = pruneReviewData(
      data({
        docs: {
          stale: doc("stale", { missingSince: "2026-01-01" }),
          inPlan: doc("inPlan", { missingSince: "2026-01-01" }),
          inHistory: doc("inHistory", { missingSince: "2026-01-01" }),
          protectedDoc: doc("protectedDoc", { missingSince: "2026-01-01" }),
          recent: doc("recent", { lastReviewedAt: "2026-07-01" }),
          unknownAge: doc("unknownAge"),
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

    expect(Object.keys(result.data.docs).sort()).toEqual([
      "inHistory",
      "inPlan",
      "protectedDoc",
      "recent",
      "unknownAge",
    ]);
    expect(result.removedDocs).toBe(1);
  });

  it("does not prune docs that left the pool before their missing retention window ends", () => {
    const result = pruneReviewData(
      data({
        docs: {
          recentlyMissing: doc("recentlyMissing", {
            lastReviewedAt: "2026-01-01",
            missingSince: "2026-07-01",
          }),
        },
      }),
      settings,
      "2026-07-27",
    );

    expect(result.data.docs.recentlyMissing).toBeDefined();
    expect(result.removedDocs).toBe(0);
  });

  it("marks docs as missing once they leave the current candidate pool", () => {
    const marked = markMissingDocs(
      {
        active: doc("active"),
        missing: doc("missing"),
        alreadyMarked: doc("alreadyMarked", { missingSince: "2026-07-01" }),
      },
      ["active"],
      "2026-07-27",
    );

    expect(marked).toEqual([doc("missing", { missingSince: "2026-07-27" })]);
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
    schemaVersion: 1,
    docs: {},
    dailyPlans: {},
    history: [],
    ...overrides,
  };
}

function doc(docId: string, overrides: Partial<ReviewDocState> = {}): ReviewDocState {
  return {
    docId,
    notebookId: "notebook",
    title: docId,
    path: `/${docId}`,
    ...overrides,
  };
}

function plan(date: string, docIds: string[]): DailyPlan {
  return {
    date,
    generatedAt: `${date}T08:00:00.000Z`,
    updatedAt: `${date}T08:00:00.000Z`,
    items: docIds.map((docId) => ({
      docId,
      reason: "neverReviewed",
      status: "pending",
    })),
  };
}

function event(docId: string): ReviewEvent {
  return {
    id: `${docId}-event`,
    docId,
    feedback: "normal",
    completedAt: "2026-07-27T08:00:00.000Z",
    nextReviewAt: "2026-08-03",
  };
}
