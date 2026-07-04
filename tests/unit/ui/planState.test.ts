import { describe, expect, it } from "vitest";
import { mockDailyPlan } from "../../../src/modules/ui/mockPlan.js";
import {
  addTaskToView,
  buildHistoryHeatmapDays,
  buildHistoryOverview,
  createEmptyPlanView,
  filterHistorySummaries,
  moveTaskId,
  normalizePlanView,
  removeTaskFromView,
  reorderTasksInView,
  setTaskStatusInView,
  shouldTriggerCompletionCelebration,
  shiftPlanDate,
  updateTaskInView
} from "../../../src/modules/ui/planState.js";

describe("ui plan state", () => {
  it("normalizes task groups and progress", () => {
    const view = normalizePlanView(mockDailyPlan);

    expect(view.pendingTasks).toHaveLength(2);
    expect(view.doneTasks).toHaveLength(1);
    expect(view.stats).toEqual({ total: 3, doneCount: 1, percentage: 33 });
  });

  it("creates empty views for dates without stored plans", () => {
    const view = createEmptyPlanView("2026-06-25");

    expect(view.plan).toMatchObject({ id: 0, planDate: "2026-06-25", completedAt: null });
    expect(view.tasks).toEqual([]);
    expect(view.pendingTasks).toEqual([]);
    expect(view.doneTasks).toEqual([]);
    expect(view.stats).toEqual({ total: 0, doneCount: 0, percentage: 0 });
    expect(view.isCompleted).toBe(false);
    expect(view.agentInsight).toMatchObject({ risk: "watch", focus: "plan" });
  });

  it("shifts plan dates across month boundaries", () => {
    expect(shiftPlanDate("2026-07-01", -1)).toBe("2026-06-30");
    expect(shiftPlanDate("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("builds history overview stats and streaks", () => {
    expect(buildHistoryOverview([])).toEqual({
      totalPlans: 0,
      completionRate: 0,
      currentStreak: 0,
      bestStreak: 0
    });

    expect(
      buildHistoryOverview([
        { planDate: "2026-06-27", completedAt: "2026-06-27 20:00:00", total: 2, doneCount: 2, percentage: 100, isCompleted: true },
        { planDate: "2026-06-26", completedAt: "2026-06-26 20:00:00", total: 1, doneCount: 1, percentage: 100, isCompleted: true },
        { planDate: "2026-06-25", completedAt: null, total: 2, doneCount: 1, percentage: 50, isCompleted: false },
        { planDate: "2026-06-24", completedAt: "2026-06-24 20:00:00", total: 1, doneCount: 1, percentage: 100, isCompleted: true }
      ])
    ).toEqual({
      totalPlans: 4,
      completionRate: 75,
      currentStreak: 2,
      bestStreak: 2
    });
  });


  it("builds calendar heatmap days for history", () => {
    const days = buildHistoryHeatmapDays(
      [
        { planDate: "2026-06-25", completedAt: null, total: 2, doneCount: 1, percentage: 50, isCompleted: false },
        { planDate: "2026-06-27", completedAt: "2026-06-27 20:00:00", total: 2, doneCount: 2, percentage: 100, isCompleted: true }
      ],
      { totalDays: 4, anchorDate: "2026-06-27" }
    );

    expect(days.map((day) => day.planDate)).toEqual(["2026-06-21", "2026-06-22", "2026-06-23", "2026-06-24", "2026-06-25", "2026-06-26", "2026-06-27"]);
    expect(days.find((day) => day.planDate === "2026-06-25")).toMatchObject({ hasPlan: true, intensity: 2 });
    expect(days.find((day) => day.planDate === "2026-06-27")).toMatchObject({ hasPlan: true, intensity: 4 });
    expect(days.find((day) => day.planDate === "2026-06-26")).toMatchObject({ hasPlan: false, intensity: 0 });
  });
  it("filters history summaries by completion state", () => {
    const summaries = [
      { planDate: "2026-06-27", completedAt: "2026-06-27 20:00:00", total: 2, doneCount: 2, percentage: 100, isCompleted: true },
      { planDate: "2026-06-26", completedAt: null, total: 2, doneCount: 1, percentage: 50, isCompleted: false }
    ];

    expect(filterHistorySummaries(summaries, "all")).toEqual(summaries);
    expect(filterHistorySummaries(summaries, "completed").map((summary) => summary.planDate)).toEqual(["2026-06-27"]);
    expect(filterHistorySummaries(summaries, "unfinished").map((summary) => summary.planDate)).toEqual(["2026-06-26"]);
  });

  it("detects completion celebration transitions", () => {
    expect(shouldTriggerCompletionCelebration(false, true)).toBe(true);
    expect(shouldTriggerCompletionCelebration(true, true)).toBe(false);
    expect(shouldTriggerCompletionCelebration(false, false)).toBe(false);
    expect(shouldTriggerCompletionCelebration(true, false)).toBe(false);
  });
  it("adds urgent tasks before regular tasks", () => {
    const view = addTaskToView(normalizePlanView(mockDailyPlan), {
      content: "复习考试重点",
      category: "study",
      urgency: "urgent"
    });

    expect(view.tasks.map((task) => task.content).slice(0, 2)).toEqual([
      "完成 Q2 报告终稿",
      "复习考试重点"
    ]);
    expect(view.stats.total).toBe(4);
    expect(view.stats.doneCount).toBe(1);
  });


  it("moves and reorders tasks in the UI fallback state", () => {
    expect(moveTaskId([1, 2, 3], 3, 1)).toEqual([3, 1, 2]);
    expect(moveTaskId([1, 2, 3], 4, 1)).toEqual([1, 2, 3]);

    const view = reorderTasksInView(normalizePlanView(mockDailyPlan), [2, 1]);

    expect(view.pendingTasks.map((task) => task.id)).toEqual([2, 1]);
    expect(view.tasks.map((task) => task.id)).toEqual([2, 1, 3]);
  });
  it("updates task content and attributes", () => {
    const view = updateTaskInView(normalizePlanView(mockDailyPlan), 2, {
      content: "整理会议纪要",
      category: "work",
      urgency: "urgent"
    });

    expect(view.tasks.find((task) => task.id === 2)).toMatchObject({
      content: "整理会议纪要",
      category: "work",
      urgency: "urgent",
      status: "pending"
    });
  });

  it("completes, reopens, and removes tasks", () => {
    const baseView = normalizePlanView(mockDailyPlan);
    const completedView = setTaskStatusInView(baseView, 1, "done", new Date("2026-06-27T02:00:00.000Z"));

    expect(completedView.doneTasks.map((task) => task.id)).toContain(1);
    expect(completedView.stats).toEqual({ total: 3, doneCount: 2, percentage: 67 });

    const reopenedView = setTaskStatusInView(completedView, 1, "pending");
    expect(reopenedView.pendingTasks.map((task) => task.id)).toContain(1);
    expect(reopenedView.stats).toEqual({ total: 3, doneCount: 1, percentage: 33 });

    const removedView = removeTaskFromView(reopenedView, 3);
    expect(removedView.tasks.map((task) => task.id)).not.toContain(3);
    expect(removedView.stats).toEqual({ total: 2, doneCount: 0, percentage: 0 });
  });
});







