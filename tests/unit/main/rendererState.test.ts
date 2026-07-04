import { afterEach, describe, expect, it, vi } from "vitest";
import type { DailyPlanView } from "../../../src/modules/api/index.js";
import type { AppSettings } from "../../../src/main/appSettings.js";
import { createRendererStateBroadcaster } from "../../../src/main/rendererState.js";

function createPlanView(doneCount = 0): DailyPlanView {
  return {
    plan: {
      id: 1,
      planDate: "2026-06-28",
      createdAt: "2026-06-28 08:00:00",
      completedAt: null
    },
    tasks: [],
    pendingTasks: [],
    doneTasks: [],
    stats: {
      total: 2,
      doneCount,
      percentage: doneCount * 50
    },
    isCompleted: doneCount === 2,
    habits: [],
    habitStats: {
      total: 0,
      checkedCount: 0,
      percentage: 0,
      brokenCount: 0,
      recoverableCount: 0
    },
    intervention: {
      level: "none",
      reason: "none",
      idleMinutes: 0,
      message: "",
      canSnooze: false,
      action: "none"
    },
    nightlySummary: {
      shouldShow: false,
      planDate: "2026-06-28",
      summaryTime: "21:30",
      total: 0,
      doneCount: 0,
      pendingCount: 0,
      pendingTasks: [],
      message: ""
    },
    agentInsight: {
      risk: "watch",
      focus: "plan",
      score: 0,
      headline: "Fixture insight",
      nextAction: "Fixture next action",
      reason: "Fixture reason",
      signals: []
    }  };
}

function createSettings(petCharacter: AppSettings["petCharacter"] = "cat"): AppSettings {
  return {
    hideToTrayOnClose: true,
    showCompletionAnimation: true,
    openHistoryInNewWindow: true,
    petCharacter,
    interventionThresholdMinutes: { l1: 10, l2: 20, l3: 30, l4: 40 },
    nightlySummaryEnabled: true,
    nightlySummaryTime: "21:30",
    petClickDodgeThreshold: 10,
    petDodgeDistance: 130,
    petBurstDodgeThreshold: 16,
    mainQuestByDate: {}
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createRendererStateBroadcaster", () => {
  it("debounces plan view events and publishes the latest snapshot", () => {
    vi.useFakeTimers();
    const published: Array<{ view: DailyPlanView; kind: string }> = [];
    const broadcaster = createRendererStateBroadcaster({
      debounceMs: 50,
      onPlanView: (view, kind) => published.push({ view, kind }),
      onAppSettings: vi.fn()
    });

    const firstView = createPlanView(0);
    const latestView = createPlanView(1);
    broadcaster.enqueuePlanView(firstView, "task-update");
    broadcaster.enqueuePlanView(latestView, "habit-update");

    expect(broadcaster.getSnapshot().planView).toBe(latestView);
    expect(published).toHaveLength(0);

    vi.advanceTimersByTime(50);

    expect(published).toEqual([{ view: latestView, kind: "habit-update" }]);
    expect(broadcaster.getSnapshot().lastPlanEventKind).toBe("habit-update");
  });

  it("publishes sync snapshots immediately and clears pending debounce", () => {
    vi.useFakeTimers();
    const published: Array<{ view: DailyPlanView; kind: string }> = [];
    const broadcaster = createRendererStateBroadcaster({
      debounceMs: 100,
      onPlanView: (view, kind) => published.push({ view, kind }),
      onAppSettings: vi.fn()
    });

    broadcaster.enqueuePlanView(createPlanView(0), "task-update");
    const syncView = createPlanView(2);
    broadcaster.publishPlanView(syncView, "sync");
    vi.advanceTimersByTime(100);

    expect(published).toEqual([{ view: syncView, kind: "sync" }]);
    expect(broadcaster.getSnapshot().planView).toBe(syncView);
  });

  it("publishes settings immediately and caches them", () => {
    const published: AppSettings[] = [];
    const broadcaster = createRendererStateBroadcaster({
      onPlanView: vi.fn(),
      onAppSettings: (settings) => published.push(settings)
    });

    const settings = createSettings("robot");
    broadcaster.publishAppSettings(settings);

    expect(published).toEqual([settings]);
    expect(broadcaster.getSnapshot().appSettings).toBe(settings);
    expect(broadcaster.getSnapshot().lastSettingsEventKind).toBe("settings-update");
  });

  it("drops pending debounce work on dispose", () => {
    vi.useFakeTimers();
    const onPlanView = vi.fn();
    const broadcaster = createRendererStateBroadcaster({
      debounceMs: 50,
      onPlanView,
      onAppSettings: vi.fn()
    });

    broadcaster.enqueuePlanView(createPlanView(1), "progress-update");
    broadcaster.dispose();
    vi.advanceTimersByTime(50);

    expect(onPlanView).not.toHaveBeenCalled();
  });
});
