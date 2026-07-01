import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const releaseDir = resolve(projectRoot, "release-win");

// Read version from package.json
const pkg = JSON.parse(readFileSync(resolve(projectRoot, "package.json"), "utf8"));
const version = pkg.version;
const productName = pkg.build.productName;

if (!existsSync(releaseDir)) {
  console.error("[package-zip] release-win directory not found. Run dist:win or dist:win:all first.");
  process.exit(1);
}

// Find installer files
const files = readdirSync(releaseDir);
const nsisExe = files.find(f => f.endsWith(".exe") && !f.startsWith("."));
const msiFile = files.find(f => f.endsWith(".msi") && !f.startsWith("."));
const unpackedDir = join(releaseDir, "win-unpacked");

if (!nsisExe) {
  console.error("[package-zip] No NSIS installer found in release-win.");
  process.exit(1);
}

console.log(`[package-zip] Product: ${productName} v${version}`);
console.log(`[package-zip] NSIS: ${nsisExe}`);
if (msiFile) console.log(`[package-zip] MSI:  ${msiFile}`);

const zipName = `${productName}-${version}-win-x64.zip`;
const zipPath = join(releaseDir, zipName);

// Remove existing zip
if (existsSync(zipPath)) {
  runPS(`Remove-Item -LiteralPath '${esc(zipPath)}' -Force`);
  console.log(`[package-zip] Removed existing ${zipName}`);
}

// Create staging directory
const staging = join(releaseDir, `.zip-staging-${process.pid}`);
try {
  // Create structure: 安装版/ + 免安装版/
  const installerStaging = join(staging, "安装版");
  const portableStaging = join(staging, "免安装版");
  runPS(`New-Item -ItemType Directory -Force -Path '${esc(installerStaging)}', '${esc(portableStaging)}'`);

  // Copy NSIS installer
  copyFile(join(releaseDir, nsisExe), join(installerStaging, nsisExe));
  console.log(`[package-zip]   + 安装版/${nsisExe}`);

  // Copy MSI installer if exists
  if (msiFile) {
    copyFile(join(releaseDir, msiFile), join(installerStaging, msiFile));
    console.log(`[package-zip]   + 安装版/${msiFile}`);
  }

  // Copy unpacked (portable) directory
  if (existsSync(unpackedDir)) {
    runPS(`Copy-Item -LiteralPath '${esc(unpackedDir)}\\*' -Destination '${esc(portableStaging)}\\' -Recurse -Force`);
    console.log(`[package-zip]   + 免安装版/ (${productName}.exe + runtime)`);
  }

  // Create zip
  console.log(`[package-zip] Creating ${zipName} ...`);
  runPS(`Compress-Archive -LiteralPath '${esc(staging)}\\*' -DestinationPath '${esc(zipPath)}' -Force`);

  const sizeMB = (statSync(zipPath).size / (1024 * 1024)).toFixed(1);
  console.log(`[package-zip] ✅ ${zipName} (${sizeMB} MB)`);
  console.log(`[package-zip]    ${zipPath}`);

} finally {
  // Cleanup staging
  try { runPS(`Remove-Item -LiteralPath '${esc(staging)}' -Recurse -Force`); } catch { /* ok */ }
}

// --- helpers ---

function copyFile(src, dst) {
  runPS(`Copy-Item -LiteralPath '${esc(src)}' -Destination '${esc(dst)}'`);
}

function runPS(cmd) {
  execSync(`powershell -NoProfile -Command "${cmd.replace(/"/g, '\\"')}"`, {
    encoding: "utf8",
    cwd: releaseDir,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function esc(p) {
  return p.replace(/'/g, "''");
}
