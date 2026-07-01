import type { MenuItemConstructorOptions } from "electron";
import { describe, expect, it } from "vitest";
import { DEFAULT_APP_SETTINGS } from "../../../src/main/appSettings.js";
import { buildPetContextMenuTemplate } from "../../../src/main/petContextMenu.js";

function submenu(item: MenuItemConstructorOptions | undefined): MenuItemConstructorOptions[] {
  return Array.isArray(item?.submenu) ? item.submenu : [];
}

describe("buildPetContextMenuTemplate", () => {
  it("exposes open, control center and pet switching actions", () => {
    const calls: string[] = [];
    const template = buildPetContextMenuTemplate({
      currentSettings: { ...DEFAULT_APP_SETTINGS, petCharacter: "dog" },
      showMainWindow: () => calls.push("open"),
      openControlCenter: () => calls.push("control"),
      setPetCharacter: (petCharacter) => calls.push("pet:" + petCharacter)
    });

    expect(template.map((item) => item.label ?? item.type)).toEqual(["\u6253\u5f00 LetsPlan", "\u63a7\u5236\u4e2d\u5fc3", "separator", "\u5207\u6362\u684c\u5ba0"]);
    (template[0].click as (() => void) | undefined)?.();
    (template[1].click as (() => void) | undefined)?.();

    const petItems = submenu(template[3]);
    expect(petItems.map((item) => [item.label, item.type, item.checked])).toEqual([
      ["\u732b", "radio", false],
      ["\u72d7", "radio", true],
      ["\u673a\u5668\u4eba", "radio", false]
    ]);
    (petItems[2].click as (() => void) | undefined)?.();

    expect(calls).toEqual(["open", "control", "pet:robot"]);
  });
});
