import type { MenuItemConstructorOptions } from "electron";
import type { AppPetCharacter, AppSettings } from "./appSettings.js";

export interface PetContextMenuActions {
  currentSettings: AppSettings;
  showMainWindow(): void;
  openControlCenter(): void;
  setPetCharacter(petCharacter: AppPetCharacter): void;
}

const petCharacterMenuItems: Array<{ label: string; value: AppPetCharacter }> = [
  { label: "\u732b", value: "cat" },
  { label: "\u72d7", value: "dog" },
  { label: "\u673a\u5668\u4eba", value: "robot" }
];

export function buildPetContextMenuTemplate(actions: PetContextMenuActions): MenuItemConstructorOptions[] {
  return [
    {
      label: "\u6253\u5f00 LetsPlan",
      click: actions.showMainWindow
    },
    {
      label: "\u63a7\u5236\u4e2d\u5fc3",
      click: actions.openControlCenter
    },
    { type: "separator" },
    {
      label: "\u5207\u6362\u684c\u5ba0",
      submenu: petCharacterMenuItems.map((item) => ({
        label: item.label,
        type: "radio" as const,
        checked: actions.currentSettings.petCharacter === item.value,
        click: () => actions.setPetCharacter(item.value)
      }))
    }
  ];
}
