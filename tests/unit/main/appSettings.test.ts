import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_APP_SETTINGS, createAppSettingsStore, normalizeAppSettings, toInterventionSettings } from "../../../src/main/appSettings.js";

const tempPaths: string[] = [];

afterEach(() => {
  for (const tempPath of tempPaths.splice(0)) {
    rmSync(tempPath, { recursive: true, force: true });
  }
});

describe("app settings", () => {
  it("normalizes missing and malformed settings", () => {
    expect(normalizeAppSettings(null)).toEqual(DEFAULT_APP_SETTINGS);

    expect(normalizeAppSettings({
      hideToTrayOnClose: false,
      showCompletionAnimation: "no",
      petCharacter: "dog",
      interventionThresholdMinutes: { l1: 0, l2: 12, l3: 12, l4: 400 },
      nightlySummaryEnabled: false,
      nightlySummaryTime: "22:15",
      petClickDodgeThreshold: 2,
      petDodgeDistance: 400,
      petBurstDodgeThreshold: 99
    })).toMatchObject({
      hideToTrayOnClose: false,
      showCompletionAnimation: true,
      openHistoryInNewWindow: true,
      petCharacter: "dog",
      interventionThresholdMinutes: { l1: 1, l2: 12, l3: 13, l4: 240 },
      nightlySummaryEnabled: false,
      nightlySummaryTime: "22:15",
      petClickDodgeThreshold: 3,
      petDodgeDistance: 320,
      petBurstDodgeThreshold: 60
    });
  });

  it("persists app behavior settings", () => {
    const userDataPath = mkdtempSync(join(tmpdir(), "letsplan-settings-"));
    tempPaths.push(userDataPath);

    const store = createAppSettingsStore({ getPath: () => userDataPath });

    expect(store.getAppSettings()).toMatchObject({ hideToTrayOnClose: true, petCharacter: "cat" });
    expect(store.setAppSettings({
      hideToTrayOnClose: false,
      showCompletionAnimation: false,
      petCharacter: "robot",
      interventionThresholdMinutes: { l2: 25 },
      nightlySummaryEnabled: false,
      nightlySummaryTime: "22:10",
      petClickDodgeThreshold: 12,
      petDodgeDistance: 180,
      petBurstDodgeThreshold: 18
    })).toMatchObject({
      hideToTrayOnClose: false,
      showCompletionAnimation: false,
      openHistoryInNewWindow: true,
      petCharacter: "robot",
      interventionThresholdMinutes: { l1: 10, l2: 25, l3: 30, l4: 40 },
      nightlySummaryEnabled: false,
      nightlySummaryTime: "22:10",
      petClickDodgeThreshold: 12,
      petDodgeDistance: 180,
      petBurstDodgeThreshold: 18
    });
    expect(createAppSettingsStore({ getPath: () => userDataPath }).getAppSettings()).toMatchObject({
      hideToTrayOnClose: false,
      showCompletionAnimation: false,
      petCharacter: "robot",
      interventionThresholdMinutes: { l2: 25 },
      nightlySummaryTime: "22:10",
      petClickDodgeThreshold: 12,
      petDodgeDistance: 180,
      petBurstDodgeThreshold: 18
    });
  });

  it("maps settings into intervention runtime settings", () => {
    expect(toInterventionSettings({ ...DEFAULT_APP_SETTINGS, nightlySummaryTime: "23:00" })).toEqual({
      thresholdMinutes: DEFAULT_APP_SETTINGS.interventionThresholdMinutes,
      nightlySummary: { enabled: true, time: "23:00" }
    });
  });
});
