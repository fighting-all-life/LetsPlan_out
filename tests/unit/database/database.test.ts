import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LetsPlanDatabase } from "../../../src/modules/database/index.js";

const temporaryDirectories: string[] = [];

function createTestDatabase(): LetsPlanDatabase {
  const directory = mkdtempSync(join(tmpdir(), "letsplan-db-"));
  temporaryDirectories.push(directory);
  return new LetsPlanDatabase(join(directory, "data.db"));
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe("LetsPlanDatabase", () => {
  it("creates one daily plan per date", () => {
    const database = createTestDatabase();

    const first = database.getOrCreatePlan("2026-06-27");
    const second = database.getOrCreatePlan("2026-06-27");

    expect(second.id).toBe(first.id);
    expect(second.planDate).toBe("2026-06-27");
    expect(second.completedAt).toBeNull();

    database.close();
  });

  it("adds tasks and lists urgent tasks before regular tasks", () => {
    const database = createTestDatabase();

    database.addTask("2026-06-27", {
      content: "Read chapter 5",
      category: "study",
      urgency: "regular"
    });
    database.addTask("2026-06-27", {
      content: "Finish Q2 report",
      category: "work",
      urgency: "urgent"
    });

    const planWithTasks = database.getPlanWithTasks("2026-06-27");
    const stats = database.getPlanStats(planWithTasks.plan.id);

    expect(planWithTasks.tasks.map((task) => task.content)).toEqual([
      "Finish Q2 report",
      "Read chapter 5"
    ]);
    expect(stats).toEqual({
      total: 2,
      doneCount: 0,
      percentage: 0
    });

    database.close();
  });

  it("updates task progress and daily plan completion time", () => {
    const database = createTestDatabase();

    const firstTask = database.addTask("2026-06-27", { content: "Reply emails" });
    const secondTask = database.addTask("2026-06-27", { content: "Review notes", category: "study" });
    const plan = database.getPlan("2026-06-27");

    expect(plan).not.toBeNull();
    expect(database.getPlanStats(plan!.id).percentage).toBe(0);

    database.setTaskStatus(firstTask.id, "done");
    expect(database.getPlanStats(plan!.id)).toMatchObject({
      total: 2,
      doneCount: 1,
      percentage: 50
    });
    expect(database.getPlan("2026-06-27")!.completedAt).toBeNull();

    database.setTaskStatus(secondTask.id, "done");
    expect(database.getPlanStats(plan!.id).percentage).toBe(100);
    expect(database.getPlan("2026-06-27")!.completedAt).not.toBeNull();

    database.setTaskStatus(firstTask.id, "pending");
    expect(database.getPlanStats(plan!.id).percentage).toBe(50);
    expect(database.getPlan("2026-06-27")!.completedAt).toBeNull();

    database.close();
  });
  it("updates task content and attributes without changing completion", () => {
    const database = createTestDatabase();

    const task = database.addTask("2026-06-27", {
      content: "Review notes",
      category: "study",
      urgency: "regular"
    });
    database.setTaskStatus(task.id, "done");

    const updatedTask = database.updateTask(task.id, {
      content: "Review meeting notes",
      category: "work",
      urgency: "urgent"
    });

    expect(updatedTask).toMatchObject({
      id: task.id,
      content: "Review meeting notes",
      category: "work",
      urgency: "urgent",
      status: "done"
    });
    expect(updatedTask.completedAt).not.toBeNull();
    expect(database.getPlan("2026-06-27")!.completedAt).not.toBeNull();
    expect(() => database.updateTask(task.id, { content: "   " })).toThrow("content is required");

    database.close();
  });

  it("deletes tasks and recalculates plan completion", () => {
    const database = createTestDatabase();

    const firstTask = database.addTask("2026-06-27", { content: "Reply emails" });
    const secondTask = database.addTask("2026-06-27", { content: "Review notes", category: "study" });
    const plan = database.getPlan("2026-06-27");

    database.setTaskStatus(firstTask.id, "done");
    database.setTaskStatus(secondTask.id, "done");
    expect(database.getPlan("2026-06-27")!.completedAt).not.toBeNull();

    const deletedTask = database.deleteTask(secondTask.id);

    expect(deletedTask.id).toBe(secondTask.id);
    expect(database.listTasks(plan!.id).map((task) => task.id)).toEqual([firstTask.id]);
    expect(database.getPlanStats(plan!.id)).toEqual({ total: 1, doneCount: 1, percentage: 100 });
    expect(database.getPlan("2026-06-27")!.completedAt).not.toBeNull();

    database.deleteTask(firstTask.id);

    expect(database.listTasks(plan!.id)).toEqual([]);
    expect(database.getPlanStats(plan!.id)).toEqual({ total: 0, doneCount: 0, percentage: 0 });
    expect(database.getPlan("2026-06-27")!.completedAt).toBeNull();
    expect(() => database.deleteTask(firstTask.id)).toThrow("does not exist");

    database.close();
  });


  it("reorders tasks within a plan", () => {
    const database = createTestDatabase();

    const firstTask = database.addTask("2026-06-27", { content: "First" });
    const secondTask = database.addTask("2026-06-27", { content: "Second" });
    const thirdTask = database.addTask("2026-06-27", { content: "Third" });
    const otherPlanTask = database.addTask("2026-06-26", { content: "Other day" });
    const plan = database.getPlan("2026-06-27")!;

    const reorderedTasks = database.reorderTasks(plan.id, [secondTask.id, firstTask.id]);

    expect(reorderedTasks.map((task) => task.id)).toEqual([secondTask.id, firstTask.id, thirdTask.id]);
    expect(() => database.reorderTasks(plan.id, [firstTask.id, firstTask.id])).toThrow("duplicate ids");
    expect(() => database.reorderTasks(plan.id, [otherPlanTask.id])).toThrow("outside the plan");

    database.close();
  });
  it("lists recent plan summaries", () => {
    const database = createTestDatabase();

    const first = database.addTask("2026-06-26", { content: "Review notes" });
    database.setTaskStatus(first.id, "done");
    database.addTask("2026-06-27", { content: "Plan day" });

    expect(database.listPlanSummaries(2)).toEqual([
      { planDate: "2026-06-27", completedAt: null, total: 1, doneCount: 0, percentage: 0, isCompleted: false },
      expect.objectContaining({ planDate: "2026-06-26", total: 1, doneCount: 1, percentage: 100, isCompleted: true })
    ]);

    database.close();
  });

  it("rejects empty task content and invalid dates", () => {
    const database = createTestDatabase();

    expect(() => database.getOrCreatePlan("2026/06/27")).toThrow("YYYY-MM-DD");
    expect(() => database.addTask("2026-06-27", { content: "   " })).toThrow("content is required");

    database.close();
  });

  it("tracks habit check-ins, streaks, recovery and archive state", () => {
    const database = createTestDatabase();

    const dailyHabit = database.createHabit({ name: "Drink water" });
    const weeklyHabit = database.createHabit({ name: "Weekly review", frequency: "weekly" });
    const customHabit = database.createHabit({ name: "Stretch", frequency: "custom", customIntervalDays: 3 });

    database.checkInHabit(dailyHabit.id, "2026-06-25");
    database.checkInHabit(dailyHabit.id, "2026-06-26");
    database.checkInHabit(weeklyHabit.id, "2026-06-24");
    database.checkInHabit(customHabit.id, "2026-06-25");

    const recoveryView = database.getHabitProgress("2026-06-27");
    const dailyRecovery = recoveryView.find((item) => item.habit.id === dailyHabit.id)!;
    expect(dailyRecovery).toMatchObject({ isCheckedToday: false, streak: 2, isBroken: false, canRecover: true });
    expect(recoveryView.find((item) => item.habit.id === weeklyHabit.id)).toMatchObject({ isCheckedToday: true, streak: 1 });

    database.checkInHabit(dailyHabit.id, "2026-06-27");
    expect(database.getHabitProgress("2026-06-27").find((item) => item.habit.id === dailyHabit.id)).toMatchObject({
      isCheckedToday: true,
      streak: 3,
      canRecover: false
    });

    database.undoHabitCheckIn(dailyHabit.id, "2026-06-27");
    expect(database.getHabitProgress("2026-06-29").find((item) => item.habit.id === dailyHabit.id)).toMatchObject({
      isBroken: true,
      canRecover: false
    });
    expect(database.getHabitStats("2026-06-27")).toMatchObject({ total: 3, checkedCount: 1, recoverableCount: 2 });

    database.archiveHabit(dailyHabit.id);
    expect(database.listHabits().map((habit) => habit.id)).toEqual([weeklyHabit.id, customHabit.id]);

    database.close();
  });

});


