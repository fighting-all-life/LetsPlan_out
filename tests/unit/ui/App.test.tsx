import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_APP_SETTINGS } from "../../../src/main/appSettings.js";
import { App, PetShell, formatHistoryMonthLabel, isNumberDraftValid, isSummaryTimeDraftValid } from "../../../src/modules/ui/App.js";
import { mockDailyPlan } from "../../../src/modules/ui/mockPlan.js";

describe("ui App", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-26T16:30:00.000Z"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("renders the daily planner surface", () => {
    const html = renderToString(<App initialPlan={mockDailyPlan} />);

    expect(html).toContain("planner-surface");
    expect(html).toContain(mockDailyPlan.tasks[0].content);
    expect(html).toContain("completion-dial");
    expect(html).toContain("data-e2e=\"agent-insight\"");
  });

  it("renders Main Quest when a saved task id belongs to the active plan", () => {
    const html = renderToString(
      <App
        initialPlan={mockDailyPlan}
        initialAppSettings={{ ...DEFAULT_APP_SETTINGS, mainQuestByDate: { [mockDailyPlan.plan.planDate]: mockDailyPlan.tasks[0].id } }}
      />
    );

    expect(html).toContain('data-e2e="main-quest-panel"');
    expect(html).toContain('data-e2e="main-quest-badge"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("今日主线");
  });

  it("ignores stale Main Quest task ids", () => {
    const html = renderToString(
      <App initialPlan={mockDailyPlan} initialAppSettings={{ ...DEFAULT_APP_SETTINGS, mainQuestByDate: { [mockDailyPlan.plan.planDate]: 999 } }} />
    );

    expect(html).not.toContain('data-e2e="main-quest-panel"');
    expect(html).not.toContain('data-e2e="main-quest-badge"');
  });
  it("keeps history export actions available when Main Quest settings exist", () => {
    vi.stubGlobal("window", {
      location: { search: "?view=history" },
      localStorage: { getItem: vi.fn() }
    });
    const planClient = { exportPlanReport: vi.fn() } as unknown as Parameters<typeof App>[0]["planClient"];

    const html = renderToString(
      <App
        initialPlan={mockDailyPlan}
        planClient={planClient}
        initialAppSettings={{ ...DEFAULT_APP_SETTINGS, mainQuestByDate: { [mockDailyPlan.plan.planDate]: mockDailyPlan.tasks[0].id } }}
      />
    );

    expect(html).toContain('data-e2e="history-window-page"');
    expect(html).toContain('data-e2e="export-today-excel"');
    expect(html).toContain('data-e2e="export-week-excel"');
    expect(html).toContain('data-e2e="export-month-excel"');
    expect(html).toContain('data-e2e="export-all-excel"');
    expect(html).toContain('data-e2e="export-week-md"');
    expect(html).toContain('data-e2e="export-week-pdf"');
    expect(html).toContain('data-e2e="export-month-md"');
    expect(html).toContain('data-e2e="export-month-pdf"');
  });

  it("formats the history heatmap month label", () => {
    expect(formatHistoryMonthLabel("2026-07-14")).toBe("2026年07月");
    expect(formatHistoryMonthLabel("invalid")).toBe("invalid");
  });
  it("renders date navigation controls", () => {
    const html = renderToString(<App initialPlan={mockDailyPlan} />);

    expect(html).toContain("type=\"date\"");
    expect(html).toContain("data-e2e=\"previous-plan-date\"");
    expect(html).toContain("data-e2e=\"next-plan-date\"");
  });

  it("renders only history window and control center as primary navigation", () => {
    const html = renderToString(<App initialPlan={mockDailyPlan} />);

    expect(html).toContain("data-e2e=\"primary-navigation\"");
    expect(html).toContain("data-e2e=\"history-window\"");
    expect(html).toContain("data-e2e=\"settings-toggle\"");
    expect(html).not.toContain("data-e2e=\"history-toggle\"");
    expect(html).not.toContain("data-e2e=\"history-overview\"");
    expect(html).not.toContain("历史概览");
  });

  it("renders control center home with category entries and common settings", () => {
    const html = renderToString(<App initialPlan={mockDailyPlan} initialRoute="control-center" />);

    expect(html).toContain("data-control-route=\"home\"");
    expect(html).toContain("data-e2e=\"control-category-pet\"");
    expect(html).toContain("data-e2e=\"control-category-behavior\"");
    expect(html).toContain("data-e2e=\"control-category-intervention\"");
    expect(html).toContain("data-e2e=\"common-feature-settings\"");
    expect(html).toContain("\u5e38\u7528\u529f\u80fd");
    expect(html).toContain("\u5f00\u673a\u81ea\u542f");
    expect(html).toContain("\u5386\u53f2\u72ec\u7acb\u7a97\u53e3");
    expect(html).toContain("\u5b8c\u6210\u52a8\u753b");
    expect(html).not.toContain("data-e2e=\"pet-character-setting\"");
  });

  it("renders control center detail routes without flattening all settings", () => {
    const petHtml = renderToString(<App initialPlan={mockDailyPlan} initialRoute="control-center" initialControlRoute="pet" />);
    const behaviorHtml = renderToString(<App initialPlan={mockDailyPlan} initialRoute="control-center" initialControlRoute="behavior" />);
    const interventionHtml = renderToString(<App initialPlan={mockDailyPlan} initialRoute="control-center" initialControlRoute="intervention" />);

    expect(petHtml).toContain("data-e2e=\"control-page-pet\"");
    expect(petHtml).toContain("data-e2e=\"pet-character-setting\"");
    expect(petHtml).toContain("data-e2e=\"pet-character-cat\"");
    expect(petHtml).toContain("data-e2e=\"pet-character-dog\"");
    expect(petHtml).toContain("data-e2e=\"pet-character-robot\"");
    expect(petHtml).toContain("figures-action-motion-v1");
    expect(petHtml).not.toContain("data-e2e=\"primary-navigation\"");
    expect(petHtml).not.toContain("data-e2e=\"pet-behavior-setting\"");

    expect(behaviorHtml).toContain("data-e2e=\"control-page-behavior\"");
    expect(behaviorHtml).toContain("data-e2e=\"common-feature-settings\"");
    expect(behaviorHtml).toContain("\u5f00\u673a\u81ea\u542f");
    expect(behaviorHtml).toContain("\u5173\u95ed\u9690\u85cf\u5230\u6258\u76d8");
    expect(behaviorHtml).toContain("\u5386\u53f2\u72ec\u7acb\u7a97\u53e3");
    expect(behaviorHtml).toContain("\u5b8c\u6210\u52a8\u753b");
    expect(behaviorHtml).toContain("data-e2e=\"pet-behavior-setting\"");
    expect(behaviorHtml).toContain("点击阈值");
    expect(behaviorHtml).toContain("连续左键点击达到该次数");
    expect(behaviorHtml).toContain("躲避距离");
    expect(behaviorHtml).toContain("瞬闪阈值");
    expect(behaviorHtml).toContain("确认保存");
    expect(behaviorHtml).not.toContain("data-e2e=\"intervention-threshold-setting\"");

    expect(interventionHtml).toContain("data-e2e=\"control-page-intervention\"");
    expect(interventionHtml).toContain("data-e2e=\"intervention-threshold-setting\"");
    expect(interventionHtml).toContain("针对长时间没有完成任务的行为");
    expect(interventionHtml).toContain("L3 满屏跑动");
    expect(interventionHtml).toContain("L4 居中打滚");
    expect(interventionHtml).toContain("data-e2e=\"nightly-summary-time\"");
    expect(interventionHtml).toContain("data-e2e=\"threshold-l1\"");
    expect(interventionHtml).toContain("确认保存");
    expect(interventionHtml).not.toContain("data-e2e=\"pet-character-setting\"");
  });

  it("keeps the background palette closed by default", () => {
    const html = renderToString(<App initialPlan={mockDailyPlan} />);

    expect(html).not.toContain("data-e2e=\"background-palette\"");
  });

  it("renders task edit controls", () => {
    const html = renderToString(<App initialPlan={mockDailyPlan} />);

    expect(html).toContain("data-e2e=\"edit-task\"");
    expect(html).toContain("data-e2e=\"delete-task\"");
  });

  it("renders readable Chinese copy", () => {
    const html = renderToString(<App initialPlan={mockDailyPlan} />);

    expect(html).toContain("输入新任务");
    expect(html).toContain("工作");
    expect(html).toContain("学习");
    expect(html).toContain("待完成");
    expect(html).not.toMatch(/\\u[0-9a-fA-F]{4}/);
  });

  it("renders the habit tracker and intervention status", () => {
    const html = renderToString(<App initialPlan={mockDailyPlan} />);

    expect(html).toContain("data-e2e=\"habit-section\"");
    expect(html).toContain("习惯追踪");
    expect(html).toContain("自定义");
    expect(html).toContain("data-e2e=\"intervention-banner\"");
  });

  it("renders center intervention overlay for L3/L4 states", () => {
    vi.setSystemTime(new Date("2026-06-27T13:31:00.000Z"));

    const html = renderToString(<App initialPlan={mockDailyPlan} />);

    expect(html).toContain('data-e2e="intervention-overlay"');
    expect(html).toContain("强制打断");
  });
  it("renders staged desktop pet no-progress reminders", () => {
    const stage1Html = renderToString(<PetShell initialPlan={withIntervention("l1", "hint", "10 分钟没推进，先动一下")} planClient={null} />);
    const stage2Html = renderToString(<PetShell initialPlan={withIntervention("l2", "pet-approach", "20 分钟没动，桌宠在底部跑动提醒你")} planClient={null} />);
    const stage3Html = renderToString(<PetShell initialPlan={withIntervention("l3", "center-intervention", "30 分钟停滞，桌宠满屏跑动提醒你")} planClient={null} />);
    const stage4Html = renderToString(<PetShell initialPlan={withIntervention("l4", "force-animation", "40 分钟没推进，快去学习！")} planClient={null} />);

    expect(stage1Html).toContain('data-intervention-stage="stage1"');
    expect(stage1Html).toContain("10 分钟没推进，先动一下");
    expect(stage1Html).not.toContain('data-e2e="pet-force-text-field"');

    expect(stage2Html).toContain('data-intervention-stage="stage2"');
    expect(stage2Html).toContain("pet-action-pet-approach");
    expect(stage2Html).toContain('data-pet-mood="escape"');

    expect(stage3Html).toContain('data-intervention-stage="stage3"');
    expect(stage3Html).toContain("pet-action-center-intervention");
    expect(stage3Html).toContain('data-pet-mood="escape"');

    expect(stage4Html).toContain('data-intervention-stage="stage4"');
    expect(stage4Html).toContain("is-force-intervention-active");
    expect(stage4Html).toContain('data-e2e="pet-force-text-field"');
    expect(stage4Html).toContain("快去学习！");
  });

  it("validates nightly summary time drafts without falling back to the default time", () => {
    expect(isSummaryTimeDraftValid("22:45")).toBe(true);
    expect(isSummaryTimeDraftValid("00:00")).toBe(true);
    expect(isSummaryTimeDraftValid("21:3")).toBe(false);
    expect(isSummaryTimeDraftValid("")).toBe(false);
    expect(isSummaryTimeDraftValid("24:00")).toBe(false);    expect(isNumberDraftValid("30", 3, 30)).toBe(true);
    expect(isNumberDraftValid("31", 3, 30)).toBe(false);
    expect(isNumberDraftValid("3.5", 3, 30)).toBe(false);
  });
  it("renders nightly summary overlay after the configured time", () => {
    vi.setSystemTime(new Date("2026-06-27T13:31:00.000Z"));

    const html = renderToString(<App initialPlan={mockDailyPlan} />);

    expect(html).toContain('data-e2e="nightly-summary-overlay"');
    expect(html).toContain("今晚还有");
    expect(html).toContain(mockDailyPlan.tasks[0].content);
  });
});

function withIntervention(
  level: "l1" | "l2" | "l3" | "l4",
  action: "hint" | "pet-approach" | "center-intervention" | "force-animation",
  message: string
): typeof mockDailyPlan {
  return {
    ...mockDailyPlan,
    intervention: {
      ...mockDailyPlan.intervention,
      level,
      action,
      message,
      idleMinutes: level === "l1" ? 10 : level === "l2" ? 20 : level === "l3" ? 30 : 40
    }
  };
}
