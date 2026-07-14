import type { BrowserWindow as BrowserWindowType, IpcMainEvent, IpcMainInvokeEvent, MenuItemConstructorOptions, NativeImage } from "electron";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { LetsPlanApi, formatPlanDate, type DailyPlanView, type PlanReportRequest } from "../modules/api/index.js";
import type { InterventionThresholdLevel } from "../modules/api/intervention.js";
import { createAppSettingsStore, toInterventionSettings, type AppSettings, type AppSettingsPatch } from "./appSettings.js";
import { configureAutoLaunch } from "./autoLaunch.js";
import { buildApplicationMenuTemplate, type BackgroundColorCommand } from "./appMenu.js";
import { buildPetContextMenuTemplate } from "./petContextMenu.js";
import { clampPetWindowPosition, clampPetWindowTargetPosition } from "./petWindowBounds.js";
import { configureAutoUpdates } from "./autoUpdate.js";
import { RENDERER_COMMAND_CHANNELS, REPORT_IPC_CHANNELS, WINDOW_IPC_CHANNELS } from "./ipcChannels.js";
import { getReleaseChannelConfigPath } from "./releaseChannel.js";
import { createRendererStateBroadcaster, type RendererStateEventKind } from "./rendererState.js";
import { registerPlanIpcHandlers } from "./planIpc.js";
import { createSettingsApi, registerSettingsIpcHandlers } from "./settingsIpc.js";
import { buildTrayIconDataUrl, createPlanTray, type PlanTrayController, type PlanTrayStatus } from "./tray.js";

const requireElectron = createRequire(import.meta.url);
const electron = requireElectron("electron") as typeof import("electron");
const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, screen, Tray } = electron;
type BrowserWindow = BrowserWindowType;

interface E2EResult {
  ok: boolean;
  planDate?: string;
  reason?: string;
}

interface PetStatusPayload {
  total: number;
  doneCount: number;
  percentage: number;
  isCompleted: boolean;
  interventionLevel: DailyPlanView["intervention"]["level"];
  interventionAction: DailyPlanView["intervention"]["action"];
  interventionMessage: string;
  nightlySummary: DailyPlanView["nightlySummary"];
}

type RendererView = "planner" | "history" | "pet";

type PlanReportFormat = "markdown" | "pdf" | "excel";
interface PlanReportExportRequest extends PlanReportRequest {
  format: PlanReportFormat;
}

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const builtUiIndexPath = join(currentDirectory, "../../ui/index.html");
const defaultUiDevServerUrl = "http://127.0.0.1:5173";
const isE2E = process.env.LETSPLAN_E2E === "1";
const isPetDragE2E = process.env.LETSPLAN_PET_DRAG_E2E === "1";
const appSettingsStore = createAppSettingsStore(app);
const planApi = new LetsPlanApi(undefined, undefined, () => toInterventionSettings(appSettingsStore.getAppSettings()));
let planTray: PlanTrayController | null = null;
let mainWindow: BrowserWindow | null = null;
let historyWindow: BrowserWindow | null = null;
let petWindow: BrowserWindow | null = null;
let petMousePassthroughState = true;
let lastPetWindowMoveRequest: PetWindowMoveRequest | null = null;
let isQuitting = false;
const rendererState = createRendererStateBroadcaster({
  debounceMs: 80,
  onPlanView: (view) => sendPlanStateToRenderers(view),
  onAppSettings: (settings) => sendAppSettingsToRenderers(settings)
});

registerPlanIpcHandlers(ipcMain, planApi, { onPlanViewChanged: handlePlanViewChanged });
registerSettingsIpcHandlers(ipcMain, createSettingsApi(app, appSettingsStore), { onAppSettingsChanged: broadcastAppSettings });
ipcMain.handle(WINDOW_IPC_CHANNELS.openHistoryWindow, async () => {
  await openHistoryWindow();
  return true;
});

ipcMain.handle(WINDOW_IPC_CHANNELS.openMainWindow, () => {
  showMainWindowFromMenu();
  return true;
});

ipcMain.on(WINDOW_IPC_CHANNELS.openPetContextMenu, (event) => showPetContextMenuFromRenderer(event));
ipcMain.handle(WINDOW_IPC_CHANNELS.movePetWindow, (event, request) => movePetWindowFromRenderer(event, request));
ipcMain.handle(WINDOW_IPC_CHANNELS.setPetMousePassthrough, (event, shouldIgnore) => setPetMousePassthroughFromRenderer(event, shouldIgnore));

ipcMain.handle(REPORT_IPC_CHANNELS.exportPlanReport, async (_event, request) => exportPlanReport(assertPlanReportExportRequest(request)));

async function exportPlanReport(request: PlanReportExportRequest): Promise<{ canceled: boolean; filePath?: string }> {
  const report = planApi.exportPlanReport(request);
  const extension = request.format === "pdf" ? "pdf" : request.format === "excel" ? "xls" : "md";
  const selected = await dialog.showSaveDialog({
    title: "\u5bfc\u51fa\u62a5\u544a",
    defaultPath: join(app.getPath("documents"), `${sanitizeFileName(report.title)}.${extension}`),
    filters: [
      request.format === "pdf"
        ? { name: "PDF", extensions: ["pdf"] }
        : request.format === "excel"
          ? { name: "Excel", extensions: ["xls"] }
          : { name: "Markdown", extensions: ["md"] }
    ]
  });

  if (selected.canceled || !selected.filePath) {
    return { canceled: true };
  }

  const data = request.format === "pdf"
    ? await renderReportPdf(report.html)
    : Buffer.from(request.format === "excel" ? report.excelHtml : report.markdown, "utf8");
  await writeFile(selected.filePath, data);
  return { canceled: false, filePath: selected.filePath };
}

