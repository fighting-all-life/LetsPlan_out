import { LetsPlanDatabase } from "../database/index.js";
import { buildAgentInsight, type AgentInsightSnapshot } from "./agentInsight.js";
import type { HabitStats, HabitView, PlanStats, PlanSummary, PlanWithTasks, TaskStatus } from "../database/types.js";
import { formatPlanDate } from "./date.js";
import {
  DEFAULT_INTERVENTION_THRESHOLDS,
  DEFAULT_NIGHTLY_SUMMARY_ENABLED,
  DEFAULT_NIGHTLY_SUMMARY_TIME,
  evaluateIntervention,
  evaluateNightlySummary,
  type InterventionSettings,
  type InterventionSnapshot,
  type NightlySummarySnapshot
} from "./intervention.js";
import type {
  AddTaskRequest,
  ArchiveHabitRequest,
  CreateHabitRequest,
  DailyPlanView,
  HabitCheckInRequest,
  ReorderTasksRequest,
  SetTaskStatusRequest,
  UpdateHabitRequest,
  UpdateTaskRequest
} from "./types.js";
import { createPlanReport, type PlanReport, type PlanReportRequest } from "./report.js";

export type NowProvider = () => Date;
export type InterventionSettingsProvider = () => InterventionSettings;

const defaultInterventionSettingsProvider: InterventionSettingsProvider = () => ({
  thresholdMinutes: DEFAULT_INTERVENTION_THRESHOLDS,
  nightlySummary: {
    enabled: DEFAULT_NIGHTLY_SUMMARY_ENABLED,
    time: DEFAULT_NIGHTLY_SUMMARY_TIME
  }
});

export class LetsPlanApi {
  constructor(
    private readonly database = new LetsPlanDatabase(),
    private readonly getNow: NowProvider = () => new Date(),
    private readonly getInterventionSettings: InterventionSettingsProvider = defaultInterventionSettingsProvider
  ) {}

  close(): void {
    this.database.close();
  }

  getTodayPlan(): DailyPlanView {
    return this.getOrCreatePlanByDate(this.getTodayPlanDate());
  }

  getPlanByDate(planDate: string): DailyPlanView | null {
    const plan = this.database.getPlan(planDate);
    if (!plan) {
      return null;
    }

    return this.getExistingPlanView(plan.id, planDate);
  }

  getOrCreatePlanByDate(planDate: string): DailyPlanView {
    const planWithTasks = this.database.getPlanWithTasks(planDate);
    const stats = this.database.getPlanStats(planWithTasks.plan.id);
    const habits = this.database.getHabitProgress(planDate);
    const habitStats = this.database.getHabitStats(planDate);

    return toDailyPlanView(planWithTasks, stats, habits, habitStats, this.getNow(), this.getInterventionSettings());
  }

  getRecentPlanSummaries(limit = 30): PlanSummary[] {
    return this.database.listPlanSummaries(limit);
  }

  exportPlanReport(request: PlanReportRequest): PlanReport {
    return createPlanReport(request, (planDate) => this.getPlanByDate(planDate), this.getNow(), () => this.database.listPlanDates());
  }

  addTask(request: AddTaskRequest): DailyPlanView {
    const planDate = request.planDate ?? this.getTodayPlanDate();
    this.database.addTask(planDate, {
      content: request.content,
      urgency: request.urgency,
      category: request.category
    });

    return this.getOrCreatePlanByDate(planDate);
  }

  setTaskStatus(request: SetTaskStatusRequest): DailyPlanView {
    const currentView = this.getPlanViewContainingTask(request.planDate, request.taskId);

    this.database.setTaskStatus(request.taskId, request.status);

    return this.getRequiredPlanByDate(currentView.plan.planDate, "task update");
  }

  completeTask(planDate: string, taskId: number): DailyPlanView {
    return this.setTaskStatus({ planDate, taskId, status: "done" });
  }

  reopenTask(planDate: string, taskId: number): DailyPlanView {
    return this.setTaskStatus({ planDate, taskId, status: "pending" });
  }

  updateTask(request: UpdateTaskRequest): DailyPlanView {
    const currentView = this.getPlanViewContainingTask(request.planDate, request.taskId);

    this.database.updateTask(request.taskId, {
      content: request.content,
      urgency: request.urgency,
      category: request.category
    });

    return this.getRequiredPlanByDate(currentView.plan.planDate, "task update");
  }

  reorderTasks(request: ReorderTasksRequest): DailyPlanView {
    const currentView = this.getPlanByDate(request.planDate);
    if (!currentView) {
      throw new Error(`Plan ${request.planDate} does not exist.`);
    }
    const requestedTaskIds = new Set(request.orderedTaskIds);
    const hasForeignTask = request.orderedTaskIds.some((taskId) => !currentView.tasks.some((task) => task.id === taskId));
    if (hasForeignTask) {
      throw new Error(`Task order contains tasks outside plan ${request.planDate}.`);
    }
    if (requestedTaskIds.size !== request.orderedTaskIds.length) {
      throw new Error("Task order contains duplicate ids.");
    }

    this.database.reorderTasks(currentView.plan.id, request.orderedTaskIds);

    return this.getRequiredPlanByDate(currentView.plan.planDate, "task reorder");
  }

  deleteTask(planDate: string, taskId: number): DailyPlanView {
    const currentView = this.getPlanViewContainingTask(planDate, taskId);

    this.database.deleteTask(taskId);

    return this.getRequiredPlanByDate(currentView.plan.planDate, "task delete");
  }

