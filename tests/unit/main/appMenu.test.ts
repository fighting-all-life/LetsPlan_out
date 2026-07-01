import type { MenuItemConstructorOptions } from "electron";
import { describe, expect, it } from "vitest";
import { buildApplicationMenuTemplate, type BackgroundColorCommand } from "../../../src/main/appMenu.js";
import { DEFAULT_APP_SETTINGS } from "../../../src/main/appSettings.js";

function getSubmenu(template: MenuItemConstructorOptions[], label: string): MenuItemConstructorOptions[] {
  const menu = template.find((item) => item.label === label);
  return Array.isArray(menu?.submenu) ? menu.submenu : [];
}

function createTemplate(commands: BackgroundColorCommand[] = [], calls: string[] = []): MenuItemConstructorOptions[] {
  return buildApplicationMenuTemplate({
    currentSettings: DEFAULT_APP_SETTINGS,
    showMainWindow: () => {
      calls.push("show");
    },
    openHistoryWindow: () => {
      calls.push("history");
    },
    openSettings: () => {
      calls.push("settings");
    },
    setBackgroundColor: (command) => {
      commands.push(command);
    },
    setPetCharacter: (petCharacter) => {
      calls.push("pet:" + petCharacter);
    },
    setInterventionThreshold: (level, minutes) => {
      calls.push("threshold:" + level + ":" + minutes);
    },
    setNightlySummaryEnabled: (enabled) => {
      calls.push("nightly-enabled:" + String(enabled));
    },
    setNightlySummaryTime: (time) => {
      calls.push("nightly-time:" + time);
    },
    quit: () => {
      calls.push("quit");
    }
  });
}

describe("buildApplicationMenuTemplate", () => {
  it("uses Chinese labels and keeps Edit focused on background color", () => {
    const template = createTemplate();

    expect(template.map((item) => item.label)).toEqual(["\u6587\u4ef6", "\u7f16\u8f91", "\u684c\u5ba0", "\u89c6\u56fe", "\u7a97\u53e3"]);
    expect(getSubmenu(template, "\u7f16\u8f91").map((item) => item.label ?? item.type)).toEqual(["\u80cc\u666f\u989c\u8272"]);

    const backgroundMenu = getSubmenu(template, "\u7f16\u8f91")[0];
    const backgroundSubmenu = Array.isArray(backgroundMenu.submenu) ? backgroundMenu.submenu : [];
    expect(backgroundSubmenu.map((item) => item.label ?? item.type)).toEqual(["\u5e38\u89c4\u8272", "separator", "\u81ea\u5b9a\u4e49..."]);
  });

  it("wires file menu commands to app actions", () => {
    const calls: string[] = [];
    const template = createTemplate([], calls);
    const fileMenu = getSubmenu(template, "\u6587\u4ef6");

    (fileMenu.find((item) => item.label === "\u6253\u5f00\u4e3b\u7a97\u53e3")?.click as (() => void) | undefined)?.();
    (fileMenu.find((item) => item.label === "\u6253\u5f00\u5386\u53f2\u7a97\u53e3")?.click as (() => void) | undefined)?.();
    (fileMenu.find((item) => item.label === "\u9000\u51fa")?.click as (() => void) | undefined)?.();

    expect(calls).toEqual(["show", "history", "quit"]);
  });

  it("wires pet menu commands", () => {
    const calls: string[] = [];
    const template = createTemplate([], calls);
    const petMenu = getSubmenu(template, "\u684c\u5ba0");
    const characterSubmenu = Array.isArray(petMenu[0]?.submenu) ? petMenu[0].submenu : [];
    const thresholdMenu = petMenu.find((item) => item.label === "\u5e72\u9884\u5b9a\u65f6");
    const thresholdSubmenu = Array.isArray(thresholdMenu?.submenu) ? thresholdMenu.submenu : [];
    const l1Submenu = Array.isArray(thresholdSubmenu[0]?.submenu) ? thresholdSubmenu[0].submenu : [];
    const nightlyMenu = petMenu.find((item) => item.label === "\u591c\u95f4\u603b\u7ed3");
    const nightlySubmenu = Array.isArray(nightlyMenu?.submenu) ? nightlyMenu.submenu : [];

    (characterSubmenu.find((item) => item.label === "\u72d7")?.click as (() => void) | undefined)?.();
    (l1Submenu.find((item) => item.label === "5 \u5206\u949f")?.click as (() => void) | undefined)?.();
    (nightlySubmenu.find((item) => item.label === "\u542f\u7528\u591c\u95f4\u603b\u7ed3")?.click as (() => void) | undefined)?.();
    (nightlySubmenu.find((item) => item.label === "22:00")?.click as (() => void) | undefined)?.();
    (petMenu.find((item) => item.label === "\u6253\u5f00\u684c\u5ba0\u8bbe\u7f6e")?.click as (() => void) | undefined)?.();

    expect(calls).toEqual(["pet:dog", "threshold:l1:5", "nightly-enabled:false", "nightly-time:22:00", "settings"]);
  });

  it("wires background color commands", () => {
    const commands: BackgroundColorCommand[] = [];
    const template = createTemplate(commands);
    const backgroundMenu = getSubmenu(template, "\u7f16\u8f91")[0];
    const backgroundSubmenu = Array.isArray(backgroundMenu.submenu) ? backgroundMenu.submenu : [];
    const regularMenu = backgroundSubmenu.find((item) => item.label === "\u5e38\u89c4\u8272");
    const regularSubmenu = Array.isArray(regularMenu?.submenu) ? regularMenu.submenu : [];

    (regularSubmenu[0]?.click as (() => void) | undefined)?.();
    (backgroundSubmenu.find((item) => item.label === "\u81ea\u5b9a\u4e49...")?.click as (() => void) | undefined)?.();

    expect(commands).toEqual([{ mode: "preset", color: "#05060a" }, { mode: "custom" }]);
  });
});
