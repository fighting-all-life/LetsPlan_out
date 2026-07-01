import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const child = spawn(process.execPath, [resolve(scriptDirectory, "generateWindowsIcon.cjs")], {
  cwd: resolve(scriptDirectory, ".."),
  stdio: "inherit",
  windowsHide: true
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
child.on("error", (error) => {
  console.error(`[icon] ${error.message}`);
  process.exit(1);
});
