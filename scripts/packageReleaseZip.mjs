import { execSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const releaseDir = resolve(projectRoot, "release-win");
const pkg = JSON.parse(readFileSync(resolve(projectRoot, "package.json"), "utf8"));
const version = pkg.version;
const productName = pkg.build.productName;

if (!existsSync(releaseDir)) {
  console.error("[package-zip] release-win directory not found. Run dist:win or dist:win:all first.");
  process.exit(1);
}

const nsisExe = `${productName}-${version}-win-x64.exe`;
const msiFile = `${productName}-${version}-win-x64.msi`;
const unpackedDir = join(releaseDir, "win-unpacked");
const zipName = `${productName}-${version}-win-x64.zip`;
const zipPath = join(releaseDir, zipName);

assertFile(join(releaseDir, nsisExe), "NSIS installer");
const hasMsi = existsSync(join(releaseDir, msiFile));
if (!existsSync(unpackedDir)) {
  console.error("[package-zip] Missing win-unpacked portable directory.");
  process.exit(1);
}

console.log(`[package-zip] Product: ${productName} v${version}`);
console.log(`[package-zip] NSIS: ${nsisExe}`);
if (hasMsi) {
  console.log(`[package-zip] MSI:  ${msiFile}`);
}

if (existsSync(zipPath)) {
  runPS(`Remove-Item -LiteralPath '${esc(zipPath)}' -Force`);
  console.log(`[package-zip] Removed existing ${zipName}`);
}

const staging = join(releaseDir, `.zip-staging-${process.pid}`);
try {
  const installerStaging = join(staging, "installer");
  const portableStaging = join(staging, "portable");
  runPS(`New-Item -ItemType Directory -Force -Path '${esc(installerStaging)}', '${esc(portableStaging)}'`);

  copyFile(join(releaseDir, nsisExe), join(installerStaging, nsisExe));
  console.log(`[package-zip]   + installer/${nsisExe}`);

  if (hasMsi) {
    copyFile(join(releaseDir, msiFile), join(installerStaging, msiFile));
    console.log(`[package-zip]   + installer/${msiFile}`);
  }

  runPS(`Copy-Item -Path '${esc(unpackedDir)}\\*' -Destination '${esc(portableStaging)}\\' -Recurse -Force`);
  console.log(`[package-zip]   + portable/ (${productName}.exe + runtime)`);

  console.log(`[package-zip] Creating ${zipName} ...`);
  runPS(`Compress-Archive -Path '${esc(staging)}\\*' -DestinationPath '${esc(zipPath)}' -Force`);
  assertFile(zipPath, "release zip");

  const sizeMB = (statSync(zipPath).size / (1024 * 1024)).toFixed(1);
  console.log(`[package-zip] ok ${zipName} (${sizeMB} MB)`);
  console.log(`[package-zip]    ${zipPath}`);
} finally {
  try {
    runPS(`Remove-Item -LiteralPath '${esc(staging)}' -Recurse -Force`);
  } catch {
    // Best-effort cleanup only.
  }
}

function assertFile(path, label) {
  if (!existsSync(path)) {
    console.error(`[package-zip] Missing ${label}: ${path}`);
    process.exit(1);
  }
}

function copyFile(src, dst) {
  runPS(`Copy-Item -LiteralPath '${esc(src)}' -Destination '${esc(dst)}'`);
}

function runPS(cmd) {
  execSync(`powershell -NoProfile -Command "${cmd.replace(/"/g, '\\"')}"`, {
    encoding: "utf8",
    cwd: releaseDir,
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function esc(path) {
  return path.replace(/'/g, "''");
}