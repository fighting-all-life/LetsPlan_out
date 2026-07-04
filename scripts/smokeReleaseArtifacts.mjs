import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const releaseDir = resolve(projectRoot, "release-win");
const pkg = JSON.parse(readFileSync(resolve(projectRoot, "package.json"), "utf8"));
const productName = pkg.build?.productName ?? pkg.name;
const version = pkg.version;

const nsisName = `${productName}-${version}-win-x64.exe`;
const msiName = `${productName}-${version}-win-x64.msi`;
const zipName = `${productName}-${version}-win-x64.zip`;
const blockmapName = `${nsisName}.blockmap`;

const nsisPath = assertFile(join(releaseDir, nsisName), 1_000_000);
const msiPath = assertFile(join(releaseDir, msiName), 1_000_000);
const zipPath = assertFile(join(releaseDir, zipName), 1_000_000);
const appExePath = assertFile(join(releaseDir, "win-unpacked", `${productName}.exe`), 1_000_000);
assertFile(join(releaseDir, blockmapName), 1_000);
assertFile(join(releaseDir, "latest.yml"), 1);

const zipEntries = readZipEntries(zipPath).map(normalizeZipName);
assertZipEntry(zipEntries, nsisName);
assertZipEntry(zipEntries, msiName);
assertZipEntry(zipEntries, `${productName}.exe`);

console.log(`[release-artifacts-smoke] ok ${JSON.stringify({
  ok: true,
  nsis: { name: nsisName, bytes: statSync(nsisPath).size },
  msi: { name: msiName, bytes: statSync(msiPath).size },
  zip: { name: zipName, bytes: statSync(zipPath).size, entries: zipEntries.length },
  app: { name: `${productName}.exe`, bytes: statSync(appExePath).size }
})}`);

function assertFile(path, minBytes) {
  if (!existsSync(path)) {
    fail(`Missing release artifact: ${path}`);
  }
  const size = statSync(path).size;
  if (size < minBytes) {
    fail(`Release artifact is unexpectedly small: ${path} (${size} bytes)`);
  }
  return path;
}

function readZipEntries(path) {
  const buffer = readFileSync(path);
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const endOffset = centralDirectoryOffset + centralDirectorySize;
  const names = [];
  let offset = centralDirectoryOffset;
  while (offset < endOffset) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      fail(`Invalid ZIP central directory at offset ${offset}`);
    }
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const nameStart = offset + 46;
    const nameEnd = nameStart + fileNameLength;
    names.push(buffer.toString("utf8", nameStart, nameEnd));
    offset = nameEnd + extraLength + commentLength;
  }
  return names;
}

function findEndOfCentralDirectory(buffer) {
  const minimumOffset = Math.max(0, buffer.length - 65557);
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }
  fail("ZIP end of central directory was not found.");
}

function normalizeZipName(value) {
  return value.replace(/\//g, "\\");
}

function assertZipEntry(entries, fileName) {
  if (!entries.some((entry) => entry.endsWith(`\\${fileName}`) || entry === fileName)) {
    fail(`ZIP is missing ${fileName}`);
  }
}

function fail(message) {
  console.error(`[release-artifacts-smoke] ${message}`);
  process.exit(1);
}