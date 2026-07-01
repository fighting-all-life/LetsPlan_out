import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const releaseDirectory = resolve(projectRoot, "release-win");
const shortcutName = "LetsPlan.lnk";

if (process.platform !== "win32") {
  console.error("[installer-smoke] Windows installer smoke test only runs on Windows.");
  process.exit(1);
}

const installerPath = findInstaller();
const tempRoot = mkdtempSync(join(tmpdir(), "letsplan-installer-e2e-"));
const installDirectory = join(tempRoot, "LetsPlan");
const appDataPath = join(tempRoot, "appdata");
const localAppDataPath = join(tempRoot, "localappdata");
const userProfilePath = join(tempRoot, "profile");
const desktopPath = join(userProfilePath, "Desktop");
const tempProgramsPath = join(appDataPath, "Microsoft", "Windows", "Start Menu", "Programs");
const installedExePath = join(installDirectory, "LetsPlan.exe");
const userDataDbPath = join(appDataPath, "LetsPlan", "data.db");
const smokeEnv = {
  ...process.env,
  APPDATA: appDataPath,
  LOCALAPPDATA: localAppDataPath,
  USERPROFILE: userProfilePath,
  TEMP: tempRoot,
  TMP: tempRoot
};

delete smokeEnv.ELECTRON_RUN_AS_NODE;
mkdirSync(desktopPath, { recursive: true });
mkdirSync(tempProgramsPath, { recursive: true });

let installed = false;
let shortcutsCreated = [];

