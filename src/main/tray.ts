import { deflateSync } from "node:zlib";

export interface MainWindowLike {
  isMinimized(): boolean;
  restore(): void;
  show(): void;
  focus(): void;
}

export interface AppLike {
  quit(): void;
}

export interface TrayLike {
  setImage?(image: unknown): void;
  setToolTip(toolTip: string): void;
  setContextMenu(menu: unknown): void;
  on(eventName: "click" | "double-click", listener: () => void): void;
  destroy?(): void;
}

export interface TrayMenuItem {
  label?: string;
  type?: "separator";
  enabled?: boolean;
  click?: () => void;
}

export interface PlanTrayStatus {
  total: number;
  doneCount: number;
  percentage: number;
  isCompleted: boolean;
}

export interface CreatePlanTrayOptions {
  app: AppLike;
  mainWindow: MainWindowLike;
  createImage(dataUrl: string): unknown;
  createTray(image: unknown): TrayLike;
  createMenu(template: TrayMenuItem[]): unknown;
  openHistory?: () => void;
}

export interface PlanTrayController {
  tray: TrayLike;
  showMainWindow(): void;
  updateStatus(status: PlanTrayStatus): void;
  dispose(): void;
}

interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

const TRAY_ICON_SIZE = 32;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const PIXEL_FONT: Record<string, string[]> = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
  L: ["100", "100", "100", "100", "111"],
  P: ["110", "101", "110", "100", "100"]
};

