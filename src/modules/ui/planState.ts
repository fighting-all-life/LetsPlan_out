import type { DailyPlanView, PlanSummary } from "../api/index.js";
import { DEFAULT_NIGHTLY_SUMMARY_ENABLED, DEFAULT_NIGHTLY_SUMMARY_TIME, evaluateIntervention, evaluateNightlySummary } from "../api/intervention.js";
import { formatPlanDate } from "../api/date.js";
import type { CreateHabitInput, CreateTaskInput, Habit, HabitStats, HabitView, Task, TaskStatus, UpdateTaskInput } from "../database/types.js";

export type HistoryFilter = "all" | "completed" | "unfinished";

export interface HistoryOverview {
  totalPlans: number;
  completionRate: number;
  currentStreak: number;
  bestStreak: number;
}

export interface HistoryHeatmapDay {
  planDate: string;
  percentage: number;
  total: number;
  doneCount: number;
  isCompleted: boolean;
  hasPlan: boolean;
  intensity: 0 | 1 | 2 | 3 | 4;
}

export function normalizePlanView(view: DailyPlanView): DailyPlanView {
  return buildPlanView(view, view.tasks);
}

export function filterHistorySummaries(summaries: PlanSummary[], filter: HistoryFilter): PlanSummary[] {
  if (filter === "completed") {
    return summaries.filter((summary) => summary.isCompleted);
  }
  if (filter === "unfinished") {
    return summaries.filter((summary) => !summary.isCompleted);
  }

  return summaries;
}

export function buildHistoryHeatmapDays(
  summaries: PlanSummary[],
  options: { totalDays?: number; anchorDate?: string } = {}
): HistoryHeatmapDay[] {
  const totalDays = Math.max(7, Math.min(70, Math.trunc(options.totalDays ?? 35)));
  const anchorDate = options.anchorDate ?? getNewestSummaryDate(summaries) ?? new Date().toISOString().slice(0, 10);
  const summaryByDate = new Map(summaries.map((summary) => [summary.planDate, summary]));

  return Array.from({ length: totalDays }, (_item, index) => {
    const planDate = shiftPlanDate(anchorDate, index - totalDays + 1);
    const summary = summaryByDate.get(planDate);

    return {
      planDate,
      percentage: summary?.percentage ?? 0,
      total: summary?.total ?? 0,
      doneCount: summary?.doneCount ?? 0,
      isCompleted: summary?.isCompleted ?? false,
      hasPlan: Boolean(summary),
      intensity: getHistoryIntensity(summary)
    };
  });
}

export function buildHistoryOverview(summaries: PlanSummary[]): HistoryOverview {
  const totalPlans = summaries.length;
  if (totalPlans === 0) {
    return {
      totalPlans: 0,
      completionRate: 0,
      currentStreak: 0,
      bestStreak: 0
    };
  }

  const completedPlans = summaries.filter((summary) => summary.isCompleted).length;
  const orderedSummaries = [...summaries].sort((first, second) => first.planDate.localeCompare(second.planDate));
  let bestStreak = 0;
  let runningStreak = 0;
  let previousDate: string | null = null;

  for (const summary of orderedSummaries) {
    const isConsecutive = previousDate === null || shiftPlanDate(previousDate, 1) === summary.planDate;
    runningStreak = summary.isCompleted ? (isConsecutive ? runningStreak + 1 : 1) : 0;
    bestStreak = Math.max(bestStreak, runningStreak);
    previousDate = summary.planDate;
  }

  const newestFirstSummaries = [...summaries].sort((first, second) => second.planDate.localeCompare(first.planDate));
  let currentStreak = 0;
  let expectedDate: string | null = null;

  for (const summary of newestFirstSummaries) {
    if (!summary.isCompleted || (expectedDate !== null && summary.planDate !== expectedDate)) {
      break;
    }

    currentStreak += 1;
    expectedDate = shiftPlanDate(summary.planDate, -1);
  }

  return {
    totalPlans,
    completionRate: Math.round((completedPlans / totalPlans) * 100),
    currentStreak,
    bestStreak
  };
}

export function shouldTriggerCompletionCelebration(previousIsCompleted: boolean, nextIsCompleted: boolean): boolean {
  return !previousIsCompleted && nextIsCompleted;
}

export function createEmptyPlanView(planDate: string): DailyPlanView {
  return buildPlanView(
    {
      plan: {
        id: 0,
        planDate,
        createdAt: `${planDate} 00:00:00`,
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
      habitStats: buildHabitStats([]),
      intervention: evaluateIntervention({ now: new Date(), pendingTasks: [], doneTasks: [], habitStats: buildHabitStats([]), isCompleted: false }),
      nightlySummary: evaluateNightlySummary({ now: new Date(), planDate, pendingTasks: [], doneTasks: [], todayDate: formatPlanDate(new Date()) })
    },
    []
  );
}

export function shiftPlanDate(planDate: string, offsetDays: number): string {
  const [year, month, day] = planDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + offsetDays));

  return date.toISOString().slice(0, 10);
}

