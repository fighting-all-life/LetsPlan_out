import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const DEFAULT_RELEASE_CHANNEL = "latest";
export const DEFAULT_AUTO_UPDATE_CHECK_DELAY_MS = 10000;

export interface ReleaseChannelConfig {
  enabled: boolean;
  provider: "generic";
  url: string | null;
  channel: string;
  autoDownload: boolean;
  checkDelayMs: number;
}

export function getReleaseChannelConfigPath(currentDirectory: string): string {
  return join(currentDirectory, "../../release-channel.json");
}

export function readReleaseChannelConfig(filePath: string): ReleaseChannelConfig {
  if (!existsSync(filePath)) {
    return getDisabledReleaseChannelConfig();
  }

  return normalizeReleaseChannelConfig(JSON.parse(readFileSync(filePath, "utf8")) as unknown);
}

export function getDisabledReleaseChannelConfig(): ReleaseChannelConfig {
  return {
    enabled: false,
    provider: "generic",
    url: null,
    channel: DEFAULT_RELEASE_CHANNEL,
    autoDownload: true,
    checkDelayMs: DEFAULT_AUTO_UPDATE_CHECK_DELAY_MS
  };
}

export function normalizeReleaseChannelConfig(input: unknown): ReleaseChannelConfig {
  if (!isRecord(input)) {
    return getDisabledReleaseChannelConfig();
  }

  const enabled = input.enabled === true;
  const provider = input.provider === "generic" ? "generic" : "generic";
  const channel = typeof input.channel === "string" && input.channel.trim() ? input.channel.trim() : DEFAULT_RELEASE_CHANNEL;
  const autoDownload = typeof input.autoDownload === "boolean" ? input.autoDownload : true;
  const checkDelayMs = normalizeDelay(input.checkDelayMs);
  const url = typeof input.url === "string" && input.url.trim() ? normalizeUpdateUrl(input.url) : null;

  if (!enabled) {
    return {
      enabled: false,
      provider,
      url,
      channel,
      autoDownload,
      checkDelayMs
    };
  }

  if (!url) {
    throw new Error("Auto update is enabled but release channel url is missing.");
  }

  return {
    enabled,
    provider,
    url,
    channel,
    autoDownload,
    checkDelayMs
  };
}

export function normalizeUpdateUrl(url: string): string {
  const parsedUrl = new URL(url.trim());
  if (!isAllowedUpdateUrl(parsedUrl)) {
    throw new Error("Release channel url must use https, file, or localhost http.");
  }

  return parsedUrl.toString().endsWith("/") ? parsedUrl.toString() : `${parsedUrl.toString()}/`;
}

function normalizeDelay(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_AUTO_UPDATE_CHECK_DELAY_MS;
  }

  return Math.max(0, Math.trunc(value));
}

function isAllowedUpdateUrl(parsedUrl: URL): boolean {
  if (parsedUrl.protocol === "https:" || parsedUrl.protocol === "file:") {
    return true;
  }

  return parsedUrl.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
