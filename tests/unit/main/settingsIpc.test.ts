import type { IpcMainInvokeEvent } from "electron";
import { describe, expect, it } from "vitest";
import { DEFAULT_APP_SETTINGS } from "../../../src/main/appSettings.js";
import { SETTINGS_IPC_CHANNELS } from "../../../src/main/ipcChannels.js";
import type { IpcMainLike, SettingsApiLike } from "../../../src/main/settingsIpc.js";
import { registerSettingsIpcHandlers } from "../../../src/main/settingsIpc.js";

class FakeIpcMain implements IpcMainLike {
  readonly handlers = new Map<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown>();

  handle(channel: string, listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown): void {
    this.handlers.set(channel, listener);
  }

  removeHandler(channel: string): void {
    this.handlers.delete(channel);
  }

  invoke(channel: string, ...args: unknown[]): unknown {
    const handler = this.handlers.get(channel);
    if (!handler) {
      throw new Error(`No handler registered for ${channel}.`);
    }

    return handler({} as IpcMainInvokeEvent, ...args);
  }
}

function createFakeApi(): SettingsApiLike & { calls: string[] } {
  const calls: string[] = [];

  return {
    calls,
    getAutoLaunchSettings() {
      calls.push("getAutoLaunchSettings");
      return {
        openAtLogin: false,
        path: "C:\Program Files\LetsPlan\LetsPlan.exe",
        args: []
      };
    },
    setAutoLaunchOpenAtLogin(openAtLogin: boolean) {
      calls.push(`setAutoLaunchOpenAtLogin:${openAtLogin}`);
      return {
        openAtLogin,
        path: "C:\Program Files\LetsPlan\LetsPlan.exe",
        args: []
      };
    },
    getAppSettings() {
      calls.push("getAppSettings");
      return { ...DEFAULT_APP_SETTINGS };
    },
    setAppSettings(patch) {
      calls.push(`setAppSettings:${JSON.stringify(patch)}`);
      return {
        ...DEFAULT_APP_SETTINGS,
        ...patch,
        interventionThresholdMinutes: {
          ...DEFAULT_APP_SETTINGS.interventionThresholdMinutes,
          ...patch.interventionThresholdMinutes
        }
      };
    }
  };
}

