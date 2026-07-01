export const PLAN_IPC_CHANNELS = {
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

export type PlanIpcChannel = (typeof PLAN_IPC_CHANNELS)[keyof typeof PLAN_IPC_CHANNELS];

export const SETTINGS_IPC_CHANNELS = {
  getAutoLaunchSettings: "settings:getAutoLaunch",
  setAutoLaunchOpenAtLogin: "settings:setAutoLaunchOpenAtLogin",
  getAppSettings: "settings:getAppSettings",
  setAppSettings: "settings:setAppSettings"
} as const;

export const WINDOW_IPC_CHANNELS = {
  openHistoryWindow: "window:openHistory",
  openMainWindow: "window:openMain",
  openPetContextMenu: "pet-right-click",
  movePetWindow: "window:movePet",
  setPetMousePassthrough: "window:setPetMousePassthrough"
} as const;

export const RENDERER_COMMAND_CHANNELS = {
  openHistory: "renderer:openHistory",
  openSettings: "renderer:openSettings",
  setBackgroundColor: "renderer:setBackgroundColor",
  updatePetStatus: "renderer:updatePetStatus",
  updateAppSettings: "renderer:updateAppSettings"
} as const;

export const REPORT_IPC_CHANNELS = {
  exportPlanReport: "reports:exportPlanReport"
} as const;
