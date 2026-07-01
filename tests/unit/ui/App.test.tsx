import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, isNumberDraftValid, isSummaryTimeDraftValid } from "../../../src/modules/ui/App.js";
import { mockDailyPlan } from "../../../src/modules/ui/mockPlan.js";

describe("ui App", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-26T16:30:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the daily planner surface", () => {
    const html = renderToString(<App initialPlan={mockDailyPlan} />);

    expect(html).toContain("planner-surface");
    expect(html).toContain(mockDailyPlan.tasks[0].content);
    expect(html).toContain("completion-dial");
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

  it("renders control center home with only three category entries", () => {
    const html = renderToString(<App initialPlan={mockDailyPlan} initialRoute="control-center" />);

    expect(html).toContain("data-control-route=\"home\"");
    expect(html).toContain("data-e2e=\"control-category-pet\"");
    expect(html).toContain("data-e2e=\"control-category-behavior\"");
    expect(html).toContain("data-e2e=\"control-category-intervention\"");
    expect(html).not.toContain("data-e2e=\"pet-character-setting\"");
    expect(html).not.toContain("开机自启");
  });

  it("renders control center detail routes without flattening all settings", () => {
    const petHtml = renderToString(<App initialPlan={mockDailyPlan} initialRoute="control-center" initialControlRoute="pet" />);
    const behaviorHtml = renderToString(<App initialPlan={mockDailyPlan} initialRoute="control-center" initialControlRoute="behavior" />);
    const interventionHtml = renderToString(<App initialPlan={mockDailyPlan} initialRoute="control-center" initialControlRoute="intervention" />);

    expect(petHtml).toContain("data-e2e=\"control-page-pet\"");
    expect(petHtml).toContain("data-e2e=\"pet-character-setting\"");
    expect(petHtml).not.toContain("data-e2e=\"pet-behavior-setting\"");

    expect(behaviorHtml).toContain("data-e2e=\"control-page-behavior\"");
    expect(behaviorHtml).toContain("开机自启");
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
    expect(interventionHtml).toContain("L3 中心干预");
    expect(interventionHtml).toContain("L4 强制打断");
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
