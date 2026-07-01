import { describe, expect, it } from "vitest";
import {
  configureAutoLaunch,
  getAutoLaunchSettings,
  setAutoLaunchOpenAtLogin,
  type LoginItemSettings
} from "../../../src/main/autoLaunch.js";

class FakeApp {
  readonly configuredSettings: LoginItemSettings[] = [];
  currentSettings: Partial<LoginItemSettings> = { openAtLogin: false };

  getPath(name: "exe"): string {
    expect(name).toBe("exe");
    return "C:\\Program Files\\LetsPlan\\LetsPlan.exe";
  }

  getLoginItemSettings(): Partial<LoginItemSettings> {
    return this.currentSettings;
  }

  setLoginItemSettings(settings: LoginItemSettings): void {
    this.currentSettings = settings;
    this.configuredSettings.push(settings);
  }
}

describe("auto launch settings", () => {
  it("enables launch at login with the app executable by default", () => {
    const app = new FakeApp();

    const settings = configureAutoLaunch(app);

    expect(settings).toEqual({
      openAtLogin: true,
      path: "C:\\Program Files\\LetsPlan\\LetsPlan.exe"
    });
    expect(app.configuredSettings).toEqual([settings]);
  });

  it("supports explicit paths, args, and disabling launch at login", () => {
    const app = new FakeApp();

    const settings = configureAutoLaunch(app, {
      openAtLogin: false,
      executablePath: "D:\\Apps\\LetsPlan.exe",
      args: ["--hidden"]
    });

    expect(settings).toEqual({
      openAtLogin: false,
      path: "D:\\Apps\\LetsPlan.exe",
      args: ["--hidden"]
    });
    expect(app.configuredSettings).toEqual([settings]);
  });

  it("reads current login item settings", () => {
    const app = new FakeApp();
    app.currentSettings = {
      openAtLogin: true,
      path: "D:\\Apps\\LetsPlan.exe",
      args: ["--from-login"]
    };

    expect(getAutoLaunchSettings(app)).toEqual({
      openAtLogin: true,
      path: "D:\\Apps\\LetsPlan.exe",
      args: ["--from-login"]
    });
  });

  it("sets openAtLogin and returns normalized state", () => {
    const app = new FakeApp();

    const settings = setAutoLaunchOpenAtLogin(app, true, {
      executablePath: "D:\\Apps\\LetsPlan.exe",
      args: ["--hidden"]
    });

    expect(settings).toEqual({
      openAtLogin: true,
      path: "D:\\Apps\\LetsPlan.exe",
      args: ["--hidden"]
    });
    expect(app.configuredSettings).toEqual([
      {
        openAtLogin: true,
        path: "D:\\Apps\\LetsPlan.exe",
        args: ["--hidden"]
      }
    ]);
  });
});
