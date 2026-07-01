import type { IpcMainInvokeEvent } from "electron";
import { LetsPlanApi } from "../modules/api/index.js";
import type {
  AddTaskRequest,
  ArchiveHabitRequest,
  CreateHabitRequest,
  DailyPlanView,
  HabitCheckInRequest,
  PlanSummary,
  ReorderTasksRequest,
  SetTaskStatusRequest,
  UpdateHabitRequest,
  UpdateTaskRequest
} from "../modules/api/index.js";
import type { HabitFrequency, HabitStatus, TaskCategory, TaskStatus, TaskUrgency } from "../modules/database/types.js";
import { PLAN_IPC_CHANNELS } from "./ipcChannels.js";
import type { RendererStateEventKind } from "./rendererState.js";

type IpcHandler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

export interface IpcMainLike {
  handle(channel: string, listener: IpcHandler): void;
  removeHandler?(channel: string): void;
}

export interface PlanApiLike {
  getTodayPlan(): DailyPlanView;
  getPlanByDate(planDate: string): DailyPlanView | null;
  getOrCreatePlanByDate(planDate: string): DailyPlanView;
  getRecentPlanSummaries(limit?: number): PlanSummary[];
  addTask(request: AddTaskRequest): DailyPlanView;
  setTaskStatus(request: SetTaskStatusRequest): DailyPlanView;
  completeTask(planDate: string, taskId: number): DailyPlanView;
  reopenTask(planDate: string, taskId: number): DailyPlanView;
  updateTask(request: UpdateTaskRequest): DailyPlanView;
  reorderTasks(request: ReorderTasksRequest): DailyPlanView;
  deleteTask(planDate: string, taskId: number): DailyPlanView;
  createHabit(request: CreateHabitRequest): DailyPlanView;
  updateHabit(request: UpdateHabitRequest): DailyPlanView;
  archiveHabit(request: ArchiveHabitRequest): DailyPlanView;
  checkInHabit(request: HabitCheckInRequest): DailyPlanView;
  undoHabitCheckIn(request: HabitCheckInRequest): DailyPlanView;
}

export interface RegisterPlanIpcOptions {
  onPlanViewChanged?(view: DailyPlanView, kind: RendererStateEventKind): void;
}

export interface RegisteredPlanIpcHandlers {
  dispose(): void;
}

export function registerPlanIpcHandlers(
  ipcMain: IpcMainLike,
  api: PlanApiLike = new LetsPlanApi(),
  options: RegisterPlanIpcOptions = {}
): RegisteredPlanIpcHandlers {
  const notifyPlanView = (view: DailyPlanView, kind: RendererStateEventKind): DailyPlanView => {
    options.onPlanViewChanged?.(view, kind);
    return view;
  };
  const notifyOptionalPlanView = (view: DailyPlanView | null, kind: RendererStateEventKind): DailyPlanView | null => {
    if (view) {
      options.onPlanViewChanged?.(view, kind);
    }
    return view;
  };

  const handlers: Array<[string, IpcHandler]> = [
    [PLAN_IPC_CHANNELS.getTodayPlan, () => notifyPlanView(api.getTodayPlan(), "sync")],
    [PLAN_IPC_CHANNELS.getPlanByDate, (_event, planDate) => notifyOptionalPlanView(api.getPlanByDate(assertString(planDate, "planDate")), "sync")],
    [
      PLAN_IPC_CHANNELS.getOrCreatePlanByDate,
      (_event, planDate) => notifyPlanView(api.getOrCreatePlanByDate(assertString(planDate, "planDate")), "sync")
    ],
    [
      PLAN_IPC_CHANNELS.getRecentPlanSummaries,
      (_event, limit) => api.getRecentPlanSummaries(limit === undefined ? undefined : assertNumber(limit, "limit"))
    ],
    [PLAN_IPC_CHANNELS.addTask, (_event, request) => notifyPlanView(api.addTask(assertAddTaskRequest(request)), "task-update")],
    [PLAN_IPC_CHANNELS.setTaskStatus, (_event, request) => notifyPlanView(api.setTaskStatus(assertSetTaskStatusRequest(request)), "progress-update")],
    [
      PLAN_IPC_CHANNELS.completeTask,
      (_event, planDate, taskId) => notifyPlanView(api.completeTask(assertString(planDate, "planDate"), assertNumber(taskId, "taskId")), "progress-update")
    ],
    [
      PLAN_IPC_CHANNELS.reopenTask,
      (_event, planDate, taskId) => notifyPlanView(api.reopenTask(assertString(planDate, "planDate"), assertNumber(taskId, "taskId")), "progress-update")
    ],
    [PLAN_IPC_CHANNELS.updateTask, (_event, request) => notifyPlanView(api.updateTask(assertUpdateTaskRequest(request)), "task-update")],
    [PLAN_IPC_CHANNELS.reorderTasks, (_event, request) => notifyPlanView(api.reorderTasks(assertReorderTasksRequest(request)), "task-update")],
    [
      PLAN_IPC_CHANNELS.deleteTask,
      (_event, planDate, taskId) => notifyPlanView(api.deleteTask(assertString(planDate, "planDate"), assertNumber(taskId, "taskId")), "task-update")
    ],
    [PLAN_IPC_CHANNELS.createHabit, (_event, request) => notifyPlanView(api.createHabit(assertCreateHabitRequest(request)), "habit-update")],
    [PLAN_IPC_CHANNELS.updateHabit, (_event, request) => notifyPlanView(api.updateHabit(assertUpdateHabitRequest(request)), "habit-update")],
    [PLAN_IPC_CHANNELS.archiveHabit, (_event, request) => notifyPlanView(api.archiveHabit(assertArchiveHabitRequest(request)), "habit-update")],
    [PLAN_IPC_CHANNELS.checkInHabit, (_event, request) => notifyPlanView(api.checkInHabit(assertHabitCheckInRequest(request)), "habit-update")],
    [PLAN_IPC_CHANNELS.undoHabitCheckIn, (_event, request) => notifyPlanView(api.undoHabitCheckIn(assertHabitCheckInRequest(request)), "habit-update")]
  ];

  handlers.forEach(([channel, handler]) => ipcMain.handle(channel, handler));

  return {
    dispose() {
      handlers.forEach(([channel]) => ipcMain.removeHandler?.(channel));
    }
  };
}

function assertAddTaskRequest(value: unknown): AddTaskRequest {
  const record = assertRecord(value, "request");
  const request: AddTaskRequest = {
    content: assertString(record.content, "content")
  };

  if (record.planDate !== undefined) {
    request.planDate = assertString(record.planDate, "planDate");
  }
  if (record.urgency !== undefined) {
    request.urgency = assertUrgency(record.urgency);
  }
  if (record.category !== undefined) {
    request.category = assertCategory(record.category);
  }

  return request;
}

function assertSetTaskStatusRequest(value: unknown): SetTaskStatusRequest {
  const record = assertRecord(value, "request");

  return {
    planDate: assertString(record.planDate, "planDate"),
    taskId: assertNumber(record.taskId, "taskId"),
    status: assertStatus(record.status)
  };
}

function assertUpdateTaskRequest(value: unknown): UpdateTaskRequest {
  const record = assertRecord(value, "request");
  const request: UpdateTaskRequest = {
    planDate: assertString(record.planDate, "planDate"),
    taskId: assertNumber(record.taskId, "taskId"),
    content: assertString(record.content, "content")
  };

  if (record.urgency !== undefined) {
    request.urgency = assertUrgency(record.urgency);
  }
  if (record.category !== undefined) {
    request.category = assertCategory(record.category);
  }

  return request;
}

function assertReorderTasksRequest(value: unknown): ReorderTasksRequest {
  const record = assertRecord(value, "request");
  const orderedTaskIds = assertNumberArray(record.orderedTaskIds, "orderedTaskIds");

  return {
    planDate: assertString(record.planDate, "planDate"),
    orderedTaskIds
  };
}

function assertCreateHabitRequest(value: unknown): CreateHabitRequest {
  const record = assertRecord(value, "request");
  const request: CreateHabitRequest = {
    name: assertString(record.name, "name")
  };

  if (record.planDate !== undefined) {
    request.planDate = assertString(record.planDate, "planDate");
  }
  if (record.frequency !== undefined) {
    request.frequency = assertHabitFrequency(record.frequency);
  }
  if (record.customIntervalDays !== undefined) {
    request.customIntervalDays = assertOptionalInterval(record.customIntervalDays, "customIntervalDays");
  }

  return request;
}

function assertUpdateHabitRequest(value: unknown): UpdateHabitRequest {
  const record = assertRecord(value, "request");
  const request: UpdateHabitRequest = {
    planDate: assertString(record.planDate, "planDate"),
    habitId: assertNumber(record.habitId, "habitId")
  };

  if (record.name !== undefined) {
    request.name = assertString(record.name, "name");
  }
  if (record.frequency !== undefined) {
    request.frequency = assertHabitFrequency(record.frequency);
  }
  if (record.customIntervalDays !== undefined) {
    request.customIntervalDays = assertOptionalInterval(record.customIntervalDays, "customIntervalDays");
  }
  if (record.status !== undefined) {
    request.status = assertHabitStatus(record.status);
  }

  return request;
}

function assertArchiveHabitRequest(value: unknown): ArchiveHabitRequest {
  const record = assertRecord(value, "request");
  const request: ArchiveHabitRequest = {
    planDate: assertString(record.planDate, "planDate"),
    habitId: assertNumber(record.habitId, "habitId")
  };

  if (record.status !== undefined) {
    request.status = assertHabitStatus(record.status);
  }

  return request;
}

function assertHabitCheckInRequest(value: unknown): HabitCheckInRequest {
  const record = assertRecord(value, "request");

  return {
    planDate: assertString(record.planDate, "planDate"),
    habitId: assertNumber(record.habitId, "habitId")
  };
}

function assertRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function assertString(value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw new Error(`${name} must be a string.`);
  }

  return value;
}

function assertNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number.`);
  }

  return value;
}

function assertNumberArray(value: unknown, name: string): number[] {
  if (!Array.isArray(value)) {
    throw new Error(`${name} must be an array.`);
  }

  return value.map((item, index) => assertNumber(item, `${name}[${index}]`));
}

function assertOptionalInterval(value: unknown, name: string): number | null {
  if (value === null) {
    return null;
  }

  return assertNumber(value, name);
}

function assertUrgency(value: unknown): TaskUrgency {
  if (value === "urgent" || value === "regular") {
    return value;
  }

  throw new Error("urgency must be urgent or regular.");
}

function assertCategory(value: unknown): TaskCategory {
  if (value === "work" || value === "study") {
    return value;
  }

  throw new Error("category must be work or study.");
}

function assertStatus(value: unknown): TaskStatus {
  if (value === "pending" || value === "done") {
    return value;
  }

  throw new Error("status must be pending or done.");
}

function assertHabitFrequency(value: unknown): HabitFrequency {
  if (value === "daily" || value === "weekly" || value === "custom") {
    return value;
  }

  throw new Error("frequency must be daily, weekly or custom.");
}

function assertHabitStatus(value: unknown): HabitStatus {
  if (value === "active" || value === "archived") {
    return value;
  }

  throw new Error("habit status must be active or archived.");
}