try {
  const shortcutCandidates = buildShortcutCandidates();
  const preexistingShortcuts = shortcutCandidates.all.filter((shortcutPath) => existsSync(shortcutPath) && !isInside(shortcutPath, tempRoot));
  if (preexistingShortcuts.length > 0) {
    throw new Error(`Refusing to run installer smoke because LetsPlan shortcuts already exist: ${preexistingShortcuts.join(", ")}`);
  }

  await runCommand(installerPath, ["/S", "/currentuser", `/D=${installDirectory}`], {
    cwd: releaseDirectory,
    env: smokeEnv,
    timeoutMs: 120000
  });
  installed = true;

  if (!existsSync(installedExePath)) {
    throw new Error(`Installed executable was not found: ${installedExePath}`);
  }

  shortcutsCreated = shortcutCandidates.all.filter((shortcutPath) => existsSync(shortcutPath));
  const desktopShortcuts = shortcutCandidates.desktop.filter((shortcutPath) => existsSync(shortcutPath));
  const startMenuShortcuts = shortcutCandidates.startMenu.filter((shortcutPath) => existsSync(shortcutPath));
  if (desktopShortcuts.length === 0) {
    throw new Error(`Desktop shortcut was not created. Existing shortcuts: ${shortcutsCreated.join(", ") || "(none)"}. Desktop candidates: ${shortcutCandidates.desktop.join(", ")}`);
  }
  if (startMenuShortcuts.length === 0) {
    throw new Error(`Start menu shortcut was not created. Existing shortcuts: ${shortcutsCreated.join(", ") || "(none)"}. Start menu candidates: ${shortcutCandidates.startMenu.join(", ")}`);
  }

  const appResult = await runPackagedApp(installedExePath, appDataPath);
  const marker = parseE2EMarker(appResult.stdout);
  if (appResult.exitCode !== 0 || !marker?.ok) {
    throw new Error(buildRunFailure("Installed app failed smoke verification", appResult));
  }
  if (!existsSync(userDataDbPath)) {
    throw new Error(`User data database was not created: ${userDataDbPath}`);
  }

  const uninstallerPath = findUninstaller(installDirectory);
  await runCommand(uninstallerPath, ["/S", "/currentuser"], {
    cwd: installDirectory,
    env: smokeEnv,
    timeoutMs: 120000
  });
  installed = false;

  await waitFor(() => !existsSync(installedExePath), 30000, "installed executable to be removed");
  await waitFor(() => shortcutsCreated.every((shortcutPath) => !existsSync(shortcutPath)), 30000, "installer shortcuts to be removed");

  if (!existsSync(userDataDbPath)) {
    throw new Error("User data database was removed during uninstall.");
  }

  console.log(
    `[installer-smoke] ok ${JSON.stringify({
      ok: true,
      installer: basename(installerPath),
      desktopShortcuts: desktopShortcuts.length,
      startMenuShortcuts: startMenuShortcuts.length,
      dataRetained: true,
      planDate: marker.planDate
    })}`
  );
} catch (error) {
  console.error(`[installer-smoke] ${error instanceof Error ? error.message : String(error)}`);
  if (installed) {
    try {
      const uninstallerPath = findUninstaller(installDirectory);
      await runCommand(uninstallerPath, ["/S", "/currentuser"], {
        cwd: installDirectory,
        env: smokeEnv,
        timeoutMs: 120000
      });
    } catch (cleanupError) {
      console.error(`[installer-smoke] cleanup uninstall failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
    }
  }
  cleanupCreatedShortcuts(shortcutsCreated);
  process.exit(1);
} finally {
  await removeTempRoot(tempRoot);
}

async function removeTempRoot(directory) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 });
      return;
    } catch (error) {
      if (attempt === 19) {
        console.warn(`[installer-smoke] temp cleanup skipped: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      await new Promise((resolveCleanup) => setTimeout(resolveCleanup, 500));
    }
  }
}
function findInstaller() {
  const installers = readdirSync(releaseDirectory)
    .filter((name) => /^LetsPlan-.*-win-x64\.exe$/u.test(name) && !name.includes(".__uninstaller"))
    .map((name) => resolve(releaseDirectory, name))
    .sort((first, second) => statSync(second).mtimeMs - statSync(first).mtimeMs);

  if (installers.length === 0) {
    console.error("[installer-smoke] NSIS installer was not found. Run npm run dist:win first.");
    process.exit(1);
  }

  return installers[0];
}

function findUninstaller(directory) {
  const uninstallers = readdirSync(directory)
    .filter((name) => /^Uninstall .*\.exe$/u.test(name))
    .map((name) => join(directory, name));

  if (uninstallers.length === 0) {
    throw new Error(`Uninstaller was not found in ${directory}.`);
  }

  return uninstallers[0];
}

function buildShortcutCandidates() {
  const desktopDirectories = uniquePaths([
    desktopPath,
    getSpecialFolder("DesktopDirectory"),
    getSpecialFolder("CommonDesktopDirectory"),
    process.env.USERPROFILE ? join(process.env.USERPROFILE, "Desktop") : null,
    process.env.OneDrive ? join(process.env.OneDrive, "Desktop") : null,
    process.env.OneDrive ? join(process.env.OneDrive, "桌面") : null
  ]);
  const startMenuDirectories = uniquePaths([
    tempProgramsPath,
    getSpecialFolder("Programs"),
    getSpecialFolder("CommonPrograms"),
    process.env.APPDATA ? join(process.env.APPDATA, "Microsoft", "Windows", "Start Menu", "Programs") : null
  ]);
  const desktop = uniquePaths(desktopDirectories.map((directory) => join(directory, shortcutName)));
  const startMenu = uniquePaths(startMenuDirectories.flatMap((directory) => [join(directory, shortcutName), join(directory, "LetsPlan", shortcutName)]));

  return {
    desktop,
    startMenu,
    all: uniquePaths([...desktop, ...startMenu])
  };
}

function getSpecialFolder(name) {
  const command = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; [Environment]::GetFolderPath('${name}')`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", command], {
    encoding: "utf8",
    windowsHide: true
  });

  if (result.status !== 0) {
    return null;
  }

  return result.stdout.trim() || null;
}

function uniquePaths(paths) {
  const seen = new Set();
  const result = [];
  for (const value of paths) {
    if (!value) {
      continue;
    }
    const normalized = resolve(value);
    const key = normalized.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(normalized);
    }
  }
  return result;
}

function isInside(candidatePath, parentPath) {
  const candidate = resolve(candidatePath).toLowerCase();
  const parent = resolve(parentPath).toLowerCase();
  return candidate === parent || candidate.startsWith(`${parent}\\`);
}

function cleanupCreatedShortcuts(shortcutPaths) {
  for (const shortcutPath of shortcutPaths) {
    if (!existsSync(shortcutPath)) {
      continue;
    }

    try {
      const contents = readFileSync(shortcutPath);
      const utf16Target = Buffer.from(installedExePath, "utf16le");
      const utf8Target = Buffer.from(installedExePath, "utf8");
      if (contents.includes(utf16Target) || contents.includes(utf8Target) || isInside(shortcutPath, tempRoot)) {
        rmSync(shortcutPath, { force: true });
      }
    } catch {
      // Best-effort cleanup only. The main failure above remains the signal.
    }
  }
}

function runPackagedApp(exePath, appDataDirectory) {
  const env = {
    ...process.env,
    APPDATA: appDataDirectory,
    LETSPLAN_E2E: "1"
  };
  delete env.LETSPLAN_UI_URL;
  delete env.ELECTRON_RUN_AS_NODE;

  return runCommand(exePath, [], {
    cwd: dirname(exePath),
    env,
    timeoutMs: 30000,
    allowNonZeroExit: true
  });
}

function runCommand(command, args, options) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => {
      fail(new Error(`${basename(command)} timed out.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, options.timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (stderr.includes("App threw an error during load")) {
        fail(new Error(buildRunFailure("App failed during load", { stdout, stderr, exitCode: 1 })));
      }
    });
    child.on("error", fail);
    child.on("close", (exitCode) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      const result = { exitCode, stdout, stderr };
      if (exitCode !== 0 && !options.allowNonZeroExit) {
        rejectRun(new Error(buildRunFailure(`${basename(command)} exited with ${exitCode}`, result)));
        return;
      }
      resolveRun(result);
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

function buildRunFailure(message, result) {
  const details = [message];
  if (result.stdout?.trim()) {
    details.push(`stdout:\n${result.stdout}`);
  }
  if (result.stderr?.trim()) {
    details.push(`stderr:\n${result.stderr}`);
  }
  return details.join("\n");
}

async function waitFor(predicate, timeoutMs, description) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Timed out waiting for ${description}.`);
}


