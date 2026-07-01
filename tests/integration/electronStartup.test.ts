import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

interface ElectronRunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

interface E2EMarker {
  ok: boolean;
  planDate?: string;
  reason?: string;
}

const require = createRequire(import.meta.url);
const electronPath = require("electron") as string;
const projectRoot = process.cwd();
const tempPaths: string[] = [];

afterEach(() => {
  for (const tempPath of tempPaths.splice(0)) {
    rmSync(tempPath, { recursive: true, force: true });
  }
});

describe("Electron startup", () => {
  it("loads the built UI and verifies the renderer plan bridge", async () => {
    expect(existsSync(resolve(projectRoot, "dist/src/main/index.js"))).toBe(true);
    expect(existsSync(resolve(projectRoot, "dist/ui/index.html"))).toBe(true);

    const appDataPath = mkdtempSync(join(tmpdir(), "letsplan-e2e-"));
    tempPaths.push(appDataPath);

    const result = await runElectron(appDataPath);
    const marker = parseE2EMarker(result.stdout);

    expect(result.exitCode, result.stderr || result.stdout).toBe(0);
    expect(marker).toMatchObject({ ok: true });
    expect(marker?.planDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

function runElectron(appDataPath: string): Promise<ElectronRunResult> {
  return new Promise((resolveRun, rejectRun) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      APPDATA: appDataPath,
      LETSPLAN_E2E: "1"
    };
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
      fail(new Error(`Electron startup verification timed out.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, 25000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      if (stderr.includes("App threw an error during load")) {
        fail(new Error(`Electron app failed during load.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
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

    function fail(error: Error): void {
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

function parseE2EMarker(stdout: string): E2EMarker | null {
  const markerLine = stdout.split(/\r?\n/).find((line) => line.startsWith("[letsplan-e2e] "));
  if (!markerLine) {
    return null;
  }

  return JSON.parse(markerLine.replace("[letsplan-e2e] ", "")) as E2EMarker;
}