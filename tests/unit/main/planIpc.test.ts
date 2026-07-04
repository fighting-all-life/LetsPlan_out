import type { IpcMainInvokeEvent } from "electron";
import { describe, expect, it } from "vitest";
import type { DailyPlanView } from "../../../src/modules/api/index.js";
import { PLAN_IPC_CHANNELS } from "../../../src/main/ipcChannels.js";
import type { IpcMainLike, PlanApiLike } from "../../../src/main/planIpc.js";
import { registerPlanIpcHandlers } from "../../../src/main/planIpc.js";

class FakeIpcMain implements IpcMainLike {
  readonly handlers = new Map<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown>();

  handle(channel: string, listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown): void {
    this.handlers.set(channel, listener);
  }

  removeHandler(channel: string): void {
    this.handlers.delete(channel);
  }

  invoke(channel: string, ...args: unknown[]): unknown {
    const handler = this.handlers.get(channel);
    if (!handler) {
      throw new Error(`No handler registered for ${channel}.`);
    }

    return handler({} as IpcMainInvokeEvent, ...args);
  }
}

function createPlanView(planDate = "2026-06-27"): DailyPlanView {
  return {
    plan: {
      id: 1,
      planDate,
      createdAt: "2026-06-27 08:00:00",
      completedAt: null
    },
    tasks: [],
    pendingTasks: [],
    doneTasks: [],
    stats: {
      total: 0,
      doneCount: 0,
      percentage: 0
    },
    isCompleted: false,
    habits: [],
    habitStats: {
      total: 0,
      checkedCount: 0,
      percentage: 0,
      brokenCount: 0,
      recoverableCount: 0
    },
    intervention: {
      level: "none",
      reason: "none",
      idleMinutes: 0,
      message: "",
      canSnooze: false,
      action: "none"
    },
    nightlySummary: {
      shouldShow: false,
      planDate,
      summaryTime: "21:30",
      total: 0,
      doneCount: 0,
      pendingCount: 0,
      pendingTasks: [],
      message: ""
    },
    agentInsight: {
      risk: "watch",
      focus: "plan",
      score: 0,
      headline: "Fixture insight",
      nextAction: "Fixture next action",
      reason: "Fixture reason",
      signals: []
    }  };
}

function createFakeApi(): PlanApiLike & { calls: string[] } {
  const calls: string[] = [];

  return {
    calls,
    getTodayPlan() {
      calls.push("getTodayPlan");
      return createPlanView();
    },
    getPlanByDate(planDate: string) {
      calls.push(`getPlanByDate:${planDate}`);
      return createPlanView(planDate);
    },
    getRecentPlanSummaries(limit = 30) {
      calls.push(`getRecentPlanSummaries:${limit}`);
      return [];
    },
    getOrCreatePlanByDate(planDate: string) {
      calls.push(`getOrCreatePlanByDate:${planDate}`);
      return createPlanView(planDate);
    },
    addTask(request) {
      calls.push(`addTask:${request.content}`);
      return createPlanView(request.planDate);
    },
    setTaskStatus(request) {
      calls.push(`setTaskStatus:${request.planDate}:${request.taskId}:${request.status}`);
      return createPlanView(request.planDate);
    },
    completeTask(planDate: string, taskId: number) {
      calls.push(`completeTask:${planDate}:${taskId}`);
      return createPlanView(planDate);
    },
    reopenTask(planDate: string, taskId: number) {
      calls.push(`reopenTask:${planDate}:${taskId}`);
      return createPlanView(planDate);
    },
    updateTask(request) {
      calls.push(`updateTask:${request.planDate}:${request.taskId}:${request.content}:${request.urgency ?? "default"}:${request.category ?? "default"}`);
      return createPlanView(request.planDate);
    },
    reorderTasks(request) {
      calls.push(`reorderTasks:${request.planDate}:${request.orderedTaskIds.join(",")}`);
      return createPlanView(request.planDate);
    },
    deleteTask(planDate: string, taskId: number) {
      calls.push(`deleteTask:${planDate}:${taskId}`);
      return createPlanView(planDate);
    },
    createHabit(request) {
      calls.push(`createHabit:${request.planDate ?? "today"}:${request.name}:${request.frequency ?? "daily"}:${request.customIntervalDays ?? "none"}`);
      return createPlanView(request.planDate);
    },
    updateHabit(request) {
      calls.push(`updateHabit:${request.planDate}:${request.habitId}:${request.name ?? "default"}`);
      return createPlanView(request.planDate);
    },
    archiveHabit(request) {
      calls.push(`archiveHabit:${request.planDate}:${request.habitId}:${request.status ?? "archived"}`);
      return createPlanView(request.planDate);
    },
    checkInHabit(request) {
      calls.push(`checkInHabit:${request.planDate}:${request.habitId}`);
      return createPlanView(request.planDate);
    },
    undoHabitCheckIn(request) {
      calls.push(`undoHabitCheckIn:${request.planDate}:${request.habitId}`);
      return createPlanView(request.planDate);
    }
  };
}

