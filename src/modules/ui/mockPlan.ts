import type { DailyPlanView } from "../api/index.js";
import { buildAgentInsight } from "../api/agentInsight.js";
import { evaluateIntervention, evaluateNightlySummary } from "../api/intervention.js";

const habits: DailyPlanView["habits"] = [
  {
    habit: {
      id: 1,
      name: "晨间复盘",
      frequency: "daily",
      customIntervalDays: null,
      status: "active",
      createdAt: "2026-06-20 08:00:00",
      archivedAt: null
    },
    isCheckedToday: true,
    streak: 4,
    lastCheckedDate: "2026-06-27",
    isBroken: false,
    canRecover: false
  },
  {
    habit: {
      id: 2,
      name: "整理学习笔记",
      frequency: "weekly",
      customIntervalDays: null,
      status: "active",
      createdAt: "2026-06-21 08:00:00",
      archivedAt: null
    },
    isCheckedToday: false,
    streak: 1,
    lastCheckedDate: "2026-06-24",
    isBroken: false,
    canRecover: true
  }
];

const habitStats: DailyPlanView["habitStats"] = {
  total: habits.length,
  checkedCount: habits.filter((item) => item.isCheckedToday).length,
  percentage: 50,
  brokenCount: 0,
  recoverableCount: 1
};

export const mockDailyPlan: DailyPlanView = {
  plan: {
    id: 1,
    planDate: "2026-06-27",
    createdAt: "2026-06-27 08:05:00",
    completedAt: null
  },
  tasks: [
    {
      id: 1,
      planId: 1,
      content: "完成 Q2 报告终稿",
      urgency: "urgent",
      category: "work",
      status: "pending",
      sortOrder: 0,
      createdAt: "2026-06-27 08:10:00",
      completedAt: null
    },
    {
      id: 2,
      planId: 1,
      content: "阅读第 5 章并整理笔记",
      urgency: "regular",
      category: "study",
      status: "pending",
      sortOrder: 1,
      createdAt: "2026-06-27 08:20:00",
      completedAt: null
    },
    {
      id: 3,
      planId: 1,
      content: "回复上午积压邮件",
      urgency: "regular",
      category: "work",
      status: "done",
      sortOrder: 2,
      createdAt: "2026-06-27 08:30:00",
      completedAt: "2026-06-27 09:15:00"
    }
  ],
  pendingTasks: [],
  doneTasks: [],
  stats: {
    total: 3,
    doneCount: 1,
    percentage: 33
  },
  isCompleted: false,
  habits,
  habitStats,
  intervention: evaluateIntervention({
    now: new Date("2026-06-27T12:00:00.000Z"),
    pendingTasks: [],
    doneTasks: [],
    habitStats,
    isCompleted: false
  }),
  nightlySummary: evaluateNightlySummary({
    now: new Date("2026-06-27T12:00:00.000Z"),
    planDate: "2026-06-27",
    pendingTasks: [],
    doneTasks: [],
    todayDate: "2026-06-27"
  }),
  agentInsight: buildAgentInsight({
    pendingTasks: [],
    doneTasks: [],
    habitStats,
    intervention: evaluateIntervention({
      now: new Date("2026-06-27T12:00:00.000Z"),
      pendingTasks: [],
      doneTasks: [],
      habitStats,
      isCompleted: false
    }),
    isCompleted: false
  })
};
