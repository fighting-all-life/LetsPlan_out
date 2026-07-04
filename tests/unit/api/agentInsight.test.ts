import { describe, expect, it } from "vitest";
import { buildAgentInsight } from "../../../src/modules/api/agentInsight.js";
import type { InterventionSnapshot } from "../../../src/modules/api/intervention.js";
import type { HabitStats, Task } from "../../../src/modules/database/types.js";

const emptyHabitStats: HabitStats = {
  total: 0,
  checkedCount: 0,
  percentage: 0,
  brokenCount: 0,
  recoverableCount: 0
};

const noIntervention: InterventionSnapshot = {
  level: "none",
  reason: "none",
  action: "none",
  idleMinutes: 0,
  message: "",
  canSnooze: false
};

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: overrides.id ?? 1,
    planId: overrides.planId ?? 1,
    content: overrides.content ?? "整理计划",
    urgency: overrides.urgency ?? "regular",
    category: overrides.category ?? "work",
    status: overrides.status ?? "pending",
    sortOrder: overrides.sortOrder ?? 0,
    createdAt: overrides.createdAt ?? "2026-07-04T08:00:00.000Z",
    completedAt: overrides.completedAt ?? null
  };
}

describe("buildAgentInsight", () => {
  it("guides the user to create a first small task when the day is empty", () => {
    expect(
      buildAgentInsight({
        pendingTasks: [],
        doneTasks: [],
        habitStats: emptyHabitStats,
        intervention: noIntervention,
        isCompleted: false
      })
    ).toMatchObject({
      risk: "watch",
      focus: "plan",
      nextAction: "先写下一个最小任务，控制在 5 分钟内能启动"
    });
  });

  it("prioritizes urgent pending tasks", () => {
    const insight = buildAgentInsight({
      pendingTasks: [
        createTask({ id: 1, content: "普通整理", sortOrder: 1 }),
        createTask({ id: 2, content: "提交发布包", urgency: "urgent", sortOrder: 2 })
      ],
      doneTasks: [],
      habitStats: emptyHabitStats,
      intervention: noIntervention,
      isCompleted: false
    });

    expect(insight).toMatchObject({
      risk: "risk",
      focus: "urgent",
      nextAction: "先推进：提交发布包"
    });
    expect(insight.signals).toContain("紧急待办 1 个");
  });

  it("enters recovery mode for L4 intervention", () => {
    const insight = buildAgentInsight({
      pendingTasks: [createTask({ content: "复盘报告" })],
      doneTasks: [],
      habitStats: emptyHabitStats,
      intervention: { ...noIntervention, level: "l4", action: "force-animation", idleMinutes: 40, message: "快去学习！" },
      isCompleted: false
    });

    expect(insight).toMatchObject({
      risk: "blocked",
      focus: "recover",
      nextAction: "只做一步：复盘报告"
    });
    expect(insight.signals).toContain("干预等级 L4");
  });

  it("marks completed days as clear", () => {
    expect(
      buildAgentInsight({
        pendingTasks: [],
        doneTasks: [createTask({ status: "done", completedAt: "2026-07-04T09:00:00.000Z" })],
        habitStats: { ...emptyHabitStats, total: 1, checkedCount: 1, percentage: 100 },
        intervention: noIntervention,
        isCompleted: true
      })
    ).toMatchObject({ risk: "clear", focus: "complete", score: 100 });
  });
});