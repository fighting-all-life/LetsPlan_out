import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scanRoots = ["src", "tests", "scripts"];
const selfPath = resolve(projectRoot, "scripts", "checkStaticQuality.mjs");
const scanExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".html", ".css"]);
const requiredScripts = [
  "quality:static",
  "audit:ui-theme",
  "typecheck",
  "test:unit",
  "test:integration",
  "smoke:pet-drag",
  "smoke:package",
  "smoke:release-artifacts",
  "release:manifest",
  "verify:release:manifest",
  "verify:all",
  "verify:release:artifacts"
];

const forbiddenPatterns = [
  { name: "focused test", pattern: /\b(?:describe|it|test)\.only\s*\(/u },
  { name: "skipped test", pattern: /\b(?:describe|it|test)\.skip\s*\(/u },
  { name: "debugger statement", pattern: /\bdebugger\s*;/u },
  { name: "ts-ignore suppression", pattern: /@ts-ignore/u },
  { name: "replacement character", pattern: /\uFFFD/u },
  { name: "merge conflict marker", pattern: /^(?:<<<<<<<|=======|>>>>>>>)\b/mu },
  { name: "common mojibake fragment", pattern: /(?:锛|鐨|妗|浠诲|璁″|鏃ユ|鍏ㄩ|鏆傛|绱ф|甯歌)/u }
];

const files = scanRoots.flatMap((root) => collectFiles(resolve(projectRoot, root))).sort();
files.push(resolve(projectRoot, "package.json"));

const findings = [];
for (const file of files) {
  if (file === selfPath) {
    continue;
  }
  if (!scanExtensions.has(extname(file)) && file !== resolve(projectRoot, "package.json")) {
    continue;
  }
  const text = readText(file);
  for (const check of forbiddenPatterns) {
    const match = check.pattern.exec(text);
    if (match) {
      findings.push({
        file: toProjectPath(file),
        check: check.name,
        line: getLineNumber(text, match.index)
      });
    }
  }
}

const pkg = JSON.parse(readText(resolve(projectRoot, "package.json")));
for (const scriptName of requiredScripts) {
  if (typeof pkg.scripts?.[scriptName] !== "string" || pkg.scripts[scriptName].trim() === "") {
    findings.push({ file: "package.json", check: `missing script ${scriptName}`, line: 1 });
  }
}

if (!String(pkg.scripts?.["verify:all"] ?? "").includes("quality:static")) {
  findings.push({ file: "package.json", check: "verify:all does not run quality:static", line: 1 });
}

if (!String(pkg.scripts?.["verify:all"] ?? "").includes("audit:ui-theme")) {
  findings.push({ file: "package.json", check: "verify:all does not run audit:ui-theme", line: 1 });
}

if (findings.length > 0) {
  console.error(`[quality-static] failed ${JSON.stringify({ ok: false, findings: findings.slice(0, 20) })}`);
  process.exit(1);
}

console.log(`[quality-static] ok ${JSON.stringify({ ok: true, files: files.length, checks: forbiddenPatterns.length })}`);

function collectFiles(directory) {
  const entries = readdirSync(directory);
  const filesInDirectory = [];
  for (const entry of entries) {
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      filesInDirectory.push(...collectFiles(path));
    } else if (stats.isFile()) {
      filesInDirectory.push(path);
    }
  }
  return filesInDirectory;
}

function readText(file) {
  return readFileSync(file, "utf8").replace(/^\uFEFF/u, "");
}
function toProjectPath(file) {
  return relative(projectRoot, file).replaceAll("\\", "/");
}

function getLineNumber(text, index) {
  return text.slice(0, index).split("\n").length;
}