describe("registerPlanIpcHandlers", () => {
  it("registers and disposes all plan channels", () => {
    const ipcMain = new FakeIpcMain();
    const api = createFakeApi();

    const registration = registerPlanIpcHandlers(ipcMain, api);

    expect([...ipcMain.handlers.keys()].sort()).toEqual(Object.values(PLAN_IPC_CHANNELS).sort());

    registration.dispose();

    expect(ipcMain.handlers.size).toBe(0);
  });

  it("routes renderer requests to the plan api", () => {
    const ipcMain = new FakeIpcMain();
    const api = createFakeApi();

    registerPlanIpcHandlers(ipcMain, api);

    expect(ipcMain.invoke(PLAN_IPC_CHANNELS.getTodayPlan)).toMatchObject({
      plan: { planDate: "2026-06-27" }
    });
    expect(ipcMain.invoke(PLAN_IPC_CHANNELS.getPlanByDate, "2026-06-25")).toMatchObject({
      plan: { planDate: "2026-06-25" }
    });
    expect(ipcMain.invoke(PLAN_IPC_CHANNELS.getRecentPlanSummaries, 5)).toEqual([]);
    expect(
      ipcMain.invoke(PLAN_IPC_CHANNELS.addTask, {
        planDate: "2026-06-25",
        content: "Review notes",
        urgency: "urgent",
        category: "study"
      })
    ).toMatchObject({
      plan: { planDate: "2026-06-25" }
    });
    expect(ipcMain.invoke(PLAN_IPC_CHANNELS.completeTask, "2026-06-25", 9)).toMatchObject({
      plan: { planDate: "2026-06-25" }
    });
    expect(
      ipcMain.invoke(PLAN_IPC_CHANNELS.updateTask, {
        planDate: "2026-06-25",
        taskId: 9,
        content: "Edited notes",
        urgency: "regular",
        category: "work"
      })
    ).toMatchObject({
      plan: { planDate: "2026-06-25" }
    });
    expect(
      ipcMain.invoke(PLAN_IPC_CHANNELS.reorderTasks, {
        planDate: "2026-06-25",
        orderedTaskIds: [2, 1]
      })
    ).toMatchObject({
      plan: { planDate: "2026-06-25" }
    });
    expect(ipcMain.invoke(PLAN_IPC_CHANNELS.deleteTask, "2026-06-25", 9)).toMatchObject({
      plan: { planDate: "2026-06-25" }
    });
    expect(
      ipcMain.invoke(PLAN_IPC_CHANNELS.createHabit, {
        planDate: "2026-06-25",
        name: "Drink water",
        frequency: "custom",
        customIntervalDays: 3
      })
    ).toMatchObject({
      plan: { planDate: "2026-06-25" }
    });
    expect(ipcMain.invoke(PLAN_IPC_CHANNELS.checkInHabit, { planDate: "2026-06-25", habitId: 7 })).toMatchObject({
      plan: { planDate: "2026-06-25" }
    });
    expect(ipcMain.invoke(PLAN_IPC_CHANNELS.undoHabitCheckIn, { planDate: "2026-06-25", habitId: 7 })).toMatchObject({
      plan: { planDate: "2026-06-25" }
    });
    expect(ipcMain.invoke(PLAN_IPC_CHANNELS.archiveHabit, { planDate: "2026-06-25", habitId: 7 })).toMatchObject({
      plan: { planDate: "2026-06-25" }
    });

    expect(api.calls).toEqual([
      "getTodayPlan",
      "getPlanByDate:2026-06-25",
      "getRecentPlanSummaries:5",
      "addTask:Review notes",
      "completeTask:2026-06-25:9",
      "updateTask:2026-06-25:9:Edited notes:regular:work",
      "reorderTasks:2026-06-25:2,1",
      "deleteTask:2026-06-25:9",
      "createHabit:2026-06-25:Drink water:custom:3",
      "checkInHabit:2026-06-25:7",
      "undoHabitCheckIn:2026-06-25:7",
      "archiveHabit:2026-06-25:7:archived"
    ]);
  });

  it("notifies when plan views are returned", () => {
    const ipcMain = new FakeIpcMain();
    const api = createFakeApi();
    const notifiedEvents: Array<{ planDate: string; kind: string }> = [];

    registerPlanIpcHandlers(ipcMain, api, {
      onPlanViewChanged: (view, kind) => notifiedEvents.push({ planDate: view.plan.planDate, kind })
    });

    ipcMain.invoke(PLAN_IPC_CHANNELS.getTodayPlan);
    ipcMain.invoke(PLAN_IPC_CHANNELS.getPlanByDate, "2026-06-25");
    ipcMain.invoke(PLAN_IPC_CHANNELS.getRecentPlanSummaries, 5);
    ipcMain.invoke(PLAN_IPC_CHANNELS.addTask, {
      planDate: "2026-06-24",
      content: "Review tray progress"
    });
    ipcMain.invoke(PLAN_IPC_CHANNELS.completeTask, "2026-06-24", 9);
    ipcMain.invoke(PLAN_IPC_CHANNELS.checkInHabit, { planDate: "2026-06-24", habitId: 7 });

    expect(notifiedEvents).toEqual([
      { planDate: "2026-06-27", kind: "sync" },
      { planDate: "2026-06-25", kind: "sync" },
      { planDate: "2026-06-24", kind: "task-update" },
      { planDate: "2026-06-24", kind: "progress-update" },
      { planDate: "2026-06-24", kind: "habit-update" }
    ]);
  });
  it("rejects malformed renderer requests before they reach the api", () => {
    const ipcMain = new FakeIpcMain();
    const api = createFakeApi();

    registerPlanIpcHandlers(ipcMain, api);

    expect(() => ipcMain.invoke(PLAN_IPC_CHANNELS.addTask, { content: 42 })).toThrow("content must be a string");
    expect(() =>
      ipcMain.invoke(PLAN_IPC_CHANNELS.setTaskStatus, {
        planDate: "2026-06-27",
        taskId: Number.NaN,
        status: "done"
      })
    ).toThrow("taskId must be a finite number");
    expect(() =>
      ipcMain.invoke(PLAN_IPC_CHANNELS.updateTask, {
        planDate: "2026-06-27",
        taskId: 1,
        content: 42
      })
    ).toThrow("content must be a string");
    expect(() =>
      ipcMain.invoke(PLAN_IPC_CHANNELS.reorderTasks, {
        planDate: "2026-06-27",
        orderedTaskIds: [1, Number.NaN]
      })
    ).toThrow("orderedTaskIds[1] must be a finite number");
    expect(() => ipcMain.invoke(PLAN_IPC_CHANNELS.deleteTask, "2026-06-27", Number.NaN)).toThrow(
      "taskId must be a finite number"
    );
    expect(() => ipcMain.invoke(PLAN_IPC_CHANNELS.createHabit, { name: 42 })).toThrow("name must be a string");
    expect(() => ipcMain.invoke(PLAN_IPC_CHANNELS.checkInHabit, { planDate: "2026-06-27", habitId: Number.NaN })).toThrow(
      "habitId must be a finite number"
    );
    expect(api.calls).toEqual([]);
  });
});



