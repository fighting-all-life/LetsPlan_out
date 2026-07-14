import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const releaseDirectory = resolve(projectRoot, "release-win");
const version = process.env.npm_package_version || "1.1.0";
const installerPath = resolve(releaseDirectory, `LetsPlan-${version}-win-x64.exe`);
const appExePath = resolve(releaseDirectory, "win-unpacked", "LetsPlan.exe");

for (const filePath of [installerPath, appExePath]) {
  verifySignature(filePath);
}
console.log(`[release-signature] ok ${JSON.stringify({ files: [installerPath, appExePath] })}`);

function verifySignature(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Missing signed artifact: ${filePath}`);
  }

  const command = `$sig = Get-AuthenticodeSignature -LiteralPath '${escapePowerShell(filePath)}'; if ($sig.Status -ne 'Valid') { Write-Error ($sig.Status.ToString() + ': ' + $sig.StatusMessage); exit 1 }; $sig | Select-Object Status,SignerCertificate | ConvertTo-Json -Depth 3`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", command], {
    cwd: projectRoot,
    encoding: "utf8",
    windowsHide: true
  });

  if (result.status !== 0) {
    throw new Error(`Invalid Authenticode signature for ${filePath}: ${result.stderr || result.stdout}`);
  }
}

function escapePowerShell(value) {
  return value.replace(/'/g, "''");
}
