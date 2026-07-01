const { contextBridge, ipcRenderer } = require("electron") as typeof import("electron");

const PLAN_IPC_CHANNELS = {
  getTodayPlan: "plans:getToday",
  getPlanByDate: "plans:getByDate",
  getOrCreatePlanByDate: "plans:getOrCreateByDate",
  getRecentPlanSummaries: "plans:getRecentSummaries",
  addTask: "plans:addTask",
  setTaskStatus: "plans:setTaskStatus",
  completeTask: "plans:completeTask",
  reopenTask: "plans:reopenTask",
  updateTask: "plans:updateTask",
  reorderTasks: "plans:reorderTasks",
  deleteTask: "plans:deleteTask",
  createHabit: "habits:create",
  updateHabit: "habits:update",
  archiveHabit: "habits:archive",
  checkInHabit: "habits:checkIn",
  undoHabitCheckIn: "habits:undoCheckIn"
} as const;

const SETTINGS_IPC_CHANNELS = {
  getAutoLaunchSettings: "settings:getAutoLaunch",
  setAutoLaunchOpenAtLogin: "settings:setAutoLaunchOpenAtLogin",
  getAppSettings: "settings:getAppSettings",
  setAppSettings: "settings:setAppSettings"
} as const;

const WINDOW_IPC_CHANNELS = {
  openHistoryWindow: "window:openHistory",
  openMainWindow: "window:openMain",
  openPetContextMenu: "pet-right-click",
  movePetWindow: "window:movePet",
  setPetMousePassthrough: "window:setPetMousePassthrough"
} as const;

const REPORT_IPC_CHANNELS = {
  exportPlanReport: "reports:exportPlanReport"
} as const;

const RENDERER_COMMAND_CHANNELS = {
  openHistory: "renderer:openHistory",
  openSettings: "renderer:openSettings",
  setBackgroundColor: "renderer:setBackgroundColor",
  updatePetStatus: "renderer:updatePetStatus",
  updateAppSettings: "renderer:updateAppSettings"
} as const;

const letsPlanRendererApi = {
  getTodayPlan: () => ipcRenderer.invoke(PLAN_IPC_CHANNELS.getTodayPlan),
  getPlanByDate: (planDate: string) => ipcRenderer.invoke(PLAN_IPC_CHANNELS.getPlanByDate, planDate),
  getOrCreatePlanByDate: (planDate: string) => ipcRenderer.invoke(PLAN_IPC_CHANNELS.getOrCreatePlanByDate, planDate),
  getRecentPlanSummaries: (limit?: number) => ipcRenderer.invoke(PLAN_IPC_CHANNELS.getRecentPlanSummaries, limit),
  addTask: (request: unknown) => ipcRenderer.invoke(PLAN_IPC_CHANNELS.addTask, request),
  setTaskStatus: (request: unknown) => ipcRenderer.invoke(PLAN_IPC_CHANNELS.setTaskStatus, request),
  completeTask: (planDate: string, taskId: number) => ipcRenderer.invoke(PLAN_IPC_CHANNELS.completeTask, planDate, taskId),
  reopenTask: (planDate: string, taskId: number) => ipcRenderer.invoke(PLAN_IPC_CHANNELS.reopenTask, planDate, taskId),
  updateTask: (request: unknown) => ipcRenderer.invoke(PLAN_IPC_CHANNELS.updateTask, request),
  reorderTasks: (request: unknown) => ipcRenderer.invoke(PLAN_IPC_CHANNELS.reorderTasks, request),
  deleteTask: (planDate: string, taskId: number) => ipcRenderer.invoke(PLAN_IPC_CHANNELS.deleteTask, planDate, taskId),
  createHabit: (request: unknown) => ipcRenderer.invoke(PLAN_IPC_CHANNELS.createHabit, request),
  updateHabit: (request: unknown) => ipcRenderer.invoke(PLAN_IPC_CHANNELS.updateHabit, request),
  archiveHabit: (request: unknown) => ipcRenderer.invoke(PLAN_IPC_CHANNELS.archiveHabit, request),
  checkInHabit: (request: unknown) => ipcRenderer.invoke(PLAN_IPC_CHANNELS.checkInHabit, request),
  undoHabitCheckIn: (request: unknown) => ipcRenderer.invoke(PLAN_IPC_CHANNELS.undoHabitCheckIn, request),
  getAutoLaunchSettings: () => ipcRenderer.invoke(SETTINGS_IPC_CHANNELS.getAutoLaunchSettings),
  setAutoLaunchOpenAtLogin: (openAtLogin: boolean) => ipcRenderer.invoke(SETTINGS_IPC_CHANNELS.setAutoLaunchOpenAtLogin, openAtLogin),
  getAppSettings: () => ipcRenderer.invoke(SETTINGS_IPC_CHANNELS.getAppSettings),
  setAppSettings: (patch: unknown) => ipcRenderer.invoke(SETTINGS_IPC_CHANNELS.setAppSettings, patch),
  openHistoryWindow: () => ipcRenderer.invoke(WINDOW_IPC_CHANNELS.openHistoryWindow),
  openMainWindow: () => ipcRenderer.invoke(WINDOW_IPC_CHANNELS.openMainWindow),
  openPetContextMenu: () => ipcRenderer.send(WINDOW_IPC_CHANNELS.openPetContextMenu),
  movePetWindow: (request: unknown) => ipcRenderer.invoke(WINDOW_IPC_CHANNELS.movePetWindow, request),
  setPetMousePassthrough: (shouldIgnore: boolean) => ipcRenderer.invoke(WINDOW_IPC_CHANNELS.setPetMousePassthrough, shouldIgnore),
  exportPlanReport: (request: unknown) => ipcRenderer.invoke(REPORT_IPC_CHANNELS.exportPlanReport, request),
  onOpenHistory: (listener: () => void) => {
    const handler = () => listener();
    ipcRenderer.on(RENDERER_COMMAND_CHANNELS.openHistory, handler);
    return () => ipcRenderer.removeListener(RENDERER_COMMAND_CHANNELS.openHistory, handler);
  },
  onOpenSettings: (listener: () => void) => {
    const handler = () => listener();
    ipcRenderer.on(RENDERER_COMMAND_CHANNELS.openSettings, handler);
    return () => ipcRenderer.removeListener(RENDERER_COMMAND_CHANNELS.openSettings, handler);
  },
  onPetStatus: (listener: (status: unknown) => void) => {
    const handler = (_event: unknown, status: unknown) => listener(status);
    ipcRenderer.on(RENDERER_COMMAND_CHANNELS.updatePetStatus, handler);
    return () => ipcRenderer.removeListener(RENDERER_COMMAND_CHANNELS.updatePetStatus, handler);
  },
  onAppSettings: (listener: (settings: unknown) => void) => {
    const handler = (_event: unknown, settings: unknown) => listener(settings);
    ipcRenderer.on(RENDERER_COMMAND_CHANNELS.updateAppSettings, handler);
    return () => ipcRenderer.removeListener(RENDERER_COMMAND_CHANNELS.updateAppSettings, handler);
  },
  onSetBackgroundColor: (listener: (command: unknown) => void) => {
    const handler = (_event: unknown, command: unknown) => listener(command);
    ipcRenderer.on(RENDERER_COMMAND_CHANNELS.setBackgroundColor, handler);
    return () => ipcRenderer.removeListener(RENDERER_COMMAND_CHANNELS.setBackgroundColor, handler);
  }
};

contextBridge.exposeInMainWorld("letsPlan", letsPlanRendererApi);
