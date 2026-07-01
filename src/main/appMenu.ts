import type { MenuItemConstructorOptions } from "electron";
import type { InterventionThresholdLevel } from "../modules/api/intervention.js";
import type { AppPetCharacter, AppSettings } from "./appSettings.js";

export type BackgroundColorCommand =
  | { mode: "preset"; color: string }
  | { mode: "custom" };

const backgroundColorPresets: Array<{ label: string; color: string }> = [
  { label: "赛博黑", color: "#05060a" },
  { label: "青色网格", color: "#07131a" },
  { label: "品红面板", color: "#130816" },
  { label: "信号绿", color: "#06120f" },
  { label: "琥珀夜色", color: "#150f05" },
  { label: "钢蓝", color: "#07111f" }
];

const petCharacterMenuItems: Array<{ label: string; value: AppPetCharacter }> = [
  { label: "猫", value: "cat" },
  { label: "狗", value: "dog" },
  { label: "机器人", value: "robot" }
];

const thresholdMenuItems: Array<{ label: string; level: InterventionThresholdLevel }> = [
  { label: "L1 提示", level: "l1" },
  { label: "L2 桌宠靠近", level: "l2" },
  { label: "L3 中心干预", level: "l3" },
  { label: "L4 强制打断", level: "l4" }
];

const thresholdMinutePresets = [5, 10, 15, 20, 30, 40, 60, 90, 120];
const nightlySummaryTimePresets = ["20:00", "21:00", "21:30", "22:00", "22:30", "23:00"];

export interface ApplicationMenuActions {
  currentSettings: AppSettings;
  showMainWindow(): void;
  openHistoryWindow(): void | Promise<void>;
  openSettings(): void;
  setBackgroundColor(command: BackgroundColorCommand): void;
  setPetCharacter(petCharacter: AppPetCharacter): void;
  setInterventionThreshold(level: InterventionThresholdLevel, minutes: number): void;
  setNightlySummaryEnabled(enabled: boolean): void;
  setNightlySummaryTime(time: string): void;
  quit(): void;
}

export function buildApplicationMenuTemplate(actions: ApplicationMenuActions): MenuItemConstructorOptions[] {
  return [
    {
      label: "文件",
      submenu: [
        { label: "打开主窗口", accelerator: "CommandOrControl+Shift+O", click: actions.showMainWindow },
        {
          label: "打开历史窗口",
          accelerator: "CommandOrControl+Shift+H",
          click: () => { void actions.openHistoryWindow(); }
        },
        { type: "separator" },
        { label: "退出", accelerator: "CommandOrControl+Q", click: actions.quit }
      ]
    },
    {
      label: "编辑",
      submenu: [
        {
          label: "背景颜色",
          submenu: [
            {
              label: "常规色",
              submenu: backgroundColorPresets.map((preset) => ({
                label: preset.label,
                click: () => actions.setBackgroundColor({ mode: "preset", color: preset.color })
              }))
            },
            { type: "separator" },
            { label: "自定义...", click: () => actions.setBackgroundColor({ mode: "custom" }) }
          ]
        }
      ]
    },
    buildPetMenu(actions),
    {
      label: "视图",
      submenu: [
        { label: "重新加载", accelerator: "CommandOrControl+R", role: "reload" },
        { label: "强制重新加载", accelerator: "CommandOrControl+Shift+R", role: "forceReload" },
        { label: "开发者工具", accelerator: "F12", role: "toggleDevTools" },
        { type: "separator" },
        { label: "放大", accelerator: "CommandOrControl+Plus", role: "zoomIn" },
        { label: "缩小", accelerator: "CommandOrControl+-", role: "zoomOut" },
        { label: "重置缩放", accelerator: "CommandOrControl+0", role: "resetZoom" },
        { type: "separator" },
        { label: "切换全屏", role: "togglefullscreen" }
      ]
    },
    {
      label: "窗口",
      submenu: [
        { label: "最小化", accelerator: "CommandOrControl+M", role: "minimize" },
        { label: "关闭窗口", accelerator: "CommandOrControl+W", role: "close" },
        { type: "separator" },
        { label: "前置主窗口", click: actions.showMainWindow }
      ]
    }
  ];
}

function buildPetMenu(actions: ApplicationMenuActions): MenuItemConstructorOptions {
  const settings = actions.currentSettings;
  return {
    label: "桌宠",
    submenu: [
      {
        label: "桌宠选择",
        submenu: petCharacterMenuItems.map((item) => ({
          label: item.label,
          type: "radio",
          checked: settings.petCharacter === item.value,
          click: () => actions.setPetCharacter(item.value)
        }))
      },
      { type: "separator" },
      {
        label: "干预定时",
        submenu: thresholdMenuItems.map((item) => ({
          label: item.label,
          submenu: [
            ...thresholdMinutePresets.map((minutes) => ({
              label: `${minutes} 分钟`,
              type: "radio" as const,
              checked: settings.interventionThresholdMinutes[item.level] === minutes,
              click: () => actions.setInterventionThreshold(item.level, minutes)
            })),
            { type: "separator" as const },
            { label: "自定义...", click: actions.openSettings }
          ]
        }))
      },
      {
        label: "夜间总结",
        submenu: [
          {
            label: "启用夜间总结",
            type: "checkbox",
            checked: settings.nightlySummaryEnabled,
            click: () => actions.setNightlySummaryEnabled(!settings.nightlySummaryEnabled)
          },
          { type: "separator" },
          ...nightlySummaryTimePresets.map((time) => ({
            label: time,
            type: "radio" as const,
            checked: settings.nightlySummaryTime === time,
            click: () => actions.setNightlySummaryTime(time)
          })),
          { type: "separator" },
          { label: "自定义...", click: actions.openSettings }
        ]
      },
      { type: "separator" },
      { label: "打开桌宠设置", accelerator: "CommandOrControl+Shift+P", click: actions.openSettings }
    ]
  };
}
