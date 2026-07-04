import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  DEFAULT_INTERVENTION_THRESHOLDS,
  DEFAULT_NIGHTLY_SUMMARY_ENABLED,
  DEFAULT_NIGHTLY_SUMMARY_TIME,
  normalizeInterventionThresholds,
  normalizeSummaryTime,
  type InterventionSettings,
  type InterventionThresholdMinutes
} from "../modules/api/intervention.js";

export const APP_PET_CHARACTERS = ["cat", "dog", "robot"] as const;
export type AppPetCharacter = (typeof APP_PET_CHARACTERS)[number];
export type MainQuestByDate = Record<string, number>;

export interface AppSettings {
  hideToTrayOnClose: boolean;
  showCompletionAnimation: boolean;
  openHistoryInNewWindow: boolean;
  petCharacter: AppPetCharacter;
  interventionThresholdMinutes: InterventionThresholdMinutes;
  nightlySummaryEnabled: boolean;
  nightlySummaryTime: string;
  petClickDodgeThreshold: number;
  petDodgeDistance: number;
  petBurstDodgeThreshold: number;
  mainQuestByDate: MainQuestByDate;
}

export type AppSettingsPatch = Partial<Omit<AppSettings, "interventionThresholdMinutes">> & {
  interventionThresholdMinutes?: Partial<InterventionThresholdMinutes>;
};

export interface AppSettingsStore {
  getAppSettings(): AppSettings;
  setAppSettings(patch: AppSettingsPatch): AppSettings;
}

export interface AppSettingsAppLike {
  getPath(name: "userData"): string;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  hideToTrayOnClose: true,
  showCompletionAnimation: true,
  openHistoryInNewWindow: true,
  petCharacter: "cat",
  interventionThresholdMinutes: DEFAULT_INTERVENTION_THRESHOLDS,
  nightlySummaryEnabled: DEFAULT_NIGHTLY_SUMMARY_ENABLED,
  nightlySummaryTime: DEFAULT_NIGHTLY_SUMMARY_TIME,
  petClickDodgeThreshold: 10,
  petDodgeDistance: 130,
  petBurstDodgeThreshold: 16,
  mainQuestByDate: {}
};

export function createAppSettingsStore(app: AppSettingsAppLike, filePath?: string): AppSettingsStore {
  const resolvedFilePath = filePath ?? join(app.getPath("userData"), "settings.json");

  return {
    getAppSettings() {
      return readAppSettings(resolvedFilePath);
    },
    setAppSettings(patch) {
      const currentSettings = readAppSettings(resolvedFilePath);
      const nextSettings = normalizeAppSettings({
        ...currentSettings,
        ...patch,
        interventionThresholdMinutes: patch.interventionThresholdMinutes
          ? { ...currentSettings.interventionThresholdMinutes, ...patch.interventionThresholdMinutes }
          : currentSettings.interventionThresholdMinutes
      });
      writeAppSettings(resolvedFilePath, nextSettings);
      return nextSettings;
    }
  };
}

export function normalizeAppSettings(value: unknown): AppSettings {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_APP_SETTINGS };
  }

  const record = value as Partial<Record<keyof AppSettings, unknown>>;

  return {
    hideToTrayOnClose: typeof record.hideToTrayOnClose === "boolean" ? record.hideToTrayOnClose : DEFAULT_APP_SETTINGS.hideToTrayOnClose,
    showCompletionAnimation: typeof record.showCompletionAnimation === "boolean" ? record.showCompletionAnimation : DEFAULT_APP_SETTINGS.showCompletionAnimation,
    openHistoryInNewWindow: typeof record.openHistoryInNewWindow === "boolean" ? record.openHistoryInNewWindow : DEFAULT_APP_SETTINGS.openHistoryInNewWindow,
    petCharacter: isAppPetCharacter(record.petCharacter) ? record.petCharacter : DEFAULT_APP_SETTINGS.petCharacter,
    interventionThresholdMinutes: normalizeInterventionThresholds(record.interventionThresholdMinutes),
    nightlySummaryEnabled: typeof record.nightlySummaryEnabled === "boolean" ? record.nightlySummaryEnabled : DEFAULT_APP_SETTINGS.nightlySummaryEnabled,
    nightlySummaryTime: normalizeSummaryTime(record.nightlySummaryTime),
    petClickDodgeThreshold: normalizeBoundedInteger(record.petClickDodgeThreshold, DEFAULT_APP_SETTINGS.petClickDodgeThreshold, 3, 30),
    petDodgeDistance: normalizeBoundedInteger(record.petDodgeDistance, DEFAULT_APP_SETTINGS.petDodgeDistance, 40, 320),
    petBurstDodgeThreshold: normalizeBoundedInteger(record.petBurstDodgeThreshold, DEFAULT_APP_SETTINGS.petBurstDodgeThreshold, 4, 60),
    mainQuestByDate: normalizeMainQuestByDate(record.mainQuestByDate)
  };
}

export function toInterventionSettings(settings: AppSettings): InterventionSettings {
  return {
    thresholdMinutes: settings.interventionThresholdMinutes,
    nightlySummary: {
      enabled: settings.nightlySummaryEnabled,
      time: settings.nightlySummaryTime
    }
  };
}

export function isAppPetCharacter(value: unknown): value is AppPetCharacter {
  return typeof value === "string" && (APP_PET_CHARACTERS as readonly string[]).includes(value);
}

function normalizeBoundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.trunc(numericValue)));
}

function normalizeMainQuestByDate(value: unknown): MainQuestByDate {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const normalized: MainQuestByDate = {};
  for (const [planDate, taskIdValue] of Object.entries(value as Record<string, unknown>)) {
    const taskId = typeof taskIdValue === "number" ? taskIdValue : Number(taskIdValue);
    if (/^\d{4}-\d{2}-\d{2}$/.test(planDate) && Number.isSafeInteger(taskId) && taskId > 0) {
      normalized[planDate] = taskId;
    }
  }

  return normalized;
}

function readAppSettings(filePath: string): AppSettings {
  if (!existsSync(filePath)) {
    return { ...DEFAULT_APP_SETTINGS };
  }

  try {
    return normalizeAppSettings(JSON.parse(readFileSync(filePath, "utf8")));
  } catch {
    return { ...DEFAULT_APP_SETTINGS };
  }
}

function writeAppSettings(filePath: string, settings: AppSettings): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}