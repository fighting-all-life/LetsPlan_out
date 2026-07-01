import { existsSync, renameSync, rmSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const releaseDirectory = resolve(projectRoot, "release-win");

if (existsSync(releaseDirectory)) {
  const staleDirectory = join(projectRoot, `.release-stale-${process.pid}-${Date.now()}`);
  await rotateWithRetry(releaseDirectory, staleDirectory);
  await removeWithRetry(staleDirectory, { throwOnFailure: false });
}

async function rotateWithRetry(sourcePath, targetPath) {
  assertInsideProject(sourcePath);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      renameSync(sourcePath, targetPath);
      return;
    } catch (error) {
      if (attempt === 19) {
        throw error;
      }
      await wait(500);
    }
  }
}

async function removeWithRetry(targetPath, options = { throwOnFailure: true }) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      rmSync(targetPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
      return;
    } catch (error) {
      if (attempt === 19) {
        if (options.throwOnFailure) {
          throw error;
        }
        console.warn(`[clean-release] stale ${basename(targetPath)} cleanup skipped: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      await wait(500);
    }
  }
}

function assertInsideProject(targetPath) {
  const normalizedProject = projectRoot.toLowerCase();
  const normalizedTarget = resolve(targetPath).toLowerCase();
  if (normalizedTarget !== normalizedProject && !normalizedTarget.startsWith(`${normalizedProject}\\`)) {
    throw new Error(`Refusing to rotate path outside project: ${targetPath}`);
  }
}

function wait(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}




