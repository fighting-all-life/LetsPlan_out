import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const packagedExePath = resolve(projectRoot, "release-win", "win-unpacked", "LetsPlan.exe");

if (process.platform !== "win32") {
  console.error("[package-smoke] Windows packaged smoke test only runs on Windows.");
  process.exit(1);
}

if (!existsSync(packagedExePath)) {
  console.error(`[package-smoke] Packaged exe not found: ${packagedExePath}`);
  console.error("[package-smoke] Run npm run package:win first.");
  process.exit(1);
}

const appDataPath = mkdtempSync(join(tmpdir(), "letsplan-packaged-e2e-"));
const result = await runPackagedApp(appDataPath);
rmSync(appDataPath, { recursive: true, force: true });

const marker = parseE2EMarker(result.stdout);
if (result.exitCode !== 0 || !marker?.ok) {
  console.error(`[package-smoke] ${basename(packagedExePath)} failed smoke verification.`);
  if (marker?.reason) {
    console.error(`[package-smoke] reason: ${marker.reason}`);
  }
  if (result.stdout.trim()) {
    console.error(`[package-smoke] stdout:\n${result.stdout}`);
  }
  if (result.stderr.trim()) {
    console.error(`[package-smoke] stderr:\n${result.stderr}`);
  }
  process.exit(result.exitCode ?? 1);
}

console.log(`[package-smoke] ok ${JSON.stringify(marker)}`);

function runPackagedApp(appDataPath) {
  return new Promise((resolveRun, rejectRun) => {
    const env = {
      ...process.env,
      APPDATA: appDataPath,
      LETSPLAN_E2E: "1"
    };
    delete env.LETSPLAN_UI_URL;
    delete env.ELECTRON_RUN_AS_NODE;

    const child = spawn(packagedExePath, [], {
      cwd: dirname(packagedExePath),
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => {
      fail(new Error(`[package-smoke] timed out.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, 30000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (stderr.includes("App threw an error during load")) {
        fail(new Error(`[package-smoke] app failed during load.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
      }
    });
    child.on("error", fail);
    child.on("close", (exitCode) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolveRun({ exitCode, stdout, stderr });
    });

    function fail(error) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      child.kill();
      rejectRun(error);
    }
  });
}

function parseE2EMarker(stdout) {
  const markerLine = stdout.split(/\r?\n/).find((line) => line.startsWith("[letsplan-e2e] "));
  if (!markerLine) {
    return null;
  }

  return JSON.parse(markerLine.replace("[letsplan-e2e] ", ""));
}

