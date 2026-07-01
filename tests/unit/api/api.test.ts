import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LetsPlanApi, formatPlanDate } from "../../../src/modules/api/index.js";
import { LetsPlanDatabase } from "../../../src/modules/database/index.js";

const temporaryDirectories: string[] = [];
const openApis: LetsPlanApi[] = [];

function createTestApi(now = new Date("2026-06-26T16:30:00.000Z")): LetsPlanApi {
  const directory = mkdtempSync(join(tmpdir(), "letsplan-api-"));
  temporaryDirectories.push(directory);

  const database = new LetsPlanDatabase(join(directory, "data.db"));
  const api = new LetsPlanApi(database, () => now);
  openApis.push(api);

  return api;
}

afterEach(() => {
  while (openApis.length > 0) {
    openApis.pop()?.close();
  }

  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe("LetsPlanApi", () => {
  it("formats the current plan date with Beijing time", () => {
    const date = new Date("2026-06-26T16:30:00.000Z");

    expect(formatPlanDate(date)).toBe("2026-06-27");
  });

  it("returns an empty today plan view", () => {
    const api = createTestApi();

    const view = api.getTodayPlan();

    expect(view.plan.planDate).toBe("2026-06-27");
    expect(view.tasks).toEqual([]);
    expect(view.pendingTasks).toEqual([]);
    expect(view.doneTasks).toEqual([]);
    expect(view.stats).toEqual({ total: 0, doneCount: 0, percentage: 0 });
    expect(view.isCompleted).toBe(false);
  });

  it("does not create a plan when reading a missing historical date", () => {
    const api = createTestApi();

    expect(api.getPlanByDate("2026-06-25")).toBeNull();
    expect(api.getTodayPlan().plan.planDate).toBe("2026-06-27");
    expect(api.getPlanByDate("2026-06-25")).toBeNull();
  });

  it("adds tasks to today and groups the returned view", () => {
    const api = createTestApi();

    api.addTask({
      content: "Read chapter 5",
      category: "study",
      urgency: "regular"
    });
    const view = api.addTask({
      content: "Finish Q2 report",
      category: "work",
      urgency: "urgent"
    });

    expect(view.plan.planDate).toBe("2026-06-27");
    expect(view.tasks.map((task) => task.content)).toEqual([
      "Finish Q2 report",
      "Read chapter 5"
    ]);
    expect(view.pendingTasks).toHaveLength(2);
    expect(view.doneTasks).toHaveLength(0);
    expect(view.stats.percentage).toBe(0);
  });

  it("completes and reopens tasks through the api boundary", () => {
    const api = createTestApi();
    const firstView = api.addTask({ content: "Reply emails" });
    const taskId = firstView.tasks[0].id;

    const completedView = api.completeTask("2026-06-27", taskId);

    expect(completedView.doneTasks.map((task) => task.id)).toEqual([taskId]);
    expect(completedView.pendingTasks).toHaveLength(0);
    expect(completedView.stats).toEqual({ total: 1, doneCount: 1, percentage: 100 });
    expect(completedView.isCompleted).toBe(true);
    expect(completedView.plan.completedAt).not.toBeNull();

    const reopenedView = api.reopenTask("2026-06-27", taskId);

    expect(reopenedView.pendingTasks.map((task) => task.id)).toEqual([taskId]);
    expect(reopenedView.doneTasks).toHaveLength(0);
    expect(reopenedView.stats).toEqual({ total: 1, doneCount: 0, percentage: 0 });
    expect(reopenedView.isCompleted).toBe(false);
    expect(reopenedView.plan.completedAt).toBeNull();
  });

  it("rejects task status updates when the task belongs to another date", () => {
    const api = createTestApi();
    const todayView = api.addTask({ content: "Reply emails" });
    api.addTask({ planDate: "2026-06-25", content: "Review Wednesday notes" });
    const todayTaskId = todayView.tasks[0].id;

    expect(() => api.completeTask("2026-06-25", todayTaskId)).toThrow("does not belong");

    expect(api.getPlanByDate("2026-06-27")!.pendingTasks.map((task) => task.id)).toEqual([todayTaskId]);
    expect(api.getPlanByDate("2026-06-27")!.doneTasks).toHaveLength(0);
    expect(api.getPlanByDate("2026-06-25")!.stats).toEqual({
      total: 1,
      doneCount: 0,
      percentage: 0
    });
  });
  it("updates tasks through the api boundary", () => {
    const api = createTestApi();
    const firstView = api.addTask({ content: "Review notes", category: "study" });
    const taskId = firstView.tasks[0].id;

    const updatedView = api.updateTask({
      planDate: "2026-06-27",
      taskId,
      content: "Review meeting notes",
      category: "work",
      urgency: "urgent"
    });

    expect(updatedView.tasks[0]).toMatchObject({
      id: taskId,
      content: "Review meeting notes",
      category: "work",
      urgency: "urgent",
      status: "pending"
    });
    expect(updatedView.stats).toEqual({ total: 1, doneCount: 0, percentage: 0 });
  });

  it("rejects task updates when the task belongs to another date", () => {
    const api = createTestApi();
    const todayView = api.addTask({ content: "Reply emails" });
    api.addTask({ planDate: "2026-06-25", content: "Review Wednesday notes" });
    const todayTaskId = todayView.tasks[0].id;

    expect(() =>
      api.updateTask({
        planDate: "2026-06-25",
        taskId: todayTaskId,
        content: "Wrong date edit"
      })
    ).toThrow("does not belong");

    expect(api.getPlanByDate("2026-06-27")!.tasks[0].content).toBe("Reply emails");
    expect(api.getPlanByDate("2026-06-25")!.tasks[0].content).toBe("Review Wednesday notes");
  });

  it("deletes tasks through the api boundary", () => {
    const api = createTestApi();
    const firstView = api.addTask({ content: "Reply emails" });
    const secondView = api.addTask({ content: "Review notes", category: "study" });
    const firstTaskId = firstView.tasks[0].id;
    const secondTaskId = secondView.tasks.find((task) => task.content === "Review notes")!.id;

    const view = api.deleteTask("2026-06-27", secondTaskId);

    expect(view.tasks.map((task) => task.id)).toEqual([firstTaskId]);
    expect(view.stats).toEqual({ total: 1, doneCount: 0, percentage: 0 });
    expect(() => api.deleteTask("2026-06-27", secondTaskId)).toThrow("does not belong");
  });

  it("rejects task deletes when the task belongs to another date", () => {
    const api = createTestApi();
    const todayView = api.addTask({ content: "Reply emails" });
    api.addTask({ planDate: "2026-06-25", content: "Review Wednesday notes" });
    const todayTaskId = todayView.tasks[0].id;

    expect(() => api.deleteTask("2026-06-25", todayTaskId)).toThrow("does not belong");

    expect(api.getPlanByDate("2026-06-27")!.tasks.map((task) => task.id)).toEqual([todayTaskId]);
    expect(api.getPlanByDate("2026-06-25")!.stats.total).toBe(1);
  });


  it("reorders tasks through the api boundary", () => {
    const api = createTestApi();
    const firstView = api.addTask({ content: "First" });
    const secondView = api.addTask({ content: "Second" });
    const thirdView = api.addTask({ content: "Third" });
    const firstTaskId = firstView.tasks.find((task) => task.content === "First")!.id;
    const secondTaskId = secondView.tasks.find((task) => task.content === "Second")!.id;
    const thirdTaskId = thirdView.tasks.find((task) => task.content === "Third")!.id;

    const reorderedView = api.reorderTasks({
      planDate: "2026-06-27",
      orderedTaskIds: [secondTaskId, firstTaskId]
    });

    expect(reorderedView.tasks.map((task) => task.id)).toEqual([secondTaskId, firstTaskId, thirdTaskId]);
    expect(() => api.reorderTasks({ planDate: "2026-06-27", orderedTaskIds: [firstTaskId, firstTaskId] })).toThrow("duplicate ids");
    expect(() => api.reorderTasks({ planDate: "2026-06-25", orderedTaskIds: [firstTaskId] })).toThrow("does not exist");
  });
  it("returns recent plan summaries", () => {
    const api = createTestApi();
    const oldView = api.addTask({ planDate: "2026-06-25", content: "Review notes" });
    api.completeTask("2026-06-25", oldView.tasks[0].id);
    api.addTask({ content: "Today plan" });

    expect(api.getRecentPlanSummaries(2)).toEqual([
      expect.objectContaining({ planDate: "2026-06-27", total: 1, doneCount: 0, percentage: 0 }),
      expect.objectContaining({ planDate: "2026-06-25", total: 1, doneCount: 1, percentage: 100, isCompleted: true })
    ]);
  });

  it("can add tasks to an explicit historical plan date", () => {
    const api = createTestApi();

    const view = api.addTask({
      planDate: "2026-06-25",
      content: "Review Wednesday notes",
      category: "study"
    });

    expect(view.plan.planDate).toBe("2026-06-25");
    expect(view.tasks).toHaveLength(1);
    expect(view.tasks[0]).toMatchObject({
      content: "Review Wednesday notes",
      category: "study",
      urgency: "regular",
      status: "pending"
    });
  });
  it("exports weekly plan reports", () => {
    const api = createTestApi();
    const mondayView = api.addTask({ planDate: "2026-06-22", content: "Plan the week" });
    api.completeTask("2026-06-22", mondayView.tasks[0].id);
    api.addTask({ planDate: "2026-06-27", content: "Review progress" });

    const report = api.exportPlanReport({ period: "week", anchorDate: "2026-06-27" });

    expect(report.startDate).toBe("2026-06-22");
    expect(report.endDate).toBe("2026-06-28");
    expect(report.totals).toMatchObject({ planDays: 2, totalTasks: 2, doneTasks: 1, completionRate: 50 });
    expect(report.markdown).toContain("Plan the week");
    expect(report.markdown).toContain("Review progress");
    expect(report.html).toContain("Review progress");
  });

  it("exports Excel-compatible reports for today and all plans", () => {
    const api = createTestApi();
    const oldView = api.addTask({ planDate: "2026-06-22", content: "Plan the week" });
    api.completeTask("2026-06-22", oldView.tasks[0].id);
    api.addTask({ planDate: "2026-06-27", content: "Review progress" });

    const todayReport = api.exportPlanReport({ period: "today", anchorDate: "2026-06-27" });
    const allReport = api.exportPlanReport({ period: "all", anchorDate: "2026-06-27" });

    expect(todayReport.title).toBe("日报 2026-06-27");
    expect(todayReport.excelHtml).toContain("Review progress");
    expect(todayReport.excelHtml).toContain("ProgId");
    expect(allReport.startDate).toBe("2026-06-22");
    expect(allReport.endDate).toBe("2026-06-27");
    expect(allReport.excelHtml).toContain("Plan the week");
    expect(allReport.excelHtml).toContain("习惯影响");
  });

  it("returns habit progress through the api boundary", () => {
    const api = createTestApi();

    const createdView = api.createHabit({ name: "Drink water", frequency: "daily" });
    const habitId = createdView.habits[0].habit.id;

    expect(createdView.habitStats).toMatchObject({ total: 1, checkedCount: 0, percentage: 0 });

    const checkedView = api.checkInHabit({ planDate: "2026-06-27", habitId });
    expect(checkedView.habits[0]).toMatchObject({ isCheckedToday: true, streak: 1 });
    expect(checkedView.habitStats).toMatchObject({ total: 1, checkedCount: 1, percentage: 100 });

    const undoneView = api.undoHabitCheckIn({ planDate: "2026-06-27", habitId });
    expect(undoneView.habits[0]).toMatchObject({ isCheckedToday: false });

    const archivedView = api.archiveHabit({ planDate: "2026-06-27", habitId });
    expect(archivedView.habits).toEqual([]);
  });

});


