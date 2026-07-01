import type { DailyPlanView } from "../modules/api/index.js";
import type { AppSettings } from "./appSettings.js";

export type RendererStateEventKind =
  | "task-update"
  | "progress-update"
  | "habit-update"
  | "pet-action"
  | "settings-update"
  | "sync";

type TimerHandle = ReturnType<typeof setTimeout>;

export interface RendererStateSnapshot {
  planView: DailyPlanView | null;
  appSettings: AppSettings | null;
  lastPlanEventKind: RendererStateEventKind | null;
  lastSettingsEventKind: RendererStateEventKind | null;
}

export interface RendererStateBroadcasterOptions {
  debounceMs?: number;
  setTimer?: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
  onPlanView(view: DailyPlanView, kind: RendererStateEventKind): void;
  onAppSettings(settings: AppSettings, kind: RendererStateEventKind): void;
}

export interface RendererStateBroadcaster {
  enqueuePlanView(view: DailyPlanView, kind?: RendererStateEventKind): void;
  publishPlanView(view: DailyPlanView, kind?: RendererStateEventKind): void;
  flushPlanView(): void;
  publishAppSettings(settings: AppSettings): void;
  getSnapshot(): RendererStateSnapshot;
  dispose(): void;
}

export function createRendererStateBroadcaster(options: RendererStateBroadcasterOptions): RendererStateBroadcaster {
  const debounceMs = options.debounceMs ?? 80;
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;

  let timer: TimerHandle | null = null;
  let cachedPlanView: DailyPlanView | null = null;
  let cachedAppSettings: AppSettings | null = null;
  let pendingPlanView: DailyPlanView | null = null;
  let pendingPlanEventKind: RendererStateEventKind = "progress-update";
  let lastPlanEventKind: RendererStateEventKind | null = null;
  let lastSettingsEventKind: RendererStateEventKind | null = null;

  function clearPendingTimer(): void {
    if (!timer) {
      return;
    }

    clearTimer(timer);
    timer = null;
  }

  function flushPlanView(): void {
    if (!pendingPlanView) {
      return;
    }

    const nextView = pendingPlanView;
    const nextKind = pendingPlanEventKind;
    pendingPlanView = null;
    lastPlanEventKind = nextKind;
    cachedPlanView = nextView;
    options.onPlanView(nextView, nextKind);
  }

  return {
    enqueuePlanView(view, kind = "progress-update") {
      cachedPlanView = view;
      pendingPlanView = view;
      pendingPlanEventKind = kind;

      if (debounceMs <= 0) {
        clearPendingTimer();
        flushPlanView();
        return;
      }

      if (!timer) {
        timer = setTimer(() => {
          timer = null;
          flushPlanView();
        }, debounceMs);
      }
    },
    publishPlanView(view, kind = "sync") {
      clearPendingTimer();
      pendingPlanView = view;
      pendingPlanEventKind = kind;
      flushPlanView();
    },
    flushPlanView() {
      clearPendingTimer();
      flushPlanView();
    },
    publishAppSettings(settings) {
      cachedAppSettings = settings;
      lastSettingsEventKind = "settings-update";
      options.onAppSettings(settings, "settings-update");
    },
    getSnapshot() {
      return {
        planView: cachedPlanView,
        appSettings: cachedAppSettings,
        lastPlanEventKind,
        lastSettingsEventKind
      };
    },
    dispose() {
      clearPendingTimer();
      pendingPlanView = null;
    }
  };
}
