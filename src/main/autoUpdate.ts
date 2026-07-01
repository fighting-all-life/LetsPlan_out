import type { App } from "electron";
import { createRequire } from "node:module";
import { getDisabledReleaseChannelConfig, readReleaseChannelConfig, type ReleaseChannelConfig } from "./releaseChannel.js";

type ElectronUpdaterModule = typeof import("electron-updater");
const require = createRequire(import.meta.url);
const electron = require("electron") as typeof import("electron");

export interface AutoUpdateController {
  enabled: boolean;
  reason?: string;
  checkNow(): Promise<unknown>;
}

export interface AutoUpdateOptions {
  app: Pick<App, "isPackaged" | "getVersion">;
  configPath: string;
  isE2E?: boolean;
  updater?: AutoUpdaterLike;
  showMessageBox?: ShowMessageBox;
  setTimer?: (callback: () => void, delayMs: number) => unknown;
  logger?: Pick<Console, "info" | "warn" | "error">;
}

export interface AutoUpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  setFeedURL(options: { provider: "generic"; url: string; channel: string }): void;
  checkForUpdatesAndNotify(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
  on(eventName: string, listener: (...args: unknown[]) => void): unknown;
}

export type ShowMessageBox = (options: {
  type: "info";
  buttons: string[];
  defaultId: number;
  cancelId: number;
  title: string;
  message: string;
  detail: string;
}) => Promise<{ response: number }>;

export function configureAutoUpdates(options: AutoUpdateOptions): AutoUpdateController {
  const logger = options.logger ?? console;

  if (options.isE2E) {
    return createDisabledController("e2e");
  }

  let config: ReleaseChannelConfig;
  try {
    config = readReleaseChannelConfig(options.configPath);
  } catch (error: unknown) {
    logger.error(`[letsplan-update] ${getErrorMessage(error)}`);
    return createDisabledController("invalid-config");
  }

  if (!config.enabled) {
    return createDisabledController("disabled");
  }

  if (!options.app.isPackaged && process.env.LETSPLAN_ENABLE_AUTO_UPDATE !== "1") {
    logger.info("[letsplan-update] skipped outside packaged app");
    return createDisabledController("not-packaged");
  }

  const updater = options.updater ?? loadElectronAutoUpdater();
  const showMessageBox = options.showMessageBox ?? electron.dialog?.showMessageBox?.bind(electron.dialog) ?? createNoopMessageBox;
  const setTimer = options.setTimer ?? setTimeout;

  updater.autoDownload = config.autoDownload;
  updater.autoInstallOnAppQuit = true;
  updater.setFeedURL({
    provider: config.provider,
    url: config.url ?? getDisabledReleaseChannelConfig().url ?? "",
    channel: config.channel
  });

  wireAutoUpdateEvents(updater, showMessageBox, logger);

  const checkNow = async () => updater.checkForUpdatesAndNotify();
  setTimer(() => {
    void checkNow().catch((error: unknown) => {
      logger.warn(`[letsplan-update] check failed: ${getErrorMessage(error)}`);
    });
  }, config.checkDelayMs);

  logger.info(`[letsplan-update] enabled channel=${config.channel} url=${config.url}`);
  return {
    enabled: true,
    checkNow
  };
}

function wireAutoUpdateEvents(updater: AutoUpdaterLike, showMessageBox: ShowMessageBox, logger: Pick<Console, "info" | "warn" | "error">): void {
  updater.on("checking-for-update", () => {
    logger.info("[letsplan-update] checking");
  });
  updater.on("update-available", (info) => {
    logger.info(`[letsplan-update] update available ${formatVersionInfo(info)}`);
  });
  updater.on("update-not-available", (info) => {
    logger.info(`[letsplan-update] no update ${formatVersionInfo(info)}`);
  });
  updater.on("download-progress", (progress) => {
    if (isProgressInfo(progress)) {
      logger.info(`[letsplan-update] downloading ${Math.round(progress.percent)}%`);
    }
  });
  updater.on("error", (error) => {
    logger.warn(`[letsplan-update] ${getErrorMessage(error)}`);
  });
  updater.on("update-downloaded", (info) => {
    logger.info(`[letsplan-update] downloaded ${formatVersionInfo(info)}`);
    void showMessageBox({
      type: "info",
      buttons: ["\u7acb\u5373\u91cd\u542f\u5b89\u88c5", "\u7a0d\u540e"],
      defaultId: 0,
      cancelId: 1,
      title: "LetsPlan \u66f4\u65b0\u5df2\u5c31\u7eea",
      message: "LetsPlan \u65b0\u7248\u672c\u5df2\u4e0b\u8f7d\u5b8c\u6210",
      detail: "\u91cd\u542f\u5e94\u7528\u540e\u5c06\u81ea\u52a8\u5b8c\u6210\u5b89\u88c5\u3002"
    }).then(({ response }) => {
      if (response === 0) {
        updater.quitAndInstall(false, true);
      }
    }).catch((error: unknown) => {
      logger.warn(`[letsplan-update] update prompt failed: ${getErrorMessage(error)}`);
    });
  });
}

const createNoopMessageBox: ShowMessageBox = async () => ({ response: 1 });

function loadElectronAutoUpdater(): AutoUpdaterLike {
  return (require("electron-updater") as ElectronUpdaterModule).autoUpdater as AutoUpdaterLike;
}

function createDisabledController(reason: string): AutoUpdateController {
  return {
    enabled: false,
    reason,
    checkNow: async () => null
  };
}

function formatVersionInfo(info: unknown): string {
  if (typeof info === "object" && info !== null && "version" in info && typeof (info as { version?: unknown }).version === "string") {
    return (info as { version: string }).version;
  }
  return "unknown";
}

function isProgressInfo(value: unknown): value is { percent: number } {
  return typeof value === "object" && value !== null && "percent" in value && typeof (value as { percent?: unknown }).percent === "number";
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
