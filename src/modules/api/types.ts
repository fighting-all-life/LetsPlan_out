import type {
  CreateHabitInput,
  CreateTaskInput,
  DailyPlan,
  HabitStats,
  HabitStatus,
  HabitView,
  PlanStats,
  Task,
  TaskStatus,
  UpdateHabitInput,
  UpdateTaskInput
} from "../database/types.js";
import type { AgentInsightSnapshot } from "./agentInsight.js";
import type { InterventionSnapshot, NightlySummarySnapshot } from "./intervention.js";

export interface DailyPlanView {
  plan: DailyPlan;
  tasks: Task[];
  pendingTasks: Task[];
  doneTasks: Task[];
  stats: PlanStats;
  isCompleted: boolean;
  habits: HabitView[];
  habitStats: HabitStats;
  intervention: InterventionSnapshot;
  nightlySummary: NightlySummarySnapshot;
  agentInsight: AgentInsightSnapshot;
}

export interface AddTaskRequest extends CreateTaskInput {
  planDate?: string;
}

export interface SetTaskStatusRequest {
  planDate: string;
  taskId: number;
  status: TaskStatus;
}

export interface UpdateTaskRequest extends UpdateTaskInput {
  planDate: string;
  taskId: number;
  content: string;
}

export interface ReorderTasksRequest {
  planDate: string;
  orderedTaskIds: number[];
}

export interface CreateHabitRequest extends CreateHabitInput {
  planDate?: string;
}

export interface UpdateHabitRequest extends UpdateHabitInput {
  planDate: string;
  habitId: number;
}

export interface ArchiveHabitRequest {
  planDate: string;
  habitId: number;
  status?: HabitStatus;
}

export interface HabitCheckInRequest {
  planDate: string;
  habitId: number;
}