export function buildTrayIconDataUrl(status: PlanTrayStatus | null = null): string {
  const normalizedStatus = status ? normalizeTrayStatus(status) : null;
  const percentage = normalizedStatus?.percentage ?? 0;
  const backgroundColor = getTrayIconBackground(normalizedStatus);
  const badgeLabel = getTrayIconBadgeLabel(normalizedStatus);
  const pixels = new Uint8ClampedArray(TRAY_ICON_SIZE * TRAY_ICON_SIZE * 4);

  drawRoundedRect(pixels, 0, 0, TRAY_ICON_SIZE, TRAY_ICON_SIZE, 8, hexToRgba(backgroundColor));
  drawCircleRing(pixels, 16, 16, 11, 3, { r: 255, g: 255, b: 255, a: 70 });
  drawCircleRing(pixels, 16, 16, 11, 3, { r: 255, g: 255, b: 255, a: 255 }, percentage / 100);
  drawPixelLabel(pixels, badgeLabel, { r: 255, g: 255, b: 255, a: 255 });

  return `data:image/png;base64,${encodePng(TRAY_ICON_SIZE, TRAY_ICON_SIZE, pixels).toString("base64")}`;
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

export const TRAY_ICON_DATA_URL = buildTrayIconDataUrl(null);

export function createPlanTray(options: CreatePlanTrayOptions): PlanTrayController {
  let currentStatus: PlanTrayStatus | null = null;
  const tray = options.createTray(options.createImage(buildTrayIconDataUrl(currentStatus)));

  const showMainWindow = () => {
    if (options.mainWindow.isMinimized()) {
      options.mainWindow.restore();
    }

    options.mainWindow.show();
    options.mainWindow.focus();
  };

  const openHistory = () => {
    if (options.openHistory) {
      options.openHistory();
      return;
    }

    showMainWindow();
  };

  const rebuildTrayMenu = () => {
    const icon = options.createImage(buildTrayIconDataUrl(currentStatus));
    tray.setImage?.(icon);
    const menu = options.createMenu(buildTrayMenuTemplate(currentStatus, showMainWindow, openHistory, () => options.app.quit()));
    tray.setToolTip(buildTrayToolTip(currentStatus));
    tray.setContextMenu(menu);
  };

  rebuildTrayMenu();
  tray.on("click", showMainWindow);
  tray.on("double-click", showMainWindow);

  return {
    tray,
    showMainWindow,
    updateStatus(status) {
      currentStatus = normalizeTrayStatus(status);
      rebuildTrayMenu();
    },
    dispose() {
      tray.destroy?.();
    }
  };
}

function buildTrayMenuTemplate(
  status: PlanTrayStatus | null,
  showMainWindow: () => void,
  openHistory: () => void,
  quit: () => void
): TrayMenuItem[] {
  return [
    {
      label: buildTrayStatusLabel(status),
      enabled: false
    },
    {
      type: "separator"
    },
    {
      label: "\u6253\u5f00\u4e3b\u7a97\u53e3",
      click: showMainWindow
    },
    {
      label: "\u4eca\u65e5\u8ba1\u5212",
      click: showMainWindow
    },
    {
      label: "\u5386\u53f2\u8bb0\u5f55",
      click: openHistory
    },
    {
      type: "separator"
    },
    {
      label: "\u9000\u51fa",
      click: quit
    }
  ];
}

function buildTrayToolTip(status: PlanTrayStatus | null): string {
  if (!status) {
    return "Let'sPlan \u00b7 \u4eca\u65e5\u8fdb\u5ea6\u5f85\u540c\u6b65";
  }

  if (status.total === 0) {
    return "Let'sPlan \u00b7 \u4eca\u65e5\u6682\u65e0\u4efb\u52a1";
  }

  if (status.isCompleted) {
    return `Let'sPlan \u00b7 \u4eca\u65e5\u5df2\u5b8c\u6210 (${status.doneCount}/${status.total})`;
  }

  return `Let'sPlan \u00b7 \u4eca\u65e5 ${status.percentage}% (${status.doneCount}/${status.total})`;
}

function buildTrayStatusLabel(status: PlanTrayStatus | null): string {
  if (!status) {
    return "\u4eca\u65e5\u8fdb\u5ea6\uff1a\u5f85\u540c\u6b65";
  }

  if (status.total === 0) {
    return "\u4eca\u65e5\u8fdb\u5ea6\uff1a\u6682\u65e0\u4efb\u52a1";
  }

  if (status.isCompleted) {
    return `\u4eca\u65e5\u8fdb\u5ea6\uff1a\u5df2\u5b8c\u6210\uff08${status.doneCount}/${status.total}\uff09`;
  }

  return `\u4eca\u65e5\u8fdb\u5ea6\uff1a${status.percentage}%\uff08${status.doneCount}/${status.total}\uff09`;
}

function normalizeTrayStatus(status: PlanTrayStatus): PlanTrayStatus {
  const total = Math.max(0, Math.trunc(status.total));
  const doneCount = Math.min(total, Math.max(0, Math.trunc(status.doneCount)));
  const percentage = total === 0 ? 0 : Math.min(100, Math.max(0, Math.round(status.percentage)));

  return {
    total,
    doneCount,
    percentage,
    isCompleted: total > 0 && (status.isCompleted || doneCount === total)
  };
}

function getTrayIconBackground(status: PlanTrayStatus | null): string {
  if (!status) {
    return "#334155";
  }
  if (status.total === 0) {
    return "#64748b";
  }
  if (status.isCompleted) {
    return "#0f766e";
  }
  if (status.percentage >= 66) {
    return "#16a34a";
  }
  if (status.percentage >= 33) {
    return "#d97706";
  }

  return "#dc2626";
}

function getTrayIconBadgeLabel(status: PlanTrayStatus | null): string {
  if (!status) {
    return "LP";
  }
  if (status.total === 0) {
    return "0";
  }
  if (status.isCompleted) {
    return "100";
  }

  return String(status.percentage);
}

function drawRoundedRect(
  pixels: Uint8ClampedArray,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  color: RgbaColor
): void {
  for (let nextY = y; nextY < y + height; nextY += 1) {
    for (let nextX = x; nextX < x + width; nextX += 1) {
      if (isInsideRoundedRect(nextX + 0.5, nextY + 0.5, x, y, width, height, radius)) {
        blendPixel(pixels, nextX, nextY, color);
      }
    }
  }
}

function drawCircleRing(
  pixels: Uint8ClampedArray,
  centerX: number,
  centerY: number,
  radius: number,
  thickness: number,
  color: RgbaColor,
  progress = 1
): void {
  const normalizedProgress = Math.min(1, Math.max(0, progress));
  if (normalizedProgress <= 0) {
    return;
  }

  for (let y = 0; y < TRAY_ICON_SIZE; y += 1) {
    for (let x = 0; x < TRAY_ICON_SIZE; x += 1) {
      const dx = x + 0.5 - centerX;
      const dy = y + 0.5 - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (Math.abs(distance - radius) > thickness / 2) {
        continue;
      }

      if (normalizedProgress < 1 && getProgressAngleRatio(dx, dy) > normalizedProgress) {
        continue;
      }

      blendPixel(pixels, x, y, color);
    }
  }
}

function drawPixelLabel(pixels: Uint8ClampedArray, label: string, color: RgbaColor): void {
  const glyphs = [...label].map((character) => PIXEL_FONT[character] ?? PIXEL_FONT["0"]);
  const scale = label.length >= 3 ? 2 : 3;
  const gap = scale;
  const glyphWidth = 3 * scale;
  const glyphHeight = 5 * scale;
  const totalWidth = glyphs.length * glyphWidth + (glyphs.length - 1) * gap;
  const startX = Math.floor((TRAY_ICON_SIZE - totalWidth) / 2);
  const startY = Math.floor((TRAY_ICON_SIZE - glyphHeight) / 2) + 1;

  glyphs.forEach((glyph, glyphIndex) => {
    const offsetX = startX + glyphIndex * (glyphWidth + gap);
    glyph.forEach((row, rowIndex) => {
      [...row].forEach((cell, columnIndex) => {
        if (cell !== "1") {
          return;
        }

        fillRect(
          pixels,
          offsetX + columnIndex * scale,
          startY + rowIndex * scale,
          scale,
          scale,
          color
        );
      });
    });
  });
}

function fillRect(
  pixels: Uint8ClampedArray,
  x: number,
  y: number,
  width: number,
  height: number,
  color: RgbaColor
): void {
  for (let nextY = y; nextY < y + height; nextY += 1) {
    for (let nextX = x; nextX < x + width; nextX += 1) {
      blendPixel(pixels, nextX, nextY, color);
    }
  }
}

function isInsideRoundedRect(
  pixelX: number,
  pixelY: number,
  rectX: number,
  rectY: number,
  width: number,
  height: number,
  radius: number
): boolean {
  const clampedX = Math.max(rectX + radius, Math.min(pixelX, rectX + width - radius));
  const clampedY = Math.max(rectY + radius, Math.min(pixelY, rectY + height - radius));
  const dx = pixelX - clampedX;
  const dy = pixelY - clampedY;
  return dx * dx + dy * dy <= radius * radius;
}

function getProgressAngleRatio(dx: number, dy: number): number {
  const angle = Math.atan2(dy, dx) + Math.PI / 2;
  return (angle < 0 ? angle + Math.PI * 2 : angle) / (Math.PI * 2);
}

function hexToRgba(hexColor: string): RgbaColor {
  const normalizedHex = hexColor.replace("#", "");
  return {
    r: Number.parseInt(normalizedHex.slice(0, 2), 16),
    g: Number.parseInt(normalizedHex.slice(2, 4), 16),
    b: Number.parseInt(normalizedHex.slice(4, 6), 16),
    a: 255
  };
}

function blendPixel(pixels: Uint8ClampedArray, x: number, y: number, color: RgbaColor): void {
  if (x < 0 || y < 0 || x >= TRAY_ICON_SIZE || y >= TRAY_ICON_SIZE) {
    return;
  }

  const index = (y * TRAY_ICON_SIZE + x) * 4;
  const sourceAlpha = color.a / 255;
  const targetAlpha = pixels[index + 3] / 255;
  const outputAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha);

  if (outputAlpha <= 0) {
    return;
  }

  pixels[index] = Math.round((color.r * sourceAlpha + pixels[index] * targetAlpha * (1 - sourceAlpha)) / outputAlpha);
  pixels[index + 1] = Math.round((color.g * sourceAlpha + pixels[index + 1] * targetAlpha * (1 - sourceAlpha)) / outputAlpha);
  pixels[index + 2] = Math.round((color.b * sourceAlpha + pixels[index + 2] * targetAlpha * (1 - sourceAlpha)) / outputAlpha);
  pixels[index + 3] = Math.round(outputAlpha * 255);
}

function encodePng(width: number, height: number, rgbaPixels: Uint8ClampedArray): Buffer {
  const rowLength = width * 4 + 1;
  const raw = Buffer.alloc(rowLength * height);

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * rowLength;
    raw[rowStart] = 0;
    for (let x = 0; x < width * 4; x += 1) {
      raw[rowStart + 1 + x] = rgbaPixels[y * width * 4 + x];
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    PNG_SIGNATURE,
    createPngChunk("IHDR", header),
    createPngChunk("IDAT", deflateSync(raw)),
    createPngChunk("IEND", Buffer.alloc(0))
  ]);
}

function createPngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  const typeBuffer = Buffer.from(type, "ascii");
  const checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

