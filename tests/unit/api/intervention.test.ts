import { describe, expect, it } from "vitest";
import { evaluateIntervention, evaluateNightlySummary, normalizeInterventionThresholds, normalizeSummaryTime } from "../../../src/modules/api/intervention.js";
import type { HabitStats, Task } from "../../../src/modules/database/types.js";

const emptyHabitStats: HabitStats = {
  total: 0,
  checkedCount: 0,
  percentage: 0,
  brokenCount: 0,
  recoverableCount: 0
};

function createTask(overrides: Partial<Task> = {}): Task {
  const completedAt = overrides.completedAt ?? null;
  return {
    id: overrides.id ?? 1,
    planId: overrides.planId ?? 1,
    content: overrides.content ?? "Task",
    urgency: overrides.urgency ?? "regular",
    category: overrides.category ?? "work",
    status: overrides.status ?? (completedAt ? "done" : "pending"),
    sortOrder: overrides.sortOrder ?? 0,
    createdAt: overrides.createdAt ?? "2026-06-27T08:00:00.000Z",
    completedAt
  };
}

describe("evaluateIntervention", () => {
  it("returns none when the plan is already completed", () => {
    expect(
      evaluateIntervention({
        now: new Date("2026-06-27T12:00:00.000Z"),
        pendingTasks: [],
        doneTasks: [createTask({ completedAt: "2026-06-27T10:00:00.000Z" })],
        habitStats: emptyHabitStats,
        isCompleted: true
      })
    ).toMatchObject({ level: "none", reason: "none", action: "none" });
  });

  it("prioritizes habit recovery and broken streaks", () => {
    expect(
      evaluateIntervention({
        now: new Date("2026-06-27T08:01:00.000Z"),
        pendingTasks: [createTask()],
        doneTasks: [],
        habitStats: { ...emptyHabitStats, total: 1, recoverableCount: 1 },
        isCompleted: false
      })
    ).toMatchObject({ level: "l1", reason: "habit-recovery", action: "hint" });

    expect(
      evaluateIntervention({
        now: new Date("2026-06-27T08:01:00.000Z"),
        pendingTasks: [createTask()],
        doneTasks: [],
        habitStats: { ...emptyHabitStats, total: 1, brokenCount: 1 },
        isCompleted: false
      })
    ).toMatchObject({ level: "l2", reason: "habit-broken", action: "pet-approach" });
  });

  it("uses default L1-L4 idle thresholds", () => {
    const pendingTasks = [createTask()];
    const base = { pendingTasks, doneTasks: [], habitStats: emptyHabitStats, isCompleted: false };

    expect(evaluateIntervention({ ...base, now: new Date("2026-06-27T08:09:00.000Z") })).toMatchObject({ level: "none" });
    expect(evaluateIntervention({ ...base, now: new Date("2026-06-27T08:10:00.000Z") })).toMatchObject({ level: "l1", action: "hint" });
    expect(evaluateIntervention({ ...base, now: new Date("2026-06-27T08:20:00.000Z") })).toMatchObject({ level: "l2", action: "pet-approach" });
    expect(evaluateIntervention({ ...base, now: new Date("2026-06-27T08:30:00.000Z") })).toMatchObject({ level: "l3", action: "center-intervention" });
    expect(evaluateIntervention({ ...base, now: new Date("2026-06-27T08:40:00.000Z") })).toMatchObject({ level: "l4", action: "force-animation" });
  });

  it("supports custom L1-L4 thresholds", () => {
    expect(
      evaluateIntervention({
        now: new Date("2026-06-27T08:07:00.000Z"),
        pendingTasks: [createTask()],
        doneTasks: [],
        habitStats: emptyHabitStats,
        isCompleted: false,
        thresholdMinutes: { l1: 5, l2: 6, l3: 7, l4: 8 }
      })
    ).toMatchObject({ level: "l3", action: "center-intervention", idleMinutes: 7 });
  });

  it("raises idle intervention levels after long gaps", () => {
    expect(
      evaluateIntervention({
        now: new Date("2026-06-27T13:30:00.000Z"),
        pendingTasks: [createTask()],
        doneTasks: [createTask({ completedAt: "2026-06-27T09:00:00.000Z" })],
        habitStats: emptyHabitStats,
        isCompleted: false
      })
    ).toMatchObject({ level: "l4", reason: "idle", idleMinutes: 270, action: "force-animation" });
  });
});

describe("evaluateNightlySummary", () => {
  it("shows pending task summary after the configured Beijing time", () => {
    const summary = evaluateNightlySummary({
      now: new Date("2026-06-27T13:31:00.000Z"),
      planDate: "2026-06-27",
      todayDate: "2026-06-27",
      summaryTime: "21:30",
      pendingTasks: [createTask({ id: 2, content: "Wrap up" })],
      doneTasks: [createTask({ id: 3, completedAt: "2026-06-27T10:00:00.000Z" })]
    });

    expect(summary).toMatchObject({
      shouldShow: true,
      pendingCount: 1,
      doneCount: 1,
      total: 2,
      pendingTasks: [{ id: 2, content: "Wrap up" }]
    });
  });

  it("stays hidden before time, on other dates, or when disabled", () => {
    const base = {
      now: new Date("2026-06-27T13:00:00.000Z"),
      planDate: "2026-06-27",
      todayDate: "2026-06-27",
      pendingTasks: [createTask()],
      doneTasks: []
    };

    expect(evaluateNightlySummary({ ...base, summaryTime: "21:30" }).shouldShow).toBe(false);
    expect(evaluateNightlySummary({ ...base, planDate: "2026-06-26", summaryTime: "21:00" }).shouldShow).toBe(false);
    expect(evaluateNightlySummary({ ...base, enabled: false, summaryTime: "21:00" }).shouldShow).toBe(false);
  });

  it("uses the updated finished nightly summary wording", () => {
    const summary = evaluateNightlySummary({
      now: new Date("2026-06-27T13:31:00.000Z"),
      planDate: "2026-06-27",
      todayDate: "2026-06-27",
      summaryTime: "21:30",
      pendingTasks: [],
      doneTasks: [createTask({ id: 3, completedAt: "2026-06-27T10:00:00.000Z" })]
    });

    expect(summary.message).toBe("夜间总结今日任务已结束，辛苦啦");
  });
});

describe("intervention settings helpers", () => {
  it("normalizes thresholds and summary time", () => {
    expect(normalizeInterventionThresholds({ l1: 0, l2: 5, l3: 5, l4: 400 })).toEqual({ l1: 1, l2: 5, l3: 6, l4: 240 });
    expect(normalizeSummaryTime("23:15")).toBe("23:15");
    expect(normalizeSummaryTime("24:00")).toBe("21:30");
  });
});

