import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const testStatus = runCommand(npmCommand, ["exec", "vitest", "--", "run", "--config", "vitest.integration.config.ts"]);
process.exit(testStatus);

function runCommand(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: process.env,
    shell: process.platform === "win32",
    stdio: "inherit"
  });

  if (result.error) {
    console.error(`[runner] failed to start ${command}: ${result.error.message}`);
  }

  return result.status ?? 1;
}