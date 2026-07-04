import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceCssPath = resolve(projectRoot, "src", "modules", "ui", "styles.css");
const sourceCss = readText(sourceCssPath);
const findings = [];

const requiredPatterns = [
  { name: "ink token", pattern: /--color-ink:\s*#222222\b/iu },
  { name: "cinnabar token", pattern: /--color-cinnabar:\s*#9e2b25\b/iu },
  { name: "bronze token", pattern: /--color-bronze:\s*#a67c3e\b/iu },
  { name: "bamboo token", pattern: /--color-bamboo:\s*#557255\b/iu },
  { name: "paper token", pattern: /--color-paper:\s*#f7f3e9\b/iu },
  { name: "non-pet paper background", pattern: /body:not\(\.pet-window-body\)\s*\{[\s\S]*?background:/u },
  { name: "non-pet neon safety net", pattern: /non-pet neon compatibility safety net[\s\S]*?body:not\(\.pet-window-body\)\s*\{[\s\S]*?--neon-cyan:\s*var\(--color-bamboo\)/u },
  { name: "main quest seal styling", pattern: /\.main-quest-badge[\s\S]*?var\(--color-cinnabar\)/u },
  { name: "task done cinnabar strike", pattern: /text-decoration-color:\s*var\(--color-cinnabar\)/u }
];

for (const check of requiredPatterns) {
  if (!check.pattern.test(sourceCss)) {
    findings.push({ file: toProjectPath(sourceCssPath), check: `missing ${check.name}` });
  }
}

const legacyNeonPatterns = [
  /#4df5ff/iu,
  /#b9ff4d/iu,
  /#ff4fd8/iu,
  /rgba\(77,\s*245,\s*255/iu,
  /rgba\(185,\s*255,\s*77/iu,
  /rgba\(255,\s*79,\s*216/iu
];
const safetyNetIndex = sourceCss.indexOf("non-pet neon compatibility safety net");
const lastLegacyNeonIndex = Math.max(...legacyNeonPatterns.map((pattern) => findLastPatternIndex(sourceCss, pattern)));
if (safetyNetIndex < 0) {
  findings.push({ file: toProjectPath(sourceCssPath), check: "missing non-pet neon safety net marker" });
} else if (lastLegacyNeonIndex > safetyNetIndex) {
  findings.push({
    file: toProjectPath(sourceCssPath),
    check: "legacy neon literal appears after non-pet safety net",
    line: getLineNumber(sourceCss, lastLegacyNeonIndex)
  });
}

for (const block of findPseudoBlocks(sourceCss)) {
  if (!/\bcontent\s*:/iu.test(block.body)) {
    continue;
  }
  if (/\bpet-(?:shell|rig|window)|pet-window-body/iu.test(block.selector)) {
    continue;
  }
  if (!/\bpointer-events\s*:\s*none\s*;/iu.test(block.body)) {
    findings.push({
      file: toProjectPath(sourceCssPath),
      check: "decorative pseudo-element missing pointer-events none",
      line: getLineNumber(sourceCss, block.index)
    });
  }
}

const builtCssFiles = findBuiltCssFiles();
for (const builtCssFile of builtCssFiles) {
  const builtCss = readText(builtCssFile);
  for (const token of ["--color-cinnabar", "--color-paper", "--color-bamboo"]) {
    if (!builtCss.includes(token)) {
      findings.push({ file: toProjectPath(builtCssFile), check: `built CSS missing ${token}` });
    }
  }
}

if (findings.length > 0) {
  console.error(`[audit-ui-theme] failed ${JSON.stringify({ ok: false, findings: findings.slice(0, 20) })}`);
  process.exit(1);
}

console.log(`[audit-ui-theme] ok ${JSON.stringify({ ok: true, source: toProjectPath(sourceCssPath), builtCssFiles: builtCssFiles.length })}`);

function readText(file) {
  return readFileSync(file, "utf8").replace(/^\uFEFF/u, "");
}

function toProjectPath(file) {
  return file.replace(projectRoot, "").replace(/^[\\/]/u, "").replaceAll("\\", "/");
}

function findLastPatternIndex(text, pattern) {
  let lastIndex = -1;
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  for (const match of text.matchAll(new RegExp(pattern.source, flags))) {
    lastIndex = match.index ?? lastIndex;
  }
  return lastIndex;
}

function findPseudoBlocks(css) {
  const blocks = [];
  const pattern = /([^{}]+::(?:before|after)[^{]*)\{([^{}]*)\}/giu;
  for (const match of css.matchAll(pattern)) {
    blocks.push({ selector: match[1], body: match[2], index: match.index ?? 0 });
  }
  return blocks;
}

function findBuiltCssFiles() {
  const assetsDirectory = resolve(projectRoot, "dist", "ui", "assets");
  if (!existsSync(assetsDirectory)) {
    return [];
  }
  return readdirSync(assetsDirectory)
    .filter((entry) => entry.endsWith(".css"))
    .map((entry) => join(assetsDirectory, entry));
}

function getLineNumber(text, index) {
  return text.slice(0, index).split("\n").length;
}
