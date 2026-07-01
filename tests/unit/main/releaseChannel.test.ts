import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeReleaseChannelConfig, readReleaseChannelConfig } from "../../../src/main/releaseChannel.js";

describe("release channel config", () => {
  it("defaults to disabled when the config file is missing", () => {
    expect(readReleaseChannelConfig(join(tmpdir(), "letsplan-missing-release-channel.json"))).toMatchObject({
      enabled: false,
      provider: "generic",
      channel: "latest"
    });
  });

  it("normalizes enabled generic update channels", () => {
    expect(normalizeReleaseChannelConfig({
      enabled: true,
      provider: "generic",
      url: "https://updates.example.com/letsplan/win/latest",
      channel: "stable",
      autoDownload: false,
      checkDelayMs: 200
    })).toEqual({
      enabled: true,
      provider: "generic",
      url: "https://updates.example.com/letsplan/win/latest/",
      channel: "stable",
      autoDownload: false,
      checkDelayMs: 200
    });
  });

  it("rejects enabled configs without a safe url", () => {
    expect(() => normalizeReleaseChannelConfig({ enabled: true })).toThrow("url is missing");
    expect(() => normalizeReleaseChannelConfig({ enabled: true, url: "http://updates.example.com/latest" })).toThrow("must use https");
  });

  it("reads configured channels from disk", () => {
    const directory = mkdtempSync(join(tmpdir(), "letsplan-release-channel-"));
    const filePath = join(directory, "release-channel.json");
    writeFileSync(filePath, JSON.stringify({ enabled: true, url: "file:///C:/letsplan-updates", checkDelayMs: 0 }), "utf8");

    expect(readReleaseChannelConfig(filePath)).toMatchObject({
      enabled: true,
      url: "file:///C:/letsplan-updates/",
      channel: "latest",
      checkDelayMs: 0
    });
  });
});
