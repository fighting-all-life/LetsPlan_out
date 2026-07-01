import type {
  AddTaskRequest,
  ArchiveHabitRequest,
  CreateHabitRequest,
  DailyPlanView,
  HabitCheckInRequest,
  PlanReportRequest,
  PlanSummary,
  ReorderTasksRequest,
  SetTaskStatusRequest,
  UpdateHabitRequest,
  UpdateTaskRequest
} from "../modules/api/index.js";
import type { InterventionAction, InterventionLevel, NightlySummarySnapshot } from "../modules/api/intervention.js";
import type { AppSettings, AppSettingsPatch } from "./appSettings.js";
import type { AutoLaunchSettings } from "./autoLaunch.js";

export type BackgroundColorCommand =
  | { mode: "preset"; color: string }
  | { mode: "custom" };

export type PlanReportFormat = "markdown" | "pdf" | "excel";

export interface PlanReportExportRequest extends PlanReportRequest {
  format: PlanReportFormat;
}

export interface PlanReportExportResult {
  canceled: boolean;
  filePath?: string;
}

export type PetWindowMoveRequest =
  | { deltaX: number; deltaY: number }
  | { targetX: number; targetY: number };

export interface PetStatusPayload {
  total: number;
  doneCount: number;
  percentage: number;
  isCompleted: boolean;
  interventionLevel: InterventionLevel;
  interventionAction: InterventionAction;
  interventionMessage: string;
  nightlySummary: NightlySummarySnapshot;
}

export interface LetsPlanRendererApi {
  getTodayPlan(): Promise<DailyPlanView>;
  getPlanByDate(planDate: string): Promise<DailyPlanView | null>;
  getOrCreatePlanByDate(planDate: string): Promise<DailyPlanView>;
  getRecentPlanSummaries(limit?: number): Promise<PlanSummary[]>;
  addTask(request: AddTaskRequest): Promise<DailyPlanView>;
  setTaskStatus(request: SetTaskStatusRequest): Promise<DailyPlanView>;
  completeTask(planDate: string, taskId: number): Promise<DailyPlanView>;
  reopenTask(planDate: string, taskId: number): Promise<DailyPlanView>;
  updateTask(request: UpdateTaskRequest): Promise<DailyPlanView>;
  reorderTasks(request: ReorderTasksRequest): Promise<DailyPlanView>;
  deleteTask(planDate: string, taskId: number): Promise<DailyPlanView>;
  createHabit(request: CreateHabitRequest): Promise<DailyPlanView>;
  updateHabit(request: UpdateHabitRequest): Promise<DailyPlanView>;
  archiveHabit(request: ArchiveHabitRequest): Promise<DailyPlanView>;
  checkInHabit(request: HabitCheckInRequest): Promise<DailyPlanView>;
  undoHabitCheckIn(request: HabitCheckInRequest): Promise<DailyPlanView>;
  getAutoLaunchSettings(): Promise<AutoLaunchSettings>;
  setAutoLaunchOpenAtLogin(openAtLogin: boolean): Promise<AutoLaunchSettings>;
  getAppSettings(): Promise<AppSettings>;
  setAppSettings(patch: AppSettingsPatch): Promise<AppSettings>;
  openHistoryWindow(): Promise<boolean>;
  openMainWindow(): Promise<boolean>;
  openPetContextMenu(): void;
  movePetWindow(request: PetWindowMoveRequest): Promise<boolean>;
  setPetMousePassthrough(shouldIgnore: boolean): Promise<boolean>;
  exportPlanReport(request: PlanReportExportRequest): Promise<PlanReportExportResult>;
  onOpenHistory(listener: () => void): () => void;
  onOpenSettings(listener: () => void): () => void;
  onPetStatus(listener: (status: PetStatusPayload) => void): () => void;
  onAppSettings(listener: (settings: AppSettings) => void): () => void;
  onSetBackgroundColor(listener: (command: BackgroundColorCommand) => void): () => void;
}

declare global {
  interface Window {
    letsPlan: LetsPlanRendererApi;
  }
}
