export type TaskUrgency = "urgent" | "regular";
export type TaskCategory = "work" | "study";
export type TaskStatus = "pending" | "done";

export type HabitFrequency = "daily" | "weekly" | "custom";
export type HabitStatus = "active" | "archived";

export interface DailyPlan {
  id: number;
  planDate: string;
  createdAt: string;
  completedAt: string | null;
}

export interface Task {
  id: number;
  planId: number;
  content: string;
  urgency: TaskUrgency;
  category: TaskCategory;
  status: TaskStatus;
  sortOrder: number;
  createdAt: string;
  completedAt: string | null;
}

export interface Habit {
  id: number;
  name: string;
  frequency: HabitFrequency;
  customIntervalDays: number | null;
  status: HabitStatus;
  createdAt: string;
  archivedAt: string | null;
}

export interface HabitLog {
  id: number;
  habitId: number;
  logDate: string;
  createdAt: string;
}

export interface HabitView {
  habit: Habit;
  isCheckedToday: boolean;
  streak: number;
  lastCheckedDate: string | null;
  isBroken: boolean;
  canRecover: boolean;
}

export interface HabitStats {
  total: number;
  checkedCount: number;
  percentage: number;
  brokenCount: number;
  recoverableCount: number;
}

export interface PlanWithTasks {
  plan: DailyPlan;
  tasks: Task[];
}

export interface CreateTaskInput {
  content: string;
  urgency?: TaskUrgency;
  category?: TaskCategory;
}

export interface UpdateTaskInput {
  content?: string;
  urgency?: TaskUrgency;
  category?: TaskCategory;
}

export interface CreateHabitInput {
  name: string;
  frequency?: HabitFrequency;
  customIntervalDays?: number | null;
}

export interface UpdateHabitInput {
  name?: string;
  frequency?: HabitFrequency;
  customIntervalDays?: number | null;
  status?: HabitStatus;
}

export interface PlanStats {
  total: number;
  doneCount: number;
  percentage: number;
}

export interface PlanSummary extends PlanStats {
  planDate: string;
  completedAt: string | null;
  isCompleted: boolean;
}