describe("registerSettingsIpcHandlers", () => {
  it("registers and disposes settings channels", () => {
    const ipcMain = new FakeIpcMain();
    const api = createFakeApi();

    const registration = registerSettingsIpcHandlers(ipcMain, api);

    expect([...ipcMain.handlers.keys()].sort()).toEqual(Object.values(SETTINGS_IPC_CHANNELS).sort());

    registration.dispose();

    expect(ipcMain.handlers.size).toBe(0);
  });

  it("routes auto launch settings requests", () => {
    const ipcMain = new FakeIpcMain();
    const api = createFakeApi();

    registerSettingsIpcHandlers(ipcMain, api);

    expect(ipcMain.invoke(SETTINGS_IPC_CHANNELS.getAutoLaunchSettings)).toMatchObject({ openAtLogin: false });
    expect(ipcMain.invoke(SETTINGS_IPC_CHANNELS.setAutoLaunchOpenAtLogin, true)).toMatchObject({ openAtLogin: true });
    expect(api.calls).toEqual(["getAutoLaunchSettings", "setAutoLaunchOpenAtLogin:true"]);
  });

  it("routes app behavior settings requests", () => {
    const ipcMain = new FakeIpcMain();
    const api = createFakeApi();

    registerSettingsIpcHandlers(ipcMain, api);

    expect(ipcMain.invoke(SETTINGS_IPC_CHANNELS.getAppSettings)).toMatchObject({ hideToTrayOnClose: true });
    expect(ipcMain.invoke(SETTINGS_IPC_CHANNELS.setAppSettings, { showCompletionAnimation: false })).toMatchObject({
      showCompletionAnimation: false
    });
    expect(api.calls).toEqual(["getAppSettings", 'setAppSettings:{"showCompletionAnimation":false}']);

    expect(ipcMain.invoke(SETTINGS_IPC_CHANNELS.setAppSettings, { petCharacter: "dog" })).toMatchObject({
      petCharacter: "dog"
    });
  });

  it("routes intervention threshold and nightly summary settings", () => {
    const ipcMain = new FakeIpcMain();
    const api = createFakeApi();

    registerSettingsIpcHandlers(ipcMain, api);

    expect(ipcMain.invoke(SETTINGS_IPC_CHANNELS.setAppSettings, {
      interventionThresholdMinutes: { l1: 5, l2: 15, l3: 25, l4: 35 },
      nightlySummaryEnabled: false,
      nightlySummaryTime: "22:20",
      petClickDodgeThreshold: 12,
      petDodgeDistance: 180,
      petBurstDodgeThreshold: 18,
      mainQuestByDate: { "2026-07-04": 2 }
    })).toMatchObject({
      interventionThresholdMinutes: { l1: 5, l2: 15, l3: 25, l4: 35 },
      nightlySummaryEnabled: false,
      nightlySummaryTime: "22:20",
      petClickDodgeThreshold: 12,
      petDodgeDistance: 180,
      petBurstDodgeThreshold: 18,
      mainQuestByDate: { "2026-07-04": 2 }
    });
  });

  it("notifies app settings changes", () => {
    const ipcMain = new FakeIpcMain();
    const api = createFakeApi();
    const changedSettings: unknown[] = [];

    registerSettingsIpcHandlers(ipcMain, api, { onAppSettingsChanged: (settings) => changedSettings.push(settings) });

    const nextSettings = ipcMain.invoke(SETTINGS_IPC_CHANNELS.setAppSettings, { petCharacter: "robot" });

    expect(changedSettings).toEqual([nextSettings]);
  });

  it("rejects malformed settings payloads", () => {
    const ipcMain = new FakeIpcMain();
    const api = createFakeApi();

    registerSettingsIpcHandlers(ipcMain, api);

    expect(() => ipcMain.invoke(SETTINGS_IPC_CHANNELS.setAutoLaunchOpenAtLogin, "true")).toThrow("openAtLogin must be a boolean");
    expect(() => ipcMain.invoke(SETTINGS_IPC_CHANNELS.setAppSettings, null)).toThrow("settings patch must be an object");
    expect(() => ipcMain.invoke(SETTINGS_IPC_CHANNELS.setAppSettings, { hideToTrayOnClose: "yes" })).toThrow("hideToTrayOnClose must be a boolean");
    expect(() => ipcMain.invoke(SETTINGS_IPC_CHANNELS.setAppSettings, { petCharacter: "bird" })).toThrow("petCharacter must be cat, dog or robot");
    expect(() => ipcMain.invoke(SETTINGS_IPC_CHANNELS.setAppSettings, { interventionThresholdMinutes: [] })).toThrow("interventionThresholdMinutes must be an object");
    expect(() => ipcMain.invoke(SETTINGS_IPC_CHANNELS.setAppSettings, { interventionThresholdMinutes: { l1: 0 } })).toThrow("interventionThresholdMinutes.l1 must be a positive number");
    expect(() => ipcMain.invoke(SETTINGS_IPC_CHANNELS.setAppSettings, { nightlySummaryTime: "25:00" })).toThrow("nightlySummaryTime must be HH:mm");
    expect(() => ipcMain.invoke(SETTINGS_IPC_CHANNELS.setAppSettings, { nightlySummaryEnabled: "yes" })).toThrow("nightlySummaryEnabled must be a boolean");
    expect(() => ipcMain.invoke(SETTINGS_IPC_CHANNELS.setAppSettings, { petClickDodgeThreshold: 2 })).toThrow("petClickDodgeThreshold must be a number from 3 to 30");
    expect(() => ipcMain.invoke(SETTINGS_IPC_CHANNELS.setAppSettings, { petDodgeDistance: 321 })).toThrow("petDodgeDistance must be a number from 40 to 320");
    expect(() => ipcMain.invoke(SETTINGS_IPC_CHANNELS.setAppSettings, { petBurstDodgeThreshold: 3 })).toThrow("petBurstDodgeThreshold must be a number from 4 to 60");
    expect(() => ipcMain.invoke(SETTINGS_IPC_CHANNELS.setAppSettings, { mainQuestByDate: [] })).toThrow("mainQuestByDate must be an object");
    expect(() => ipcMain.invoke(SETTINGS_IPC_CHANNELS.setAppSettings, { mainQuestByDate: { bad: 1 } })).toThrow("mainQuestByDate keys must use YYYY-MM-DD");
    expect(() => ipcMain.invoke(SETTINGS_IPC_CHANNELS.setAppSettings, { mainQuestByDate: { "2026-07-04": 0 } })).toThrow("mainQuestByDate.2026-07-04 must be a positive integer");
    expect(api.calls).toEqual([]);
  });
});
