import type { IpcMainInvokeEvent } from "electron";
import type { InterventionThresholdMinutes } from "../modules/api/intervention.js";
import type { AppPetCharacter, AppSettings, AppSettingsPatch, AppSettingsStore } from "./appSettings.js";
import { isAppPetCharacter } from "./appSettings.js";
import { getAutoLaunchSettings, setAutoLaunchOpenAtLogin, type AutoLaunchSettings } from "./autoLaunch.js";
import { SETTINGS_IPC_CHANNELS } from "./ipcChannels.js";

type IpcHandler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

export interface IpcMainLike {
  handle(channel: string, listener: IpcHandler): void;
  removeHandler?(channel: string): void;
}

export interface AutoLaunchSettingsApiLike {
  getAutoLaunchSettings(): AutoLaunchSettings;
  setAutoLaunchOpenAtLogin(openAtLogin: boolean): AutoLaunchSettings;
}

export interface SettingsApiLike extends AutoLaunchSettingsApiLike {
  getAppSettings(): AppSettings;
  setAppSettings(patch: AppSettingsPatch): AppSettings;
}

export interface RegisterSettingsIpcOptions {
  onAppSettingsChanged?(settings: AppSettings): void;
}

export interface RegisteredSettingsIpcHandlers {
  dispose(): void;
}

export function createAutoLaunchSettingsApi(app: Parameters<typeof getAutoLaunchSettings>[0]): AutoLaunchSettingsApiLike {
  return {
    getAutoLaunchSettings: () => getAutoLaunchSettings(app),
    setAutoLaunchOpenAtLogin: (openAtLogin) => setAutoLaunchOpenAtLogin(app, openAtLogin)
  };
}

export function createSettingsApi(
  app: Parameters<typeof getAutoLaunchSettings>[0],
  appSettingsStore: AppSettingsStore
): SettingsApiLike {
  const autoLaunchApi = createAutoLaunchSettingsApi(app);

  return {
    ...autoLaunchApi,
    getAppSettings: () => appSettingsStore.getAppSettings(),
    setAppSettings: (patch) => appSettingsStore.setAppSettings(patch)
  };
}

export function registerSettingsIpcHandlers(
  ipcMain: IpcMainLike,
  api: SettingsApiLike,
  options: RegisterSettingsIpcOptions = {}
): RegisteredSettingsIpcHandlers {
  const handlers: Array<[string, IpcHandler]> = [
    [SETTINGS_IPC_CHANNELS.getAutoLaunchSettings, () => api.getAutoLaunchSettings()],
    [
      SETTINGS_IPC_CHANNELS.setAutoLaunchOpenAtLogin,
      (_event, openAtLogin) => api.setAutoLaunchOpenAtLogin(assertBoolean(openAtLogin, "openAtLogin"))
    ],
    [SETTINGS_IPC_CHANNELS.getAppSettings, () => api.getAppSettings()],
    [
      SETTINGS_IPC_CHANNELS.setAppSettings,
      (_event, patch) => {
        const nextSettings = api.setAppSettings(assertAppSettingsPatch(patch));
        options.onAppSettingsChanged?.(nextSettings);
        return nextSettings;
      }
    ]
  ];

  handlers.forEach(([channel, handler]) => ipcMain.handle(channel, handler));

  return {
    dispose() {
      handlers.forEach(([channel]) => ipcMain.removeHandler?.(channel));
    }
  };
}

function assertBoolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${name} must be a boolean.`);
  }

  return value;
}

function assertPetCharacter(value: unknown, name: string): AppPetCharacter {
  if (!isAppPetCharacter(value)) {
    throw new Error(`${name} must be cat, dog or robot.`);
  }

  return value;
}

function assertAppSettingsPatch(value: unknown): AppSettingsPatch {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("settings patch must be an object.");
  }

  const record = value as Record<string, unknown>;
  const patch: AppSettingsPatch = {};

  for (const key of ["hideToTrayOnClose", "showCompletionAnimation", "openHistoryInNewWindow", "nightlySummaryEnabled"] as const) {
    if (record[key] === undefined) {
      continue;
    }
    patch[key] = assertBoolean(record[key], key);
  }

  if (record.petCharacter !== undefined) {
    patch.petCharacter = assertPetCharacter(record.petCharacter, "petCharacter");
  }
  if (record.interventionThresholdMinutes !== undefined) {
    patch.interventionThresholdMinutes = assertInterventionThresholdPatch(record.interventionThresholdMinutes);
  }
  if (record.nightlySummaryTime !== undefined) {
    patch.nightlySummaryTime = assertSummaryTime(record.nightlySummaryTime, "nightlySummaryTime");
  }
  if (record.petClickDodgeThreshold !== undefined) {
    patch.petClickDodgeThreshold = assertBoundedInteger(record.petClickDodgeThreshold, "petClickDodgeThreshold", 3, 30);
  }
  if (record.petDodgeDistance !== undefined) {
    patch.petDodgeDistance = assertBoundedInteger(record.petDodgeDistance, "petDodgeDistance", 40, 320);
  }
  if (record.petBurstDodgeThreshold !== undefined) {
    patch.petBurstDodgeThreshold = assertBoundedInteger(record.petBurstDodgeThreshold, "petBurstDodgeThreshold", 4, 60);
  }
  if (record.mainQuestByDate !== undefined) {
    patch.mainQuestByDate = assertMainQuestByDate(record.mainQuestByDate);
  }

  return patch;
}
function assertMainQuestByDate(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("mainQuestByDate must be an object.");
  }

  const record = value as Record<string, unknown>;
  const patch: Record<string, number> = {};
  for (const [planDate, taskId] of Object.entries(record)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(planDate)) {
      throw new Error("mainQuestByDate keys must use YYYY-MM-DD.");
    }
    if (typeof taskId !== "number" || !Number.isSafeInteger(taskId) || taskId <= 0) {
      throw new Error("mainQuestByDate." + planDate + " must be a positive integer.");
    }
    patch[planDate] = taskId;
  }

  return patch;
}

function assertInterventionThresholdPatch(value: unknown): Partial<InterventionThresholdMinutes> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("interventionThresholdMinutes must be an object.");
  }

  const record = value as Record<string, unknown>;
  const patch: Partial<InterventionThresholdMinutes> = {};
  for (const key of ["l1", "l2", "l3", "l4"] as const) {
    if (record[key] === undefined) {
      continue;
    }
    patch[key] = assertPositiveMinute(record[key], `interventionThresholdMinutes.${key}`);
  }

  return patch;
}

function assertPositiveMinute(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    throw new Error(`${name} must be a positive number.`);
  }

  return Math.trunc(value);
}

function assertBoundedInteger(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} must be a number from ${min} to ${max}.`);
  }

  return Math.trunc(value);
}

function assertSummaryTime(value: unknown, name: string): string {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(value)) {
    throw new Error(`${name} must be HH:mm.`);
  }

  return value;
}
