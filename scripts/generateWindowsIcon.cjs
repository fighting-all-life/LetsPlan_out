const { spawn } = require("node:child_process");
const { existsSync, readFileSync, writeFileSync } = require("node:fs");
const { dirname, resolve } = require("node:path");

const scriptPath = __filename;
const projectRoot = resolve(dirname(scriptPath), "..");
const svgPath = resolve(projectRoot, "build", "icon.svg");
const icoPath = resolve(projectRoot, "build", "icon.ico");
const iconSizes = [16, 24, 32, 48, 64, 128, 256];
const sourceSize = 256;

if (!process.versions.electron) {
  const electronExe = resolve(projectRoot, "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron");
  if (!existsSync(electronExe)) {
    throw new Error(`Electron executable was not found: ${electronExe}`);
  }

  const child = spawn(electronExe, [scriptPath, "--electron-render"], {
    cwd: projectRoot,
    env: createElectronRenderEnv(),
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
} else {
  const { app, BrowserWindow } = require("electron");
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("force-device-scale-factor", "1");

  app.whenReady()
    .then(async () => {
      const svg = readFileSync(svgPath, "utf8");
      const sourceImage = await renderSvg(BrowserWindow, svg, sourceSize);
      const pngEntries = iconSizes.map((size) => ({
        size,
        png: sourceImage.resize({ width: size, height: size, quality: "best" }).toPNG()
      }));
      writeFileSync(icoPath, buildIco(pngEntries));
      console.log(`[icon] wrote ${icoPath} (${pngEntries.map((entry) => `${entry.size}px`).join(", ")})`);
    })
    .then(() => app.quit())
    .catch((error) => {
      console.error(`[icon] ${error.stack || error.message}`);
      process.exit(1);
    });
}

function createElectronRenderEnv() {
  const env = {
    ...process.env,
    ELECTRON_DISABLE_SECURITY_WARNINGS: "true"
  };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}
async function renderSvg(BrowserWindow, svg, size) {
  const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{width:${size}px;height:${size}px;margin:0;padding:0;overflow:hidden;background:transparent;}img{display:block;width:${size}px;height:${size}px;}</style></head><body><img id="icon" src="${svgDataUrl}" alt="LetsPlan icon"></body></html>`;
  const window = new BrowserWindow({
    width: size,
    height: size,
    useContentSize: true,
    frame: false,
    show: false,
    transparent: true,
    backgroundColor: "#00000000",
    webPreferences: {
      backgroundThrottling: false,
      webSecurity: false
    }
  });

  try {
    await withTimeout(window.loadURL(`data:text/html;base64,${Buffer.from(html).toString("base64")}`), 10000, `load ${size}px icon`);
    await withTimeout(window.webContents.executeJavaScript(`new Promise((resolve) => {
      const image = document.getElementById('icon');
      if (!image || image.complete) { resolve(); return; }
      image.onload = () => resolve();
      image.onerror = () => resolve();
    })`, true), 5000, `decode ${size}px icon`);
    await new Promise((resolve) => setTimeout(resolve, 100));
    return await withTimeout(window.webContents.capturePage({ x: 0, y: 0, width: size, height: size }), 10000, `capture ${size}px icon`);
  } finally {
    window.destroy();
  }
}

function withTimeout(promise, timeoutMs, description) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timed out waiting to ${description}.`)), timeoutMs))
  ]);
}

function buildIco(entries) {
  const headerSize = 6;
  const directorySize = 16 * entries.length;
  let imageOffset = headerSize + directorySize;
  const buffers = [Buffer.alloc(headerSize + directorySize)];
  const output = buffers[0];

  output.writeUInt16LE(0, 0);
  output.writeUInt16LE(1, 2);
  output.writeUInt16LE(entries.length, 4);

  entries.forEach((entry, index) => {
    const directoryOffset = headerSize + index * 16;
    output.writeUInt8(entry.size === 256 ? 0 : entry.size, directoryOffset);
    output.writeUInt8(entry.size === 256 ? 0 : entry.size, directoryOffset + 1);
    output.writeUInt8(0, directoryOffset + 2);
    output.writeUInt8(0, directoryOffset + 3);
    output.writeUInt16LE(1, directoryOffset + 4);
    output.writeUInt16LE(32, directoryOffset + 6);
    output.writeUInt32LE(entry.png.length, directoryOffset + 8);
    output.writeUInt32LE(imageOffset, directoryOffset + 12);
    imageOffset += entry.png.length;
    buffers.push(entry.png);
  });

  return Buffer.concat(buffers);
}