async function renderReportPdf(html: string): Promise<Buffer> {
  const reportWindow = new BrowserWindow({
    show: false,
    width: 794,
    height: 1123,
    backgroundColor: "#ffffff",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  try {
    await reportWindow.loadURL("about:blank");
    await reportWindow.webContents.executeJavaScript(`document.open();document.write(${JSON.stringify(html)});document.close();`, true);
    await waitForReportWindowReady(reportWindow);
    return await printReportPdf(reportWindow);
  } catch {
    await delay(180);
    try {
      await waitForReportWindowReady(reportWindow);
      return await printReportPdf(reportWindow);
    } catch (retryError) {
      throw new Error(`Failed to generate PDF: ${getErrorMessage(retryError)}`);
    }
  } finally {
    reportWindow.destroy();
  }
}

async function waitForReportWindowReady(reportWindow: BrowserWindow): Promise<void> {
  await reportWindow.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const waitFonts = document.fonts && document.fonts.ready ? document.fonts.ready.catch(() => undefined) : Promise.resolve();
      waitFonts.then(() => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
  `, true);
}

async function printReportPdf(reportWindow: BrowserWindow): Promise<Buffer> {
  return reportWindow.webContents.printToPDF({
    printBackground: true,
    pageSize: "A4",
    preferCSSPageSize: true,
    margins: { marginType: "default" }
  });
}

function assertPlanReportExportRequest(value: unknown): PlanReportExportRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Report export request must be an object.");
  }

  const record = value as Record<string, unknown>;
  if (record.period !== "today" && record.period !== "week" && record.period !== "month" && record.period !== "all") {
    throw new Error("Report period must be today, week, month or all.");
  }
  if (record.format !== "markdown" && record.format !== "pdf" && record.format !== "excel") {
    throw new Error("Report format must be markdown, pdf or excel.");
  }

  const request: PlanReportExportRequest = { period: record.period, format: record.format };
  if (record.anchorDate !== undefined) {
    if (typeof record.anchorDate !== "string") {
      throw new Error("Report anchorDate must be a string.");
    }
    request.anchorDate = record.anchorDate;
  }

  return request;
}

function sanitizeFileName(value: string): string {
  return value.replace(/[<>:"/\\|?*]/g, "-");
}
async function createMainWindow(): Promise<void> {
  const nextMainWindow = new BrowserWindow({
    width: 430,
    height: 760,
    minWidth: 390,
    minHeight: 680,
    show: false,
    title: "Let'sPlan",
    webPreferences: {
      preload: join(currentDirectory, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow = nextMainWindow;
  nextMainWindow.on("closed", () => {
    if (mainWindow === nextMainWindow) {
      mainWindow = null;
    }
    if (!isQuitting && !appSettingsStore.getAppSettings().hideToTrayOnClose) {
      app.quit();
    }
  });

  if (!isE2E) {
    nextMainWindow.on("close", (event) => {
      if (isQuitting || !appSettingsStore.getAppSettings().hideToTrayOnClose) {
        return;
      }

      event.preventDefault();
      nextMainWindow.hide();
    });

    nextMainWindow.once("ready-to-show", () => {
      nextMainWindow.show();
    });
  }

  await loadRendererWindow(nextMainWindow, "planner");

  if (!isE2E) {
    planTray?.dispose();
    planTray = createPlanTray({
      app,
      mainWindow: nextMainWindow,
      createImage: (dataUrl) => nativeImage.createFromDataURL(dataUrl),
      createTray: (image) => new Tray(image as NativeImage),
      createMenu: (template) => Menu.buildFromTemplate(template as MenuItemConstructorOptions[]),
      openHistory: () => openHistoryFromTray(nextMainWindow)
    });
    syncPlanTrayStatus();
  }

  if (isE2E) {
    await runE2EVerification(nextMainWindow);
  }
}

function installApplicationMenu(): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      buildApplicationMenuTemplate({
        currentSettings: appSettingsStore.getAppSettings(),
        showMainWindow: showMainWindowFromMenu,
        openHistoryWindow: () => openHistoryWindow(),
        openSettings: openSettingsFromMenu,
        setBackgroundColor: sendBackgroundColorCommand,
        setPetCharacter: (petCharacter) => updateAppSettingsFromMenu({ petCharacter }),
        setInterventionThreshold: (level, minutes) => updateInterventionThresholdFromMenu(level, minutes),
        setNightlySummaryEnabled: (nightlySummaryEnabled) => updateAppSettingsFromMenu({ nightlySummaryEnabled }),
        setNightlySummaryTime: (nightlySummaryTime) => updateAppSettingsFromMenu({ nightlySummaryTime }),
        quit: () => app.quit()
      })
    )
  );
}

function showMainWindowFromMenu(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    void createMainWindow();
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
}

function openControlCenterFromMenu(): void {
  openSettingsFromMenu();
}

function openSettingsFromMenu(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    void createMainWindow().then(() => sendOpenSettingsCommand());
    return;
  }

  showMainWindowFromMenu();
  sendOpenSettingsCommand();
}

function sendOpenSettingsCommand(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(RENDERER_COMMAND_CHANNELS.openSettings);
  }
}

function showPetContextMenuFromRenderer(event: IpcMainEvent): void {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  if (!senderWindow || senderWindow !== petWindow || senderWindow.isDestroyed()) {
    return;
  }

  const menu = Menu.buildFromTemplate(buildPetContextMenuTemplate({
    currentSettings: appSettingsStore.getAppSettings(),
    showMainWindow: showMainWindowFromMenu,
    openControlCenter: openControlCenterFromMenu,
    setPetCharacter: (petCharacter) => updateAppSettingsFromMenu({ petCharacter })
  }));
  menu.popup({ window: senderWindow });
}

function updateAppSettingsFromMenu(patch: AppSettingsPatch): void {
  const nextSettings = appSettingsStore.setAppSettings(patch);
  broadcastAppSettings(nextSettings);
}

function updateInterventionThresholdFromMenu(level: InterventionThresholdLevel, minutes: number): void {
  updateAppSettingsFromMenu({ interventionThresholdMinutes: { [level]: minutes } });
}

function sendBackgroundColorCommand(command: BackgroundColorCommand): void {
  if (command.mode === "custom") {
    showMainWindowFromMenu();
  }

  const targetWindows = command.mode === "custom" && mainWindow && !mainWindow.isDestroyed()
    ? [mainWindow]
    : BrowserWindow.getAllWindows();

  for (const browserWindow of targetWindows) {
    if (!browserWindow.isDestroyed()) {
      browserWindow.webContents.send(RENDERER_COMMAND_CHANNELS.setBackgroundColor, command);
    }
  }
}

async function createPetWindow(): Promise<void> {
  if (isE2E || (petWindow && !petWindow.isDestroyed())) {
    return;
  }

  const workArea = screen.getPrimaryDisplay().workArea;
  const nextPetWindow = new BrowserWindow({
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: workArea.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    show: false,
    title: "LetsPlan Pet",
    webPreferences: {
      preload: join(currentDirectory, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  petWindow = nextPetWindow;
  positionPetWindow(nextPetWindow);
  petMousePassthroughState = true;
  nextPetWindow.setIgnoreMouseEvents(true, { forward: true });
  nextPetWindow.setAlwaysOnTop(true, "floating");
  nextPetWindow.once("ready-to-show", () => {
    nextPetWindow.showInactive();
    syncDesktopPetStatus();
  });
  nextPetWindow.on("closed", () => {
    if (petWindow === nextPetWindow) {
      petWindow = null;
    }
  });

  await loadRendererWindow(nextPetWindow, "pet");
}

function positionPetWindow(browserWindow: BrowserWindow): void {
  const workArea = screen.getPrimaryDisplay().workArea;
  browserWindow.setBounds({
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: workArea.height
  }, false);
}

async function openHistoryWindow(): Promise<void> {
  if (isE2E) {
    return;
  }

  if (historyWindow && !historyWindow.isDestroyed()) {
    if (historyWindow.isMinimized()) {
      historyWindow.restore();
    }
    historyWindow.show();
    historyWindow.focus();
    historyWindow.webContents.send(RENDERER_COMMAND_CHANNELS.openHistory);
    return;
  }

  const nextHistoryWindow = new BrowserWindow({
    width: 430,
    height: 760,
    minWidth: 390,
    minHeight: 680,
    show: false,
    title: "Let'sPlan 历史窗口",
    webPreferences: {
      preload: join(currentDirectory, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  historyWindow = nextHistoryWindow;
  nextHistoryWindow.once("ready-to-show", () => {
    nextHistoryWindow.show();
  });
  nextHistoryWindow.on("closed", () => {
    if (historyWindow === nextHistoryWindow) {
      historyWindow = null;
    }
  });

  await loadRendererWindow(nextHistoryWindow, "history");
}

function openHistoryFromTray(_mainWindow: BrowserWindow): void {
  void openHistoryWindow();
}

async function loadRendererWindow(browserWindow: BrowserWindow, view: RendererView): Promise<void> {
  if (shouldLoadBuiltUi()) {
    await browserWindow.loadFile(
      builtUiIndexPath,
      view === "planner" ? undefined : { query: { view } }
    );
    return;
  }

  const url = new URL(getUiDevServerUrl());
  if (view !== "planner") {
    url.searchParams.set("view", view);
  }
  await browserWindow.loadURL(url.toString());
}

function shouldLoadBuiltUi(): boolean {
  if (app.isPackaged || isE2E) {
    return true;
  }

  if (process.argv.includes("--dev-server") || process.env.LETSPLAN_UI_URL) {
    return false;
  }

  return existsSync(builtUiIndexPath);
}

function getUiDevServerUrl(): string {
  return process.env.LETSPLAN_UI_URL ?? defaultUiDevServerUrl;
}

function shouldConfigureAutoLaunch(): boolean {
  return !isE2E && (app.isPackaged || process.env.LETSPLAN_ENABLE_AUTO_LAUNCH === "1");
}

function handlePlanViewChanged(view: DailyPlanView, kind: RendererStateEventKind): void {
  if (kind === "sync") {
    rendererState.publishPlanView(view, kind);
    return;
  }

  rendererState.enqueuePlanView(view, kind);
}

function syncPlanTrayStatus(): void {
  if (!planTray) {
    return;
  }

  try {
    rendererState.publishPlanView(planApi.getTodayPlan(), "sync");
  } catch (error: unknown) {
    console.error(`[letsplan-tray] ${getErrorMessage(error)}`);
  }
}

function syncDesktopPetStatus(): void {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }

  try {
    rendererState.publishPlanView(planApi.getTodayPlan(), "sync");
  } catch (error: unknown) {
    console.error(`[letsplan-pet] ${getErrorMessage(error)}`);
  }
}

function sendPlanStateToRenderers(view: DailyPlanView): void {
  try {
    updatePlanTrayStatusFromView(view);
    updateDesktopPetStatusFromView(view);
  } catch (error: unknown) {
    console.error(`[letsplan-state] ${getErrorMessage(error)}`);
  }
}

function updatePlanTrayStatusFromView(view: DailyPlanView): void {
  if (view.plan.planDate !== formatPlanDate()) {
    return;
  }

  planTray?.updateStatus(toPlanTrayStatus(view));
}

function toPlanTrayStatus(view: DailyPlanView): PlanTrayStatus {
  return toPetStatus(view);
}

function updateDesktopPetStatusFromView(view: DailyPlanView): void {
  if (view.plan.planDate !== formatPlanDate()) {
    return;
  }

  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send(RENDERER_COMMAND_CHANNELS.updatePetStatus, toPetStatus(view));
  }
}

function toPetStatus(view: DailyPlanView): PetStatusPayload {
  return {
    total: view.stats.total,
    doneCount: view.stats.doneCount,
    percentage: view.stats.percentage,
    isCompleted: view.isCompleted,
    interventionLevel: view.intervention.level,
    interventionAction: view.intervention.action,
    interventionMessage: view.intervention.message,
    nightlySummary: view.nightlySummary
  };
}

function broadcastAppSettings(settings: AppSettings): void {
  rendererState.publishAppSettings(settings);
  if (!isE2E) {
    installApplicationMenu();
  }
  try {
    rendererState.publishPlanView(planApi.getTodayPlan(), "sync");
  } catch (error: unknown) {
    console.error(`[letsplan-settings] ${getErrorMessage(error)}`);
  }
}

function sendAppSettingsToRenderers(settings: AppSettings): void {
  for (const browserWindow of BrowserWindow.getAllWindows()) {
    if (!browserWindow.isDestroyed()) {
      browserWindow.webContents.send(RENDERER_COMMAND_CHANNELS.updateAppSettings, settings);
    }
  }
}

function movePetWindowFromRenderer(event: IpcMainInvokeEvent, request: unknown): boolean {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  if (!senderWindow || senderWindow !== petWindow || senderWindow.isDestroyed()) {
    return false;
  }

  const moveRequest = assertPetWindowMoveRequest(request);
  if (isPetDragE2E) {
    lastPetWindowMoveRequest = moveRequest;
  }


  const [x, y] = senderWindow.getPosition();
  const bounds = senderWindow.getBounds();
  const workAreas = getPetWindowWorkAreas();
  const nextPosition = moveRequest.type === "target"
    ? clampPetWindowTargetPosition({
      targetX: moveRequest.targetX,
      targetY: moveRequest.targetY,
      width: bounds.width,
      height: bounds.height,
      workAreas
    })
    : clampPetWindowPosition({
      x,
      y,
      width: bounds.width,
      height: bounds.height,
      deltaX: moveRequest.deltaX,
      deltaY: moveRequest.deltaY,
      workAreas
    });
  if (x !== nextPosition.x || y !== nextPosition.y) {
    senderWindow.setPosition(nextPosition.x, nextPosition.y, false);
  }
  return true;
}

function getPetWindowWorkAreas() {
  return [screen.getPrimaryDisplay().workArea];
}

function setPetMousePassthroughFromRenderer(event: IpcMainInvokeEvent, shouldIgnore: unknown): boolean {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  if (!senderWindow || senderWindow !== petWindow || senderWindow.isDestroyed()) {
    return false;
  }
  if (typeof shouldIgnore !== "boolean") {
    throw new Error("pet mouse passthrough state must be a boolean.");
  }

  petMousePassthroughState = shouldIgnore;
  if (shouldIgnore) {
    senderWindow.setIgnoreMouseEvents(true, { forward: true });
  } else {
    senderWindow.setIgnoreMouseEvents(false);
  }
  return true;
}

type PetWindowMoveRequest =
  | { type: "delta"; deltaX: number; deltaY: number }
  | { type: "target"; targetX: number; targetY: number };

function assertPetWindowMoveRequest(value: unknown): PetWindowMoveRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("pet window move request must be an object.");
  }

  const record = value as Record<string, unknown>;

  if (record.targetX !== undefined || record.targetY !== undefined) {
    return {
      type: "target",
      targetX: assertFiniteNumber(record.targetX, "targetX"),
      targetY: assertFiniteNumber(record.targetY, "targetY")
    };
  }

  return {
    type: "delta",
    deltaX: assertFiniteNumber(record.deltaX, "deltaX"),
    deltaY: assertFiniteNumber(record.deltaY, "deltaY")
  };
}

function assertFiniteNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(name + " must be a finite number.");
  }

  return value;
}


async function runE2EVerification(mainWindow: BrowserWindow): Promise<void> {
  let result: E2EResult;

  try {
    const trayImage = nativeImage.createFromDataURL(
      buildTrayIconDataUrl({ total: 4, doneCount: 2, percentage: 50, isCompleted: false })
    );
    if (trayImage.isEmpty()) {
      throw new Error("Tray icon image cannot be rendered by Electron nativeImage.");
    }

    result = await mainWindow.webContents.executeJavaScript(
      `
        (async () => {
          const waitFor = (predicate, label = "renderer state", timeoutMs = 10000) => new Promise((resolve, reject) => {
            const startedAt = Date.now();
            const tick = () => {
              if (predicate()) {
                resolve(true);
                return;
              }
              if (Date.now() - startedAt >= timeoutMs) {
                reject(new Error("Timed out waiting for " + label + ": " + String(predicate).slice(0, 180)));
                return;
              }
              setTimeout(tick, 50);
            };
            tick();
          });

          const api = window.letsPlan;
          if (
            !api ||
            typeof api.getTodayPlan !== "function" ||
            typeof api.getPlanByDate !== "function" ||
            typeof api.getRecentPlanSummaries !== "function" ||
            typeof api.onOpenHistory !== "function" ||
            typeof api.onOpenSettings !== "function" ||
            typeof api.getAutoLaunchSettings !== "function" ||
            typeof api.setAutoLaunchOpenAtLogin !== "function" ||
            typeof api.getAppSettings !== "function" ||
            typeof api.setAppSettings !== "function" ||
            typeof api.createHabit !== "function" ||
            typeof api.checkInHabit !== "function" ||
            typeof api.undoHabitCheckIn !== "function" ||
            typeof api.archiveHabit !== "function" ||
            typeof api.onAppSettings !== "function" ||
            typeof api.openHistoryWindow !== "function" ||
            typeof api.openPetContextMenu !== "function" ||
            typeof api.movePetWindow !== "function" ||
            typeof api.setPetMousePassthrough !== "function" ||
            typeof api.addTask !== "function" ||
            typeof api.updateTask !== "function" ||
            typeof api.reorderTasks !== "function" ||
            typeof api.deleteTask !== "function"
          ) {
            return { ok: false, reason: "window.letsPlan is unavailable." };
          }

          await api.getRecentPlanSummaries(30);
          await api.getAppSettings();
          const startedPlan = await api.getTodayPlan();
          const dateInput = document.querySelector('input[type="date"]');
          const previousButton = document.querySelector('[data-e2e="previous-plan-date"]');
          const todayButton = document.querySelector('[data-e2e="today-plan-date"]');
          const historyButton = document.querySelector('[data-e2e="history-window"]');
          const settingsButton = document.querySelector('[data-e2e="settings-toggle"]');
          if (!dateInput || !previousButton || !todayButton || !historyButton || !settingsButton) {
            return { ok: false, reason: "Date navigation, history window, or control center controls were not rendered." };
          }

          await waitFor(() => dateInput.value === startedPlan.plan.planDate);
          settingsButton.click();
          await waitFor(() => document.querySelector('[data-e2e="settings-panel"]') && document.querySelector('[data-e2e="control-category-pet"]'));
          const controlCloseButton = document.querySelector('[data-e2e="control-close"]');
          if (!controlCloseButton) {
            return { ok: false, reason: "Control center close button was not rendered." };
          }
          controlCloseButton.click();
          await waitFor(() => !document.querySelector('[data-e2e="settings-panel"]') && document.querySelector('input[type="date"]'));
          const restoredDateInput = document.querySelector('input[type="date"]');
          const restoredPreviousButton = document.querySelector('[data-e2e="previous-plan-date"]');
          const restoredTodayButton = document.querySelector('[data-e2e="today-plan-date"]');
          if (!restoredDateInput || !restoredPreviousButton || !restoredTodayButton) {
            return { ok: false, reason: "Planner controls were not restored after closing control center." };
          }
          restoredPreviousButton.click();
          await waitFor(() => restoredDateInput.value !== startedPlan.plan.planDate);
          restoredTodayButton.click();
          await waitFor(() => restoredDateInput.value === startedPlan.plan.planDate);

          let taskContent = "E2E startup verification " + Date.now();

          await waitFor(() => document.querySelector('[data-e2e="task-content-input"]') && document.querySelector(".add-button:not(:disabled)"));

          const taskInput = document.querySelector('[data-e2e="task-content-input"]');
          const addButton = document.querySelector(".add-button:not(:disabled)");
          const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
          valueSetter.call(taskInput, taskContent);
          taskInput.dispatchEvent(new Event("input", { bubbles: true }));
          addButton.click();

          await waitFor(() => Array.from(document.querySelectorAll(".task-item p")).some((node) => node.textContent === taskContent));

          let taskItem = Array.from(document.querySelectorAll(".task-item")).find((node) => node.textContent.includes(taskContent));
          if (!taskItem) {
            return { ok: false, reason: "Created task was not rendered." };
          }

          const editButton = taskItem.querySelector('[data-e2e="edit-task"]');
          if (!editButton) {
            return { ok: false, reason: "Edit button was not rendered." };
          }
          editButton.click();

          await waitFor(() => taskItem.querySelector('[data-e2e="task-edit-content"]'));
          const editedTaskContent = taskContent + " edited";
          const editInput = taskItem.querySelector('[data-e2e="task-edit-content"]');
          valueSetter.call(editInput, editedTaskContent);
          editInput.dispatchEvent(new Event("input", { bubbles: true }));
          const saveEditButton = taskItem.querySelector('[data-e2e="save-task-edit"]');
          if (!saveEditButton) {
            return { ok: false, reason: "Save edit button was not rendered." };
          }
          saveEditButton.click();

          await waitFor(() => Array.from(document.querySelectorAll(".task-item p")).some((node) => node.textContent === editedTaskContent));
          taskContent = editedTaskContent;
          taskItem = Array.from(document.querySelectorAll(".task-item")).find((node) => node.textContent.includes(taskContent));
          if (!taskItem) {
            return { ok: false, reason: "Edited task was not rendered." };
          }

          const mainQuestButton = taskItem.querySelector('[data-e2e="toggle-main-quest"]');
          if (!mainQuestButton) {
            return { ok: false, reason: "Main Quest toggle button was not rendered." };
          }
          mainQuestButton.click();
          await waitFor(() => {
            const panel = document.querySelector('[data-e2e="main-quest-panel"]');
            const currentTaskItem = Array.from(document.querySelectorAll(".task-item")).find((node) => node.textContent.includes(taskContent));
            return panel?.textContent.includes(taskContent) && currentTaskItem?.querySelector('[data-e2e="main-quest-badge"]');
          });

          const secondTaskContent = "E2E alternate main quest " + Date.now();
          await waitFor(() => document.querySelector('[data-e2e="task-content-input"]') && document.querySelector(".add-button:not(:disabled)"), "second task form ready");
          const secondTaskInput = document.querySelector('[data-e2e="task-content-input"]');
          const secondAddButton = document.querySelector(".add-button:not(:disabled)");
          if (!secondTaskInput || !secondAddButton) {
            return { ok: false, reason: "Second task form controls were not rendered." };
          }
          valueSetter.call(secondTaskInput, secondTaskContent);
          secondTaskInput.dispatchEvent(new Event("input", { bubbles: true }));
          secondAddButton.click();
          await waitFor(() => Array.from(document.querySelectorAll(".task-item p")).some((node) => node.textContent === secondTaskContent), "second task render");

          let secondTaskItem = Array.from(document.querySelectorAll(".task-item")).find((node) => node.textContent.includes(secondTaskContent));
          const secondMainQuestButton = secondTaskItem ? secondTaskItem.querySelector('[data-e2e="toggle-main-quest"]') : null;
          if (!secondTaskItem || !secondMainQuestButton) {
            return { ok: false, reason: "Second task Main Quest controls were not rendered." };
          }
          secondMainQuestButton.click();
          await waitFor(() => {
            const panel = document.querySelector('[data-e2e="main-quest-panel"]');
            const firstTaskItem = Array.from(document.querySelectorAll(".task-item")).find((node) => node.textContent.includes(taskContent));
            const alternateTaskItem = Array.from(document.querySelectorAll(".task-item")).find((node) => node.textContent.includes(secondTaskContent));
            return panel?.textContent.includes(secondTaskContent)
              && !firstTaskItem?.querySelector('[data-e2e="main-quest-badge"]')
              && alternateTaskItem?.querySelector('[data-e2e="main-quest-badge"]');
          });

          secondTaskItem = Array.from(document.querySelectorAll(".task-item")).find((node) => node.textContent.includes(secondTaskContent));
          secondTaskItem?.querySelector('[data-e2e="toggle-main-quest"]')?.click();
          await waitFor(() => !document.querySelector('[data-e2e="main-quest-panel"]') && !document.querySelector('[data-e2e="main-quest-badge"]'));

          taskItem = Array.from(document.querySelectorAll(".task-item")).find((node) => node.textContent.includes(taskContent));
          const restoredMainQuestButton = taskItem ? taskItem.querySelector('[data-e2e="toggle-main-quest"]') : null;
          if (!taskItem || !restoredMainQuestButton) {
            return { ok: false, reason: "Restored Main Quest task controls were not rendered." };
          }
          restoredMainQuestButton.click();
          await waitFor(() => {
            const panel = document.querySelector('[data-e2e="main-quest-panel"]');
            const currentTaskItem = Array.from(document.querySelectorAll(".task-item")).find((node) => node.textContent.includes(taskContent));
            return panel?.textContent.includes(taskContent) && currentTaskItem?.querySelector('[data-e2e="main-quest-badge"]');
          });

          const completeButton = taskItem.querySelector('[data-e2e="complete-task"]');
          if (!completeButton) {
            return { ok: false, reason: "Complete button was not rendered." };
          }
          completeButton.click();

          await waitFor(() => Array.from(document.querySelectorAll(".task-item.is-done p")).some((node) => node.textContent === taskContent));
          await waitFor(() => {
            const panel = document.querySelector('[data-e2e="main-quest-panel"].is-done');
            return panel?.textContent.includes(taskContent);
          });

          const doneTaskItem = Array.from(document.querySelectorAll(".task-item.is-done")).find((node) =>
            node.textContent.includes(taskContent)
          );
          const deleteButton = doneTaskItem ? doneTaskItem.querySelector('[data-e2e="delete-task"]') : null;
          if (!deleteButton) {
            return { ok: false, reason: "Delete button was not rendered." };
          }
          deleteButton.click();

          await waitFor(() => !Array.from(document.querySelectorAll(".task-item p")).some((node) => node.textContent === taskContent));
          await waitFor(() => !document.querySelector('[data-e2e="main-quest-panel"]') && !document.querySelector('[data-e2e="main-quest-badge"]'));

          const remainingSecondTaskItem = Array.from(document.querySelectorAll(".task-item")).find((node) => node.textContent.includes(secondTaskContent));
          const secondDeleteButton = remainingSecondTaskItem ? remainingSecondTaskItem.querySelector('[data-e2e="delete-task"]') : null;
          if (!secondDeleteButton) {
            return { ok: false, reason: "Second task delete button was not rendered." };
          }
          secondDeleteButton.click();
          await waitFor(() => !Array.from(document.querySelectorAll(".task-item p")).some((node) => node.textContent === secondTaskContent));

          return { ok: true, planDate: startedPlan.plan.planDate };
        })()
      `,
      true
    ) as E2EResult;
  } catch (error) {
    result = {
      ok: false,
      reason: getErrorMessage(error)
    };
  }

  console.log(`[letsplan-e2e] ${JSON.stringify(result)}`);
  app.exit(result.ok ? 0 : 1);
}

async function runPetDragE2EVerification(): Promise<void> {
  let result: E2EResult;

  try {
    if (!petWindow || petWindow.isDestroyed()) {
      throw new Error("Pet window was not created.");
    }

    const targetWindow = petWindow;
    petMousePassthroughState = true;
    targetWindow.setIgnoreMouseEvents(true, { forward: true });
    positionPetWindow(targetWindow);
    await delay(400);
    await targetWindow.webContents.executeJavaScript(
      `(() => {
        const rig = document.querySelector('.pet-rig');
        if (!rig) {
          throw new Error('Desktop pet rig was not rendered.');
        }
        window.__letsPlanPetDragE2E = true;
        rig.style.left = Math.max(0, Math.round((window.innerWidth - rig.offsetWidth) / 2)) + 'px';
        rig.style.top = Math.max(0, Math.round((window.innerHeight - rig.offsetHeight) / 2)) + 'px';
      })()`,
      true
    );

    interface RigSnapshot {
      left: number;
      top: number;
      width: number;
      height: number;
      stageClientX: number;
      stageClientY: number;
      stageOffsetX: number;
      stageOffsetY: number;
    }

    const getRigSnapshot = async (): Promise<RigSnapshot> => targetWindow.webContents.executeJavaScript(
      `(() => {
        const rig = document.querySelector('.pet-rig');
        const stage = document.querySelector('.pet-stage');
        if (!rig || !stage) {
          throw new Error('Desktop pet rig or stage was not rendered.');
        }
        const stageRect = stage.getBoundingClientRect();
        const stageClientX = Math.round(stageRect.left + stageRect.width / 2);
        const stageClientY = Math.round(stageRect.top + stageRect.height / 2);
        return {
          left: Math.round(rig.offsetLeft),
          top: Math.round(rig.offsetTop),
          width: Math.round(rig.offsetWidth),
          height: Math.round(rig.offsetHeight),
          stageClientX,
          stageClientY,
          stageOffsetX: Math.round(stageClientX - rig.offsetLeft),
          stageOffsetY: Math.round(stageClientY - rig.offsetTop)
        };
      })()`,
      true
    ) as Promise<RigSnapshot>;

    const assertGrabbedPoint = async (label: string, x: number, y: number, offsetX: number, offsetY: number): Promise<void> => {
      const windowBounds = targetWindow.getBounds();
      const snapshot = await getRigSnapshot();
      const grabbedX = Math.round(windowBounds.x + snapshot.left + offsetX);
      const grabbedY = Math.round(windowBounds.y + snapshot.top + offsetY);
      const delta = Math.abs(grabbedX - x) + Math.abs(grabbedY - y);
      if (delta > 3) {
        throw new Error(`${label} grabbed point mismatch: grabbed=(${grabbedX},${grabbedY}) target=(${x},${y}) offset=(${offsetX},${offsetY}) rig=${JSON.stringify(snapshot)} window=${JSON.stringify(windowBounds)} lastMove=${JSON.stringify(lastPetWindowMoveRequest)}`);
      }
    };

    const assertRigPosition = async (label: string, expectedLeft: number, expectedTop: number): Promise<void> => {
      const snapshot = await getRigSnapshot();
      const delta = Math.abs(snapshot.left - expectedLeft) + Math.abs(snapshot.top - expectedTop);
      if (delta > 3) {
        throw new Error(`${label} rig position mismatch: actual=(${snapshot.left},${snapshot.top}) expected=(${expectedLeft},${expectedTop}) rig=${JSON.stringify(snapshot)} window=${JSON.stringify(targetWindow.getBounds())}`);
      }
    };

    const assertPassthrough = (label: string, expected: boolean): void => {
      if (petMousePassthroughState !== expected) {
        throw new Error(`${label} passthrough mismatch: actual=${petMousePassthroughState} expected=${expected}`);
      }
    };

    const waitForPassthrough = async (label: string, expected: boolean, timeoutMs = 1500): Promise<void> => {
      const startedAt = Date.now();
      while (Date.now() - startedAt <= timeoutMs) {
        if (petMousePassthroughState === expected) {
          return;
        }
        await delay(50);
      }
      assertPassthrough(label, expected);
    };

    const assertPetDizzy = async (label: string, expected: boolean): Promise<void> => {
      const isDizzy = await targetWindow.webContents.executeJavaScript(
        `(() => {
          const shell = document.querySelector('[data-e2e="desktop-pet"]');
          if (!shell) {
            throw new Error('Desktop pet shell was not rendered.');
          }
          return shell.classList.contains('pet-dizzy');
        })()`,
        true
      ) as boolean;
      if (isDizzy !== expected) {
        throw new Error(`${label} dizzy mismatch: actual=${isDizzy} expected=${expected}`);
      }
    };

    const centerPetRig = async (): Promise<void> => {
      await targetWindow.webContents.executeJavaScript(
        `(() => {
          const rig = document.querySelector('.pet-rig');
          if (!rig) {
            throw new Error('Desktop pet rig was not rendered.');
          }
          rig.style.left = Math.max(0, Math.round((window.innerWidth - rig.offsetWidth) / 2)) + 'px';
          rig.style.top = Math.max(0, Math.round((window.innerHeight - rig.offsetHeight) / 2)) + 'px';
        })()`,
        true
      );
      await delay(120);
    };

    const getStageGrabPoint = async (): Promise<{ screenX: number; screenY: number; offsetX: number; offsetY: number }> => {
      const snapshot = await getRigSnapshot();
      const bounds = targetWindow.getBounds();
      return {
        screenX: Math.round(bounds.x + snapshot.stageClientX),
        screenY: Math.round(bounds.y + snapshot.stageClientY),
        offsetX: snapshot.stageOffsetX,
        offsetY: snapshot.stageOffsetY
      };
    };

    const dispatch = async (
      type: "pointerdown" | "pointermove" | "pointerup",
      screenX: number,
      screenY: number,
      buttons: number,
      hitTarget: "stage" | "outside" = "stage"
    ): Promise<void> => {
      const bounds = targetWindow.getBounds();
      const clientX = hitTarget === "outside" ? 4 : screenX - bounds.x;
      const clientY = hitTarget === "outside" ? 4 : screenY - bounds.y;
      await targetWindow.webContents.executeJavaScript(
        `(() => {
          const shell = document.querySelector('[data-e2e="desktop-pet"]');
          if (!shell) {
            throw new Error('Desktop pet shell was not rendered.');
          }
          const clientX = ${clientX};
          const clientY = ${clientY};
          const event = new PointerEvent(${JSON.stringify(type)}, {
            bubbles: true,
            cancelable: true,
            pointerId: 42,
            pointerType: 'mouse',
            isPrimary: true,
            button: ${type === "pointerup" ? 0 : type === "pointerdown" ? 0 : -1},
            buttons: ${buttons},
            clientX,
            clientY,
            screenX: ${screenX},
            screenY: ${screenY}
          });
          const defineEventCoordinates = (targetEvent) => Object.defineProperties(targetEvent, {
            button: { value: ${type === "pointerup" ? 0 : type === "pointerdown" ? 0 : -1} },
            buttons: { value: ${buttons} },
            clientX: { value: clientX },
            clientY: { value: clientY },
            screenX: { value: ${screenX} },
            screenY: { value: ${screenY} },
            __letsPlanPetDragSynthetic: { value: true }
          });
          defineEventCoordinates(event);
          shell.dispatchEvent(event);
          const mouseType = ${JSON.stringify(type)} === 'pointerdown'
            ? 'mousedown'
            : ${JSON.stringify(type)} === 'pointerup'
              ? 'mouseup'
              : 'mousemove';
          const mouseEvent = new MouseEvent(mouseType, {
            bubbles: true,
            cancelable: true,
            button: mouseType === 'mousemove' ? -1 : 0,
            buttons: ${buttons},
            clientX,
            clientY,
            screenX: ${screenX},
            screenY: ${screenY}
          });
          defineEventCoordinates(mouseEvent);
          shell.dispatchEvent(mouseEvent);
          if (mouseType !== 'mousedown') {
            window.dispatchEvent(mouseEvent);
          }
          if (${JSON.stringify(type)} !== 'pointerdown') {
            const windowEvent = new PointerEvent(${JSON.stringify(type)}, {
              bubbles: true,
              cancelable: true,
              pointerId: 42,
              pointerType: 'mouse',
              isPrimary: true
            });
            defineEventCoordinates(windowEvent);
            window.dispatchEvent(windowEvent);
          }
        })()`,
        true
      );
    };

    const dispatchPointerCancel = async (screenX: number, screenY: number): Promise<void> => {
      const bounds = targetWindow.getBounds();
      await targetWindow.webContents.executeJavaScript(
        `(() => {
          const shell = document.querySelector('[data-e2e="desktop-pet"]');
          if (!shell) {
            throw new Error('Desktop pet shell was not rendered.');
          }
          const event = new PointerEvent('pointercancel', {
            bubbles: true,
            cancelable: true,
            pointerId: 42,
            pointerType: 'mouse',
            isPrimary: true,
            button: 0,
            buttons: 0,
            clientX: ${screenX - bounds.x},
            clientY: ${screenY - bounds.y},
            screenX: ${screenX},
            screenY: ${screenY}
          });
          Object.defineProperties(event, {
            button: { value: 0 },
            buttons: { value: 0 },
            clientX: { value: ${screenX - bounds.x} },
            clientY: { value: ${screenY - bounds.y} },
            screenX: { value: ${screenX} },
            screenY: { value: ${screenY} },
            __letsPlanPetDragSynthetic: { value: true }
          });
          shell.dispatchEvent(event);
        })()`,
        true
      );
    };

    const moveInsidePetAndWait = async (label: string): Promise<{ screenX: number; screenY: number; offsetX: number; offsetY: number }> => {
      let latest = await getStageGrabPoint();
      for (let attempt = 0; attempt < 12; attempt += 1) {
        latest = await getStageGrabPoint();
        await dispatch("pointermove", latest.screenX, latest.screenY, 0, "stage");
        await delay(100);
        if (petMousePassthroughState === false) {
          return latest;
        }
      }
      assertPassthrough(label, false);
      return latest;
    };

    const dragPatterns = [
      { deltaX: -70, deltaY: 45 },
      { deltaX: 85, deltaY: -35 },
      { deltaX: -60, deltaY: -50 },
      { deltaX: 100, deltaY: 40 },
      { deltaX: -95, deltaY: 30 },
      { deltaX: 75, deltaY: 65 },
      { deltaX: -45, deltaY: 70 }
    ];
    const dragRounds = [
      { deltaX: 90, deltaY: 55, holdChecks: 30, postMoveHoldChecks: 12, moveSteps: 42, cancelAfterHoldIndex: 14 },
      ...Array.from({ length: 14 }, (_, index) => {
        const pattern = dragPatterns[index % dragPatterns.length];
        return { ...pattern, holdChecks: 2, postMoveHoldChecks: 2, moveSteps: 18, cancelAfterHoldIndex: -1 };
      })
    ];

    for (const [roundIndex, round] of dragRounds.entries()) {
      let grab = await getStageGrabPoint();
      await dispatch("pointermove", grab.screenX - grab.offsetX + 4, grab.screenY - grab.offsetY + 4, 0, "outside");
      await delay(150);
      assertPassthrough(`round ${roundIndex + 1} outside before drag`, true);

      grab = await moveInsidePetAndWait(`round ${roundIndex + 1} inside before drag`);

      const dragGrab = await getStageGrabPoint();
      const beforeDown = await getRigSnapshot();
      await dispatch("pointerdown", dragGrab.screenX, dragGrab.screenY, 1);
      await delay(250);
      const afterDown = await getRigSnapshot();
      if (beforeDown.left !== afterDown.left || beforeDown.top !== afterDown.top) {
        throw new Error(`round ${roundIndex + 1} moved on mousedown without mouse movement: before=${JSON.stringify(beforeDown)} after=${JSON.stringify(afterDown)}`);
      }
      await assertGrabbedPoint(`round ${roundIndex + 1} after mousedown`, dragGrab.screenX, dragGrab.screenY, dragGrab.offsetX, dragGrab.offsetY);

      for (let index = 0; index < round.holdChecks; index += 1) {
        await delay(500);
        await assertGrabbedPoint(`round ${roundIndex + 1} static hold`, dragGrab.screenX, dragGrab.screenY, dragGrab.offsetX, dragGrab.offsetY);
        if (round.cancelAfterHoldIndex === index) {
          await dispatchPointerCancel(dragGrab.screenX, dragGrab.screenY);
          await delay(250);
          await assertGrabbedPoint(`round ${roundIndex + 1} after pointercancel`, dragGrab.screenX, dragGrab.screenY, dragGrab.offsetX, dragGrab.offsetY);
        }
      }

      const moveX = dragGrab.screenX + round.deltaX;
      const moveY = dragGrab.screenY + round.deltaY;
      for (let step = 1; step <= round.moveSteps; step += 1) {
        const stepX = Math.round(dragGrab.screenX + (round.deltaX * step) / round.moveSteps);
        const stepY = Math.round(dragGrab.screenY + (round.deltaY * step) / round.moveSteps);
        await dispatch("pointermove", stepX, stepY, 1);
        await delay(step === round.moveSteps || step % 8 === 0 ? 80 : 16);
        if (step === round.moveSteps || step % 8 === 0) {
          await assertGrabbedPoint(`round ${roundIndex + 1} moving step ${step}`, stepX, stepY, dragGrab.offsetX, dragGrab.offsetY);
        }
      }
      await assertGrabbedPoint(`round ${roundIndex + 1} after mousemove`, moveX, moveY, dragGrab.offsetX, dragGrab.offsetY);

      for (let index = 0; index < round.postMoveHoldChecks; index += 1) {
        await delay(500);
        await assertGrabbedPoint(`round ${roundIndex + 1} static hold after move`, moveX, moveY, dragGrab.offsetX, dragGrab.offsetY);
      }

      await dispatch("pointerup", moveX, moveY, 0);
      await waitForPassthrough(`round ${roundIndex + 1} after release over pet`, false);

      const released = await getRigSnapshot();
      await dispatch("pointermove", moveX + 120, moveY + 60, 0, "outside");
      await waitForPassthrough(`round ${roundIndex + 1} outside after release`, true);
      const afterRelease = await getRigSnapshot();
      if (released.left !== afterRelease.left || released.top !== afterRelease.top) {
        throw new Error(`Pet moved after round ${roundIndex + 1} release: before=${JSON.stringify(released)} after=${JSON.stringify(afterRelease)}`);
      }
    }

    await centerPetRig();
    const dizzyGrab = await getStageGrabPoint();
    await dispatch("pointermove", dizzyGrab.screenX, dizzyGrab.screenY, 0, "stage");
    await delay(150);
    await dispatch("pointerdown", dizzyGrab.screenX, dizzyGrab.screenY, 1);
    await delay(120);
    let dizzyMoveX = dizzyGrab.screenX;
    const dizzyMoveY = dizzyGrab.screenY;
    for (let step = 1; step <= 12; step += 1) {
      dizzyMoveX = dizzyGrab.screenX + (step % 2 === 0 ? -82 : 82);
      await dispatch("pointermove", dizzyMoveX, dizzyMoveY, 1);
      await delay(280);
      if (step % 3 === 0) {
        await assertGrabbedPoint(`dizzy shake step ${step}`, dizzyMoveX, dizzyMoveY, dizzyGrab.offsetX, dizzyGrab.offsetY);
      }
    }
    await delay(120);
    await assertPetDizzy("after back-and-forth shake", true);
    const dizzyDragX = dizzyMoveX + 58;
    const dizzyDragY = dizzyMoveY + 36;
    await dispatch("pointermove", dizzyDragX, dizzyDragY, 1);
    await delay(180);
    await assertGrabbedPoint("drag while dizzy", dizzyDragX, dizzyDragY, dizzyGrab.offsetX, dizzyGrab.offsetY);
    await dispatch("pointerup", dizzyDragX, dizzyDragY, 0);
    await delay(3600);
    await assertPetDizzy("after dizzy recovery", false);

    const dragDomToAndExpectRig = async (label: string, screenX: number, screenY: number, expectedLeft: number, expectedTop: number): Promise<void> => {
      const grab = await getStageGrabPoint();
      await dispatch("pointerdown", grab.screenX, grab.screenY, 1);
      await delay(120);
      await dispatch("pointermove", screenX, screenY, 1);
      await delay(160);
      await assertRigPosition(label, expectedLeft, expectedTop);
      await dispatch("pointerup", screenX, screenY, 0);
      await delay(120);
    };

    const dragAcrossFullWorkArea = async (label: string): Promise<void> => {
      const bounds = targetWindow.getBounds();
      const snapshot = await getRigSnapshot();
      const maxX = Math.max(0, bounds.width - snapshot.width);
      const maxY = Math.max(0, bounds.height - snapshot.height);
      const beyondLeft = bounds.x - snapshot.width * 2;
      const beyondRight = bounds.x + bounds.width + snapshot.width * 2;
      const beyondTop = bounds.y - snapshot.height * 2;
      const beyondBottom = bounds.y + bounds.height + snapshot.height * 2;
      await dragDomToAndExpectRig(`${label} top-left`, beyondLeft, beyondTop, 0, 0);
      await dragDomToAndExpectRig(`${label} top-right`, beyondRight, beyondTop, maxX, 0);
      await dragDomToAndExpectRig(`${label} bottom-right`, beyondRight, beyondBottom, maxX, maxY);
      await dragDomToAndExpectRig(`${label} bottom-left`, beyondLeft, beyondBottom, 0, maxY);
    };

    await dragAcrossFullWorkArea("edge pass 1");
    await dragAcrossFullWorkArea("edge pass 2");

    type PetInterventionE2ELevel = DailyPlanView["intervention"]["level"];
    type PetInterventionE2EAction = DailyPlanView["intervention"]["action"];
    interface PetInterventionStageSnapshot {
      stage: string | null;
      className: string;
      hasForceText: boolean;
      forceText: string;
      left: number;
      top: number;
      width: number;
      height: number;
      viewportWidth: number;
      viewportHeight: number;
    }

    const sendPetInterventionStatus = async (level: PetInterventionE2ELevel, action: PetInterventionE2EAction, message: string): Promise<void> => {
      targetWindow.webContents.send(RENDERER_COMMAND_CHANNELS.updatePetStatus, {
        total: 1,
        doneCount: 0,
        percentage: 0,
        isCompleted: false,
        interventionLevel: level,
        interventionAction: action,
        interventionMessage: message,
        nightlySummary: {
          shouldShow: false,
          planDate: formatPlanDate(),
          summaryTime: "21:30",
          total: 1,
          doneCount: 0,
          pendingCount: 1,
          pendingTasks: [],
          message: ""
        }
      });
      await delay(300);
    };

    const getInterventionStageSnapshot = async (): Promise<PetInterventionStageSnapshot> => targetWindow.webContents.executeJavaScript(
      `(() => {
        const shell = document.querySelector('[data-e2e="desktop-pet"]');
        const rig = document.querySelector('.pet-rig');
        if (!shell || !rig) {
          throw new Error('Desktop pet shell or rig was not rendered.');
        }
        const forceText = document.querySelector('[data-e2e="pet-force-text-field"]');
        return {
          stage: shell.getAttribute('data-intervention-stage'),
          className: shell.className,
          hasForceText: Boolean(forceText),
          forceText: forceText?.textContent || '',
          left: Math.round(rig.offsetLeft),
          top: Math.round(rig.offsetTop),
          width: Math.round(rig.offsetWidth),
          height: Math.round(rig.offsetHeight),
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight
        };
      })()`,
      true
    ) as Promise<PetInterventionStageSnapshot>;

    const assertInterventionStage = async (expectedStage: string, label: string): Promise<PetInterventionStageSnapshot> => {
      const snapshot = await getInterventionStageSnapshot();
      if (snapshot.stage !== expectedStage) {
        throw new Error(`${label} stage mismatch: actual=${snapshot.stage} expected=${expectedStage} snapshot=${JSON.stringify(snapshot)}`);
      }
      return snapshot;
    };
    const forceReminderMessage = "\u5feb\u53bb\u5b66\u4e60\uff01";

    await sendPetInterventionStatus("l1", "hint", "10 minutes idle, move once.");
    const stage1 = await assertInterventionStage("stage1", "L1 language reminder");
    if (!stage1.className.includes("pet-action-hint") || stage1.hasForceText) {
      throw new Error(`L1 reminder rendered unexpected chrome: ${JSON.stringify(stage1)}`);
    }

    await sendPetInterventionStatus("l2", "pet-approach", "20 minutes idle, bottom runner reminder.");
    const stage2Start = await assertInterventionStage("stage2", "L2 bottom runner start");
    await delay(900);
    const stage2End = await assertInterventionStage("stage2", "L2 bottom runner end");
    const stage2Bottom = Math.max(0, stage2End.viewportHeight - stage2End.height);
    if (Math.abs(stage2End.top - stage2Bottom) > 4 || Math.abs(stage2End.left - stage2Start.left) < 12) {
      throw new Error(`L2 bottom runner did not move along bottom: start=${JSON.stringify(stage2Start)} end=${JSON.stringify(stage2End)}`);
    }

    await sendPetInterventionStatus("l3", "center-intervention", "30 minutes idle, fullscreen runner reminder.");
    const stage3Start = await assertInterventionStage("stage3", "L3 fullscreen runner start");
    await delay(900);
    const stage3End = await assertInterventionStage("stage3", "L3 fullscreen runner end");
    if (Math.abs(stage3End.left - stage3Start.left) + Math.abs(stage3End.top - stage3Start.top) < 24) {
      throw new Error(`L3 fullscreen runner did not move enough: start=${JSON.stringify(stage3Start)} end=${JSON.stringify(stage3End)}`);
    }

    await sendPetInterventionStatus("l4", "force-animation", forceReminderMessage);
    const stage4Start = await assertInterventionStage("stage4", "L4 force start");
    const stage4CenterX = Math.round(Math.max(0, stage4Start.viewportWidth - stage4Start.width) / 2);
    const stage4CenterY = Math.round(Math.max(0, stage4Start.viewportHeight - stage4Start.height) / 2);
    if (!stage4Start.hasForceText || !stage4Start.forceText.includes(forceReminderMessage) || Math.abs(stage4Start.left - stage4CenterX) > 4 || Math.abs(stage4Start.top - stage4CenterY) > 4) {
      throw new Error(`L4 force reminder was not centered with study text: ${JSON.stringify(stage4Start)}`);
    }
    await delay(10500);
    const stage4End = await getInterventionStageSnapshot();
    if (stage4End.stage === "stage4" || stage4End.hasForceText) {
      throw new Error(`L4 force reminder did not stop after 10s: ${JSON.stringify(stage4End)}`);
    }
    await sendPetInterventionStatus("none", "none", "");
    const dispatchClick = async (screenX: number, screenY: number): Promise<void> => {
      const bounds = targetWindow.getBounds();
      await targetWindow.webContents.executeJavaScript(
        `(() => {
          const shell = document.querySelector('[data-e2e="desktop-pet"]');
          if (!shell) {
            throw new Error('Desktop pet shell was not rendered.');
          }
          const event = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            button: 0,
            buttons: 0,
            clientX: ${screenX - bounds.x},
            clientY: ${screenY - bounds.y},
            screenX: ${screenX},
            screenY: ${screenY}
          });
          shell.dispatchEvent(event);
        })()`,
        true
      );
    };

    const clickGrab = await getStageGrabPoint();
    await dispatch("pointermove", clickGrab.screenX, clickGrab.screenY, 0, "stage");
    await waitForPassthrough("inside before repeated quick clicks", false);
    const beforeClicks = await getRigSnapshot();
    for (let index = 0; index < 31; index += 1) {
      await dispatchClick(clickGrab.screenX, clickGrab.screenY);
      await delay(60);
    }
    await delay(400);
    const afterClicks = await getRigSnapshot();
    if (beforeClicks.left === afterClicks.left && beforeClicks.top === afterClicks.top) {
      throw new Error(`Repeated quick left clicks did not trigger dodge: rig=${JSON.stringify(afterClicks)}`);
    }

    result = { ok: true, planDate: new Date().toISOString().slice(0, 10) };
  } catch (error) {
    result = {
      ok: false,
      reason: getErrorMessage(error)
    };
  }

  console.log(`[letsplan-pet-drag-e2e] ${JSON.stringify(result)}`);
  app.exit(result.ok ? 0 : 1);
}
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

app.whenReady().then(async () => {
  installApplicationMenu();

  if (shouldConfigureAutoLaunch()) {
    configureAutoLaunch(app);
  }

  await createMainWindow();
  await createPetWindow();
  if (isPetDragE2E) {
    await runPetDragE2EVerification();
    return;
  }
  configureAutoUpdates({
    app,
    configPath: getReleaseChannelConfigPath(currentDirectory),
    isE2E
  });

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
}).catch((error: unknown) => {
  console.error(getErrorMessage(error));
  app.exit(1);
});

app.on("before-quit", () => {
  isQuitting = true;
  rendererState.dispose();
  planTray?.dispose();
  planTray = null;
  historyWindow = null;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && !isQuitting) {
    app.quit();
  }
});
