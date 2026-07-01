import { describe, expect, it } from "vitest";
import { buildTrayIconDataUrl, createPlanTray, TRAY_ICON_DATA_URL, type CreatePlanTrayOptions, type TrayLike, type TrayMenuItem } from "../../../src/main/tray.js";

class FakeWindow {
  readonly calls: string[] = [];
  minimized = false;

  isMinimized(): boolean {
    return this.minimized;
  }

  restore(): void {
    this.calls.push("restore");
    this.minimized = false;
  }

  show(): void {
    this.calls.push("show");
  }

  focus(): void {
    this.calls.push("focus");
  }
}

class FakeApp {
  quitCalled = false;

  quit(): void {
    this.quitCalled = true;
  }
}

class FakeTray implements TrayLike {
  toolTip = "";
  contextMenu: unknown = null;
  destroyed = false;
  readonly images: unknown[] = [];
  readonly listeners = new Map<string, () => void>();

  constructor(readonly icon: unknown) {}

  setImage(image: unknown): void {
    this.images.push(image);
  }

  setToolTip(toolTip: string): void {
    this.toolTip = toolTip;
  }

  setContextMenu(menu: unknown): void {
    this.contextMenu = menu;
  }

  on(eventName: "click" | "double-click", listener: () => void): void {
    this.listeners.set(eventName, listener);
  }

  destroy(): void {
    this.destroyed = true;
  }
}

function createTestTray(options: Partial<CreatePlanTrayOptions> = {}): {
  app: FakeApp;
  mainWindow: FakeWindow;
  createdTray: FakeTray;
  contextMenu: TrayMenuItem[];
  controller: ReturnType<typeof createPlanTray>;
} {
  const mainWindow = new FakeWindow();
  const app = new FakeApp();
  const createdTrays: FakeTray[] = [];

  const controller = createPlanTray({
    app,
    mainWindow,
    createImage: (dataUrl) => dataUrl,
    createTray: (icon) => {
      const tray = new FakeTray(icon);
      createdTrays.push(tray);
      return tray;
    },
    createMenu: (template) => template,
    ...options
  });
  const createdTray = createdTrays[0];

  return {
    app,
    mainWindow,
    createdTray,
    contextMenu: createdTray.contextMenu as TrayMenuItem[],
    controller
  };
}

describe("createPlanTray", () => {
  it("builds PNG tray icons that Windows can render reliably", () => {
    expect(TRAY_ICON_DATA_URL.startsWith("data:image/png;base64,")).toBe(true);
    expect(buildTrayIconDataUrl({ total: 3, doneCount: 1, percentage: 33, isCompleted: false })).toContain("base64,");
  });

  it("creates a tray menu for opening the planner and quitting", () => {
    const { app, mainWindow, createdTray, contextMenu, controller } = createTestTray();

    expect(createdTray.icon).toBe(TRAY_ICON_DATA_URL);
    expect(createdTray.images).toEqual([TRAY_ICON_DATA_URL]);
    expect(createdTray.toolTip).toBe("Let'sPlan · 今日进度待同步");
    expect(contextMenu).toEqual([
      expect.objectContaining({ label: "今日进度：待同步", enabled: false }),
      expect.objectContaining({ type: "separator" }),
      expect.objectContaining({ label: "打开主窗口" }),
      expect.objectContaining({ label: "今日计划" }),
      expect.objectContaining({ label: "历史记录" }),
      expect.objectContaining({ type: "separator" }),
      expect.objectContaining({ label: "退出" })
    ]);

    createdTray.listeners.get("click")?.();
    expect(mainWindow.calls).toEqual(["show", "focus"]);

    const exitItem = contextMenu.find((item) => item.label === "退出");
    exitItem?.click?.();
    expect(app.quitCalled).toBe(true);

    controller.dispose();
    expect(createdTray.destroyed).toBe(true);
  });

  it("routes the history menu item through the history opener", () => {
    let openHistoryCalls = 0;
    const { contextMenu } = createTestTray({
      openHistory: () => {
        openHistoryCalls += 1;
      }
    });

    const historyItem = contextMenu.find((item) => item.label === "历史记录");
    historyItem?.click?.();

    expect(openHistoryCalls).toBe(1);
  });

  it("refreshes tooltip, menu labels, and icon when today's progress changes", () => {
    const { createdTray, controller } = createTestTray();

    controller.updateStatus({
      total: 4,
      doneCount: 2,
      percentage: 50,
      isCompleted: false
    });

    expect(createdTray.toolTip).toBe("Let'sPlan · 今日 50% (2/4)");
    expect(createdTray.images.at(-1)).toBe(buildTrayIconDataUrl({ total: 4, doneCount: 2, percentage: 50, isCompleted: false }));
    expect(createdTray.contextMenu).toEqual([
      expect.objectContaining({ label: "今日进度：50%（2/4）", enabled: false }),
      expect.any(Object),
      expect.any(Object),
      expect.any(Object),
      expect.any(Object),
      expect.any(Object),
      expect.any(Object)
    ]);

    controller.updateStatus({
      total: 2,
      doneCount: 2,
      percentage: 100,
      isCompleted: true
    });

    expect(createdTray.toolTip).toBe("Let'sPlan · 今日已完成 (2/2)");
    expect(createdTray.images.at(-1)).toBe(buildTrayIconDataUrl({ total: 2, doneCount: 2, percentage: 100, isCompleted: true }));
    expect(createdTray.contextMenu).toEqual([
      expect.objectContaining({ label: "今日进度：已完成（2/2）", enabled: false }),
      expect.any(Object),
      expect.any(Object),
      expect.any(Object),
      expect.any(Object),
      expect.any(Object),
      expect.any(Object)
    ]);
  });

  it("restores minimized windows before showing them", () => {
    const mainWindow = new FakeWindow();
    mainWindow.minimized = true;

    createPlanTray({
      app: new FakeApp(),
      mainWindow,
      createImage: (dataUrl) => dataUrl,
      createTray: (icon) => new FakeTray(icon),
      createMenu: (template) => template
    }).showMainWindow();

    expect(mainWindow.calls).toEqual(["restore", "show", "focus"]);
  });
});
