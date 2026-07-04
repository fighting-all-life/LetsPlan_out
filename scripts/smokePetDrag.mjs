import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const electronPath = require("electron");
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const appDataPath = mkdtempSync(join(tmpdir(), "letsplan-pet-drag-e2e-"));

try {
  const result = await runElectron();
  const marker = parseMarker(result.stdout);
  if (result.exitCode !== 0 || !marker?.ok) {
    console.error(`[pet-drag-smoke] failed${marker?.reason ? `: ${marker.reason}` : ""}`);
    if (result.stdout.trim()) {
      console.error(`[pet-drag-smoke] stdout:\n${result.stdout}`);
    }
    if (result.stderr.trim()) {
      console.error(`[pet-drag-smoke] stderr:\n${result.stderr}`);
    }
    process.exit(result.exitCode ?? 1);
  }

  console.log(`[pet-drag-smoke] ok ${JSON.stringify(marker)}`);
} finally {
  rmSync(appDataPath, { recursive: true, force: true });
}

function runElectron() {
  return new Promise((resolveRun, rejectRun) => {
    const env = {
      ...process.env,
      APPDATA: appDataPath,
      LETSPLAN_PET_DRAG_E2E: "1"
    };
    delete env.LETSPLAN_E2E;
    delete env.LETSPLAN_UI_URL;
    delete env.ELECTRON_RUN_AS_NODE;

    const child = spawn(electronPath, [projectRoot], {
      cwd: projectRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      fail(new Error(`[pet-drag-smoke] timed out.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, 210000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (stderr.includes("App threw an error during load")) {
        fail(new Error(`[pet-drag-smoke] app failed during load.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
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

function parseMarker(stdout) {
  const markerLine = stdout.split(/\r?\n/).find((line) => line.startsWith("[letsplan-pet-drag-e2e] "));
  if (!markerLine) {
    return null;
  }

  return JSON.parse(markerLine.replace("[letsplan-pet-drag-e2e] ", ""));
}
