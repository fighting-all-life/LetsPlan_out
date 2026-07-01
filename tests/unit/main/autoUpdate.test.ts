import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { configureAutoUpdates, type AutoUpdaterLike } from "../../../src/main/autoUpdate.js";

class FakeUpdater implements AutoUpdaterLike {
  autoDownload = false;
  autoInstallOnAppQuit = false;
  feedUrl: unknown = null;
  checked = 0;
  quitAndInstallCalls = 0;
  readonly listeners = new Map<string, (...args: unknown[]) => void>();

  setFeedURL(options: { provider: "generic"; url: string; channel: string }): void {
    this.feedUrl = options;
  }

  async checkForUpdatesAndNotify(): Promise<unknown> {
    this.checked += 1;
    return { ok: true };
  }

  quitAndInstall(): void {
    this.quitAndInstallCalls += 1;
  }

  on(eventName: string, listener: (...args: unknown[]) => void): unknown {
    this.listeners.set(eventName, listener);
    return this;
  }

  emit(eventName: string, ...args: unknown[]): void {
    this.listeners.get(eventName)?.(...args);
  }
}

function createConfigFile(config: string): string {
  const directory = mkdtempSync(join(tmpdir(), "letsplan-auto-update-"));
  const filePath = join(directory, "release-channel.json");
  writeFileSync(filePath, config, "utf8");
  return filePath;
}

describe("configureAutoUpdates", () => {
  it("stays disabled during e2e runs", () => {
    const updater = new FakeUpdater();
    const controller = configureAutoUpdates({
      app: { isPackaged: true, getVersion: () => "0.1.0" },
      configPath: createConfigFile(JSON.stringify({ enabled: true, url: "https://updates.example.com/latest" })),
      isE2E: true,
      updater
    });

    expect(controller).toMatchObject({ enabled: false, reason: "e2e" });
    expect(updater.feedUrl).toBeNull();
  });

  it("configures a packaged app and schedules an update check", () => {
    const updater = new FakeUpdater();
    let scheduled: () => void = () => {
      throw new Error("update check was not scheduled");
    };
    const controller = configureAutoUpdates({
      app: { isPackaged: true, getVersion: () => "0.1.0" },
      configPath: createConfigFile(JSON.stringify({ enabled: true, url: "https://updates.example.com/latest", channel: "latest", checkDelayMs: 0 })),
      updater,
      setTimer: (callback) => {
        scheduled = callback;
        return null;
      },
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined }
    });

    expect(controller.enabled).toBe(true);
    expect(updater.autoDownload).toBe(true);
    expect(updater.autoInstallOnAppQuit).toBe(true);
    expect(updater.feedUrl).toEqual({ provider: "generic", url: "https://updates.example.com/latest/", channel: "latest" });

    scheduled?.();
    expect(updater.checked).toBe(1);
  });

  it("prompts to install downloaded updates", async () => {
    const updater = new FakeUpdater();
    configureAutoUpdates({
      app: { isPackaged: true, getVersion: () => "0.1.0" },
      configPath: createConfigFile(JSON.stringify({ enabled: true, url: "https://updates.example.com/latest" })),
      updater,
      showMessageBox: async () => ({ response: 0 }),
      setTimer: () => null,
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined }
    });

    updater.emit("update-downloaded", { version: "0.2.0" });
    await Promise.resolve();
    await Promise.resolve();

    expect(updater.quitAndInstallCalls).toBe(1);
  });
});
