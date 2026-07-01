import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const releaseDirectory = resolve(projectRoot, "release-win");
const configPath = resolve(projectRoot, "dist", "release-channel.json");
const packageJson = JSON.parse(readFileSync(resolve(projectRoot, "package.json"), "utf8"));
const releaseConfig = JSON.parse(readFileSync(configPath, "utf8"));

if (releaseConfig.enabled !== true || !releaseConfig.url) {
  throw new Error("release-channel.json must be enabled before staging a release channel.");
}

const channel = releaseConfig.channel || "latest";
const stageDirectory = resolve(projectRoot, "release-channel", "win", channel);
assertInsideProject(stageDirectory);
rmSync(stageDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
mkdirSync(stageDirectory, { recursive: true });

const installer = findRequiredArtifact((name) => name.endsWith(".exe") && !name.includes(".__uninstaller"));
const blockmap = `${installer}.blockmap`;
const latest = resolve(releaseDirectory, "latest.yml");

for (const artifact of [installer, blockmap, latest]) {
  if (!existsSync(artifact)) {
    throw new Error(`Missing release artifact: ${artifact}`);
  }
  copyFileSync(artifact, join(stageDirectory, basename(artifact)));
}

const manifest = {
  productName: packageJson.build?.productName || packageJson.name,
  version: packageJson.version,
  channel,
  updateUrl: releaseConfig.url,
  generatedAt: new Date().toISOString(),
  artifacts: [installer, blockmap, latest].map((artifact) => ({
    file: basename(artifact),
    sha512: sha512(artifact)
  }))
};
writeFileSync(join(stageDirectory, "release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`[release-stage] wrote ${stageDirectory}`);

function findRequiredArtifact(predicate) {
  const artifact = readdirSync(releaseDirectory)
    .map((name) => resolve(releaseDirectory, name))
    .find((filePath) => predicate(basename(filePath)));
  if (!artifact) {
    throw new Error(`No matching release artifact in ${releaseDirectory}`);
  }
  return artifact;
}

function sha512(filePath) {
  return createHash("sha512").update(readFileSync(filePath)).digest("base64");
}

function assertInsideProject(targetPath) {
  const normalizedProject = projectRoot.toLowerCase();
  const normalizedTarget = resolve(targetPath).toLowerCase();
  if (normalizedTarget !== normalizedProject && !normalizedTarget.startsWith(`${normalizedProject}\\`)) {
    throw new Error(`Refusing to write outside project: ${targetPath}`);
  }
}
