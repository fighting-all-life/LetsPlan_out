import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const electronPath = require("electron");

const appStatus = runCommand(electronPath, [projectRoot, ...process.argv.slice(2)]);
process.exit(appStatus);

function runCommand(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: createElectronEnv(),
    shell: process.platform === "win32",
    stdio: "inherit"
  });

  if (result.error) {
    console.error(`[runner] failed to start ${command}: ${result.error.message}`);
  }

  return result.status ?? 1;
}
function createElectronEnv() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}