export function addTaskToView(view: DailyPlanView, input: CreateTaskInput, now = new Date()): DailyPlanView {
  const content = input.content.trim();
  if (!content) {
    return normalizePlanView(view);
  }

  const nextId = Math.max(0, ...view.tasks.map((task) => task.id)) + 1;
  const urgency = input.urgency ?? "regular";
  const firstRegularOrder = Math.min(
    Number.POSITIVE_INFINITY,
    ...view.tasks.filter((task) => task.urgency !== "urgent").map((task) => task.sortOrder)
  );
  const shouldInsertBeforeRegular = urgency === "urgent" && Number.isFinite(firstRegularOrder);
  const nextSortOrder = shouldInsertBeforeRegular
    ? firstRegularOrder
    : Math.max(-1, ...view.tasks.map((task) => task.sortOrder)) + 1;
  const existingTasks = shouldInsertBeforeRegular
    ? view.tasks.map((task) => (task.sortOrder >= nextSortOrder ? { ...task, sortOrder: task.sortOrder + 1 } : task))
    : view.tasks;
  const timestamp = now.toISOString();

  const task: Task = {
    id: nextId,
    planId: view.plan.id,
    content,
    urgency,
    category: input.category ?? "work",
    status: "pending",
    sortOrder: nextSortOrder,
    createdAt: timestamp,
    completedAt: null
  };

  return buildPlanView(view, [...existingTasks, task], now);
}

export function addHabitToView(view: DailyPlanView, input: CreateHabitInput, now = new Date()): DailyPlanView {
  const name = input.name.trim();
  if (!name) {
    return normalizePlanView(view);
  }

  const nextId = Math.max(0, ...view.habits.map((item) => item.habit.id)) + 1;
  const habit: Habit = {
    id: nextId,
    name,
    frequency: input.frequency ?? "daily",
    customIntervalDays: input.frequency === "custom" ? input.customIntervalDays ?? 3 : null,
    status: "active",
    createdAt: now.toISOString(),
    archivedAt: null
  };

  return buildPlanView({ ...view, habits: [...view.habits, buildHabitView(habit, false, 0, null)] }, view.tasks, now);
}

export function setHabitCheckedInView(view: DailyPlanView, habitId: number, checked: boolean, now = new Date()): DailyPlanView {
  const habits = view.habits.map((item) => {
    if (item.habit.id !== habitId) {
      return item;
    }

    return buildHabitView(
      item.habit,
      checked,
      checked ? Math.max(1, item.streak + (item.isCheckedToday ? 0 : 1)) : Math.max(0, item.streak - 1),
      checked ? view.plan.planDate : item.lastCheckedDate === view.plan.planDate ? null : item.lastCheckedDate
    );
  });

  return buildPlanView({ ...view, habits }, view.tasks, now);
}

export function archiveHabitInView(view: DailyPlanView, habitId: number, now = new Date()): DailyPlanView {
  return buildPlanView(
    {
      ...view,
      habits: view.habits.filter((item) => item.habit.id !== habitId)
    },
    view.tasks,
    now
  );
}

export function setTaskStatusInView(
  view: DailyPlanView,
  taskId: number,
  status: TaskStatus,
  now = new Date()
): DailyPlanView {
  const timestamp = now.toISOString();
  const tasks = view.tasks.map((task) => {
    if (task.id !== taskId) {
      return task;
    }

    return {
      ...task,
      status,
      completedAt: status === "done" ? task.completedAt ?? timestamp : null
    };
  });

  return buildPlanView(view, tasks, now);
}

export function removeTaskFromView(view: DailyPlanView, taskId: number, now = new Date()): DailyPlanView {
  return buildPlanView(
    view,
    view.tasks.filter((task) => task.id !== taskId),
    now
  );
}

export function reorderTasksInView(view: DailyPlanView, orderedTaskIds: number[], now = new Date()): DailyPlanView {
  const orderedIds = new Set(orderedTaskIds);
  if (orderedIds.size !== orderedTaskIds.length) {
    return normalizePlanView(view);
  }

  const tasksById = new Map(view.tasks.map((task) => [task.id, task]));
  if (orderedTaskIds.some((taskId) => !tasksById.has(taskId))) {
    return normalizePlanView(view);
  }

  const remainingTaskIds = [...view.tasks]
    .sort(compareTasks)
    .filter((task) => !orderedIds.has(task.id))
    .map((task) => task.id);
  const nextOrderById = new Map([...orderedTaskIds, ...remainingTaskIds].map((taskId, index) => [taskId, index]));
  const reorderedTasks = view.tasks.map((task) => ({
    ...task,
    sortOrder: nextOrderById.get(task.id) ?? task.sortOrder
  }));

  return buildPlanView(view, reorderedTasks, now);
}

