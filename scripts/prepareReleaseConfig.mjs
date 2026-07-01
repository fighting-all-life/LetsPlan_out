import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const args = new Set(process.argv.slice(2));
const configPath = resolve(projectRoot, "dist", "release-channel.json");

if (args.has("--disabled")) {
  writeConfig({
    enabled: false,
    provider: "generic",
    url: null,
    channel: process.env.LETSPLAN_RELEASE_CHANNEL || "latest",
    autoDownload: true,
    checkDelayMs: 10000,
    generatedAt: new Date().toISOString()
  });
  console.log(`[release-config] wrote disabled ${configPath}`);
  process.exit(0);
}

const updateUrl = normalizeUpdateUrl(requireEnv("LETSPLAN_UPDATE_URL"));
const channel = normalizeChannel(process.env.LETSPLAN_RELEASE_CHANNEL || "latest");
const checkDelayMs = normalizeDelay(process.env.LETSPLAN_UPDATE_CHECK_DELAY_MS);

if (args.has("--require-signing")) {
  assertSigningEnvironment();
}

writeConfig({
  enabled: true,
  provider: "generic",
  url: updateUrl,
  channel,
  autoDownload: true,
  checkDelayMs,
  generatedAt: new Date().toISOString()
});
console.log(`[release-config] wrote ${configPath}`);
console.log(`[release-config] channel=${channel} url=${updateUrl}`);

function writeConfig(config) {
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function assertSigningEnvironment() {
  const certificateLink = process.env.WIN_CSC_LINK || process.env.CSC_LINK;
  const certificatePassword = process.env.WIN_CSC_KEY_PASSWORD || process.env.CSC_KEY_PASSWORD;

  if (!certificateLink || !certificatePassword) {
    throw new Error("Windows code signing requires WIN_CSC_LINK/CSC_LINK and WIN_CSC_KEY_PASSWORD/CSC_KEY_PASSWORD.");
  }

  if (!isLikelyRemote(certificateLink) && !isLikelyBase64(certificateLink) && !existsSync(resolve(projectRoot, certificateLink)) && !existsSync(certificateLink)) {
    throw new Error(`Code signing certificate path does not exist: ${certificateLink}`);
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`${name} is required for a formal release.`);
  }
  return value.trim();
}

function normalizeUpdateUrl(value) {
  const parsedUrl = new URL(value);
  const allowInsecure = process.env.LETSPLAN_ALLOW_INSECURE_UPDATE_URL === "1";
  const isLocalhost = parsedUrl.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname);
  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "file:" && !isLocalhost && !allowInsecure) {
    throw new Error("LETSPLAN_UPDATE_URL must use https://. For localhost/file testing set a localhost or file URL; for other HTTP set LETSPLAN_ALLOW_INSECURE_UPDATE_URL=1.");
  }
  return parsedUrl.toString().endsWith("/") ? parsedUrl.toString() : `${parsedUrl.toString()}/`;
}

function normalizeChannel(value) {
  const channel = value.trim();
  if (!/^[a-z0-9][a-z0-9._-]{0,31}$/i.test(channel)) {
    throw new Error(`Invalid release channel: ${value}`);
  }
  return channel;
}

function normalizeDelay(value) {
  if (!value) {
    return 10000;
  }
  const delay = Number(value);
  if (!Number.isFinite(delay) || delay < 0) {
    throw new Error(`Invalid LETSPLAN_UPDATE_CHECK_DELAY_MS: ${value}`);
  }
  return Math.trunc(delay);
}

function isLikelyRemote(value) {
  return /^https?:\/\//i.test(value);
}

function isLikelyBase64(value) {
  return value.length > 256 && /^[A-Za-z0-9+/=\r\n]+$/.test(value);
}
