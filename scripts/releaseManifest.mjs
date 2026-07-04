import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const releaseDir = resolve(projectRoot, "release-win");
const manifestPath = join(releaseDir, "release-manifest.json");
const pkg = JSON.parse(readFileSync(resolve(projectRoot, "package.json"), "utf8").replace(/^\uFEFF/u, ""));
const productName = pkg.build?.productName ?? pkg.name;
const version = pkg.version;
const args = new Set(process.argv.slice(2));
const mode = args.has("--write") ? "write" : "verify";

const nsisName = `${productName}-${version}-win-x64.exe`;
const msiName = `${productName}-${version}-win-x64.msi`;
const zipName = `${productName}-${version}-win-x64.zip`;
const artifactSpecs = [
  { id: "nsis-installer", relativePath: nsisName, minBytes: 1_000_000 },
  { id: "msi-installer", relativePath: msiName, minBytes: 1_000_000 },
  { id: "release-zip", relativePath: zipName, minBytes: 1_000_000 },
  { id: "nsis-blockmap", relativePath: `${nsisName}.blockmap`, minBytes: 1_000 },
  { id: "latest-yml", relativePath: "latest.yml", minBytes: 1 },
  { id: "portable-exe", relativePath: `win-unpacked/${productName}.exe`, minBytes: 1_000_000 }
];

if (mode === "write") {
  const manifest = createManifest();
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`[release-manifest] ok ${JSON.stringify({ ok: true, mode, manifest: toProjectPath(manifestPath), files: manifest.files.length })}`);
} else {
  verifyManifest();
}

function createManifest() {
  const now = new Date();
  return {
    schemaVersion: 1,
    productName,
    version,
    generatedAt: now.toISOString(),
    generatedAtAsiaShanghai: formatAsiaShanghai(now),
    files: artifactSpecs.map((spec) => buildFileRecord(spec))
  };
}

function verifyManifest() {
  if (!existsSync(manifestPath)) {
    fail(`Missing release manifest: ${toProjectPath(manifestPath)}`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8").replace(/^\uFEFF/u, ""));
  if (manifest.schemaVersion !== 1) {
    fail(`Unexpected manifest schemaVersion: ${manifest.schemaVersion}`);
  }
  if (manifest.productName !== productName || manifest.version !== version) {
    fail(`Manifest product mismatch: ${manifest.productName}@${manifest.version}`);
  }
  if (!Array.isArray(manifest.files)) {
    fail("Manifest files must be an array.");
  }

  const filesByPath = new Map(manifest.files.map((file) => [normalizePath(file.relativePath), file]));
  for (const spec of artifactSpecs) {
    const expectedPath = normalizePath(spec.relativePath);
    const recorded = filesByPath.get(expectedPath);
    if (!recorded) {
      fail(`Manifest is missing ${expectedPath}`);
    }
    const actual = buildFileRecord(spec);
    if (recorded.id !== spec.id) {
      fail(`Manifest id mismatch for ${expectedPath}: ${recorded.id}`);
    }
    if (recorded.bytes !== actual.bytes) {
      fail(`Manifest byte mismatch for ${expectedPath}: ${recorded.bytes} !== ${actual.bytes}`);
    }
    if (recorded.sha256 !== actual.sha256) {
      fail(`Manifest sha256 mismatch for ${expectedPath}`);
    }
  }

  console.log(`[release-manifest] ok ${JSON.stringify({ ok: true, mode, manifest: toProjectPath(manifestPath), files: artifactSpecs.length })}`);
}

function buildFileRecord(spec) {
  const artifactPath = join(releaseDir, spec.relativePath);
  assertFile(artifactPath, spec.minBytes);
  const bytes = statSync(artifactPath).size;
  const buffer = readFileSync(artifactPath);
  return {
    id: spec.id,
    relativePath: normalizePath(spec.relativePath),
    bytes,
    sha256: createHash("sha256").update(buffer).digest("hex")
  };
}

function assertFile(path, minBytes) {
  if (!existsSync(path)) {
    fail(`Missing release artifact: ${toProjectPath(path)}`);
  }
  const stats = statSync(path);
  if (!stats.isFile()) {
    fail(`Release artifact is not a file: ${toProjectPath(path)}`);
  }
  if (stats.size < minBytes) {
    fail(`Release artifact is unexpectedly small: ${toProjectPath(path)} (${stats.size} bytes)`);
  }
}

function formatAsiaShanghai(date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} +08:00`;
}

function normalizePath(value) {
  return String(value).replace(/\\/g, "/");
}

function toProjectPath(path) {
  return relative(projectRoot, path).replace(/\\/g, "/");
}

function fail(message) {
  console.error(`[release-manifest] ${message}`);
  process.exit(1);
}