export function moveTaskId(orderedTaskIds: number[], sourceTaskId: number, targetTaskId: number): number[] {
  if (sourceTaskId === targetTaskId) {
    return orderedTaskIds;
  }

  const sourceIndex = orderedTaskIds.indexOf(sourceTaskId);
  const targetIndex = orderedTaskIds.indexOf(targetTaskId);
  if (sourceIndex < 0 || targetIndex < 0) {
    return orderedTaskIds;
  }

  const nextTaskIds = [...orderedTaskIds];
  const [movedTaskId] = nextTaskIds.splice(sourceIndex, 1);
  nextTaskIds.splice(targetIndex, 0, movedTaskId);

  return nextTaskIds;
}

export function updateTaskInView(view: DailyPlanView, taskId: number, input: UpdateTaskInput, now = new Date()): DailyPlanView {
  const content = input.content?.trim();
  if (input.content !== undefined && !content) {
    return normalizePlanView(view);
  }

  const tasks = view.tasks.map((task) => {
    if (task.id !== taskId) {
      return task;
    }

    return {
      ...task,
      content: content ?? task.content,
      urgency: input.urgency ?? task.urgency,
      category: input.category ?? task.category
    };
  });

  return buildPlanView(view, tasks, now);
}

function getNewestSummaryDate(summaries: PlanSummary[]): string | null {
  if (summaries.length === 0) {
    return null;
  }

  return [...summaries].sort((first, second) => second.planDate.localeCompare(first.planDate))[0].planDate;
}

function getHistoryIntensity(summary: PlanSummary | undefined): 0 | 1 | 2 | 3 | 4 {
  if (!summary || summary.total === 0 || summary.percentage <= 0) {
    return 0;
  }
  if (summary.percentage >= 100) {
    return 4;
  }
  if (summary.percentage >= 66) {
    return 3;
  }
  if (summary.percentage >= 33) {
    return 2;
  }

  return 1;
}

function buildPlanView(view: DailyPlanView, tasks: Task[], now = new Date()): DailyPlanView {
  const sortedTasks = [...tasks].sort(compareTasks);
  const pendingTasks = sortedTasks.filter((task) => task.status === "pending");
  const doneTasks = sortedTasks.filter((task) => task.status === "done");
  const total = sortedTasks.length;
  const doneCount = doneTasks.length;
  const isCompleted = total > 0 && doneCount === total;
  const habits = view.habits ?? [];
  const habitStats = buildHabitStats(habits);

  return {
    plan: {
      ...view.plan,
      completedAt: isCompleted ? view.plan.completedAt ?? now.toISOString() : null
    },
    tasks: sortedTasks,
    pendingTasks,
    doneTasks,
    stats: {
      total,
      doneCount,
      percentage: total === 0 ? 0 : Math.round((doneCount / total) * 100)
    },
    isCompleted,
    habits,
    habitStats,
    intervention: evaluateIntervention({ now, pendingTasks, doneTasks, habitStats, isCompleted }),
    nightlySummary: evaluateNightlySummary({
      now,
      planDate: view.plan.planDate,
      pendingTasks,
      doneTasks,
      enabled: DEFAULT_NIGHTLY_SUMMARY_ENABLED,
      summaryTime: DEFAULT_NIGHTLY_SUMMARY_TIME,
      todayDate: formatPlanDate(now)
    })
  };
}

function buildHabitStats(habits: HabitView[]): HabitStats {
  const total = habits.length;
  const checkedCount = habits.filter((item) => item.isCheckedToday).length;

  return {
    total,
    checkedCount,
    percentage: total === 0 ? 0 : Math.round((checkedCount / total) * 100),
    brokenCount: habits.filter((item) => item.isBroken).length,
    recoverableCount: habits.filter((item) => item.canRecover).length
  };
}

function buildHabitView(habit: Habit, isCheckedToday: boolean, streak: number, lastCheckedDate: string | null): HabitView {
  return {
    habit,
    isCheckedToday,
    streak,
    lastCheckedDate,
    isBroken: false,
    canRecover: !isCheckedToday && lastCheckedDate !== null
  };
}

function compareTasks(first: Task, second: Task): number {
  if (first.sortOrder !== second.sortOrder) {
    return first.sortOrder - second.sortOrder;
  }

  if (first.urgency !== second.urgency) {
    return first.urgency === "urgent" ? -1 : 1;
  }

  return first.id - second.id;
}
