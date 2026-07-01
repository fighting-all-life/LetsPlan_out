import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const configPath = resolve(projectRoot, "dist", "release-channel.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));
const channel = config.channel || "latest";
const stageDirectory = resolve(projectRoot, "release-channel", "win", channel);
const latestPath = resolve(stageDirectory, "latest.yml");

if (!existsSync(latestPath)) {
  throw new Error(`Missing staged latest.yml: ${latestPath}`);
}

const latest = readFileSync(latestPath, "utf8");
const artifactName = matchValue(latest, /^path:\s*(.+)$/m) || matchValue(latest, /^\s*-\s*url:\s*(.+)$/m);
const sha512Value = matchValue(latest, /^sha512:\s*(.+)$/m);
if (!artifactName || !sha512Value) {
  throw new Error("latest.yml does not contain path/url and sha512.");
}

const installerPath = resolve(stageDirectory, artifactName.trim());
const blockmapPath = resolve(stageDirectory, `${basename(installerPath)}.blockmap`);
if (!existsSync(installerPath)) {
  throw new Error(`Missing staged installer: ${installerPath}`);
}
if (!existsSync(blockmapPath)) {
  throw new Error(`Missing staged blockmap: ${blockmapPath}`);
}

const actualSha512 = createHash("sha512").update(readFileSync(installerPath)).digest("base64");
if (actualSha512 !== sha512Value.trim()) {
  throw new Error("Staged installer sha512 does not match latest.yml.");
}

console.log(`[release-channel] ok ${JSON.stringify({ channel, installer: basename(installerPath), blockmap: basename(blockmapPath) })}`);

function matchValue(text, pattern) {
  const match = text.match(pattern);
  return match ? match[1] : null;
}