  createHabit(request: CreateHabitRequest): DailyPlanView {
    const planDate = request.planDate ?? this.getTodayPlanDate();
    this.database.createHabit({
      name: request.name,
      frequency: request.frequency,
      customIntervalDays: request.customIntervalDays
    });

    return this.getOrCreatePlanByDate(planDate);
  }

  updateHabit(request: UpdateHabitRequest): DailyPlanView {
    this.database.updateHabit(request.habitId, {
      name: request.name,
      frequency: request.frequency,
      customIntervalDays: request.customIntervalDays,
      status: request.status
    });

    return this.getOrCreatePlanByDate(request.planDate);
  }

  archiveHabit(request: ArchiveHabitRequest): DailyPlanView {
    if (request.status === "active") {
      this.database.updateHabit(request.habitId, { status: "active" });
    } else {
      this.database.archiveHabit(request.habitId);
    }

    return this.getOrCreatePlanByDate(request.planDate);
  }

  checkInHabit(request: HabitCheckInRequest): DailyPlanView {
    this.database.checkInHabit(request.habitId, request.planDate);
    return this.getOrCreatePlanByDate(request.planDate);
  }

  undoHabitCheckIn(request: HabitCheckInRequest): DailyPlanView {
    this.database.undoHabitCheckIn(request.habitId, request.planDate);
    return this.getOrCreatePlanByDate(request.planDate);
  }

  private getTodayPlanDate(): string {
    return formatPlanDate(this.getNow());
  }

  private getExistingPlanView(planId: number, planDate: string): DailyPlanView {
    const plan = this.database.getPlan(planDate);
    if (!plan) {
      throw new Error(`Plan ${planDate} does not exist.`);
    }

    const tasks = this.database.listTasks(planId);
    const stats = this.database.getPlanStats(planId);
    const habits = this.database.getHabitProgress(planDate);
    const habitStats = this.database.getHabitStats(planDate);

    return toDailyPlanView({ plan, tasks }, stats, habits, habitStats, this.getNow(), this.getInterventionSettings());
  }

  private getPlanViewContainingTask(planDate: string, taskId: number): DailyPlanView {
    const currentView = this.getPlanByDate(planDate);
    if (!currentView) {
      throw new Error(`Plan ${planDate} does not exist.`);
    }

    const belongsToPlan = currentView.tasks.some((task) => task.id === taskId);
    if (!belongsToPlan) {
      throw new Error(`Task ${taskId} does not belong to plan ${planDate}.`);
    }

    return currentView;
  }

  private getRequiredPlanByDate(planDate: string, action: string): DailyPlanView {
    const updatedView = this.getPlanByDate(planDate);
    if (!updatedView) {
      throw new Error(`Plan ${planDate} disappeared during ${action}.`);
    }

    return updatedView;
  }
}

function toDailyPlanView(
  planWithTasks: PlanWithTasks,
  stats: PlanStats,
  habits: HabitView[],
  habitStats: HabitStats,
  now: Date,
  interventionSettings: InterventionSettings
): DailyPlanView {
  const pendingTasks = planWithTasks.tasks.filter((task) => task.status === "pending");
  const doneTasks = planWithTasks.tasks.filter((task) => task.status === "done");
  const isCompleted = stats.total > 0 && stats.doneCount === stats.total;
  const intervention = evaluateIntervention({
    now,
    pendingTasks,
    doneTasks,
    habitStats,
    isCompleted,
    thresholdMinutes: interventionSettings.thresholdMinutes
  });
  const nightlySummary = evaluateNightlySummary({
    now,
    planDate: planWithTasks.plan.planDate,
    pendingTasks,
    doneTasks,
    enabled: interventionSettings.nightlySummary.enabled,
    summaryTime: interventionSettings.nightlySummary.time,
    todayDate: formatPlanDate(now)
  });
  const agentInsight = buildAgentInsight({
    pendingTasks,
    doneTasks,
    habitStats,
    intervention,
    isCompleted
  });

  return {
    plan: planWithTasks.plan,
    tasks: planWithTasks.tasks,
    pendingTasks,
    doneTasks,
    stats,
    isCompleted,
    habits,
    habitStats,
    intervention,
    nightlySummary,
    agentInsight
  };
}

export type {
  AddTaskRequest,
  ArchiveHabitRequest,
  CreateHabitRequest,
  DailyPlanView,
  HabitCheckInRequest,
  InterventionSettings,
  InterventionSnapshot,
  NightlySummarySnapshot,
  PlanReport,
  PlanReportRequest,
  PlanSummary,
  ReorderTasksRequest,
  SetTaskStatusRequest,
  TaskStatus,
  UpdateHabitRequest,
  UpdateTaskRequest
};
export { DEFAULT_PLAN_TIME_ZONE, formatPlanDate } from "./date.js";
export { buildAgentInsight } from "./agentInsight.js";
export {
  DEFAULT_INTERVENTION_THRESHOLDS,
  DEFAULT_NIGHTLY_SUMMARY_ENABLED,
  DEFAULT_NIGHTLY_SUMMARY_TIME,
  clampInterventionMinute,
  evaluateIntervention,
  evaluateNightlySummary,
  normalizeInterventionThresholds,
  normalizeSummaryTime
} from "./intervention.js";