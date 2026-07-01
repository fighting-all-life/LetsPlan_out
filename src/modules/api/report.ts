import type { DailyPlanView } from "./types.js";

export type PlanReportPeriod = "today" | "week" | "month" | "all";

export interface PlanReportRequest {
  period: PlanReportPeriod;
  anchorDate?: string;
}

export interface PlanReportDay extends DailyPlanView {}

export interface PlanReportTotals {
  planDays: number;
  totalTasks: number;
  doneTasks: number;
  completionRate: number;
  completedPlanDays: number;
}

export interface PlanReport {
  period: PlanReportPeriod;
  title: string;
  startDate: string;
  endDate: string;
  generatedAt: string;
  totals: PlanReportTotals;
  days: PlanReportDay[];
  markdown: string;
  html: string;
  excelHtml: string;
}

export type PlanLookup = (planDate: string) => DailyPlanView | null;
export type PlanDateList = () => string[];

const PLAN_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export function createPlanReport(request: PlanReportRequest, lookupPlan: PlanLookup, now = new Date(), listAllPlanDates: PlanDateList = () => []): PlanReport {
  const anchorDate = request.anchorDate ?? formatPlanDateUtc(now);
  assertPlanDate(anchorDate);
  const { startDate, endDate, planDates } = getReportDateSelection(request.period, anchorDate, listAllPlanDates);
  const days = planDates
    .map((planDate) => lookupPlan(planDate))
    .filter((view): view is PlanReportDay => view !== null);
  const totals = getReportTotals(days);
  const title = getReportTitle(request.period, startDate, endDate);
  const baseReport = {
    period: request.period,
    title,
    startDate,
    endDate,
    generatedAt: now.toISOString(),
    totals,
    days
  };
  const markdown = buildPlanReportMarkdown(baseReport);
  const html = buildPlanReportHtml(baseReport);
  const excelHtml = buildPlanReportExcelHtml(baseReport);

  return { ...baseReport, markdown, html, excelHtml };
}

function getReportTotals(days: PlanReportDay[]): PlanReportTotals {
  const totalTasks = days.reduce((sum, day) => sum + day.stats.total, 0);
  const doneTasks = days.reduce((sum, day) => sum + day.stats.doneCount, 0);

  return {
    planDays: days.length,
    totalTasks,
    doneTasks,
    completionRate: totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100),
    completedPlanDays: days.filter((day) => day.isCompleted).length
  };
}

function buildPlanReportMarkdown(report: Omit<PlanReport, "markdown" | "html" | "excelHtml">): string {
  const lines = [
    `# ${report.title}`,
    "",
    `- 范围: ${report.startDate} ~ ${report.endDate}`,
    `- 计划天数: ${report.totals.planDays}`,
    `- 任务完成: ${report.totals.doneTasks}/${report.totals.totalTasks} (${report.totals.completionRate}%)`,
    `- 全部完成的日计划: ${report.totals.completedPlanDays}`,
    ""
  ];

  if (report.days.length === 0) {
    lines.push("暂无记录", "");
    return `${lines.join("\n")}\n`;
  }

  for (const day of report.days) {
    lines.push(`## ${day.plan.planDate} ${day.stats.doneCount}/${day.stats.total} (${day.stats.percentage}%)`, "");
    for (const task of day.tasks) {
      const checkbox = task.status === "done" ? "x" : " ";
      const urgency = task.urgency === "urgent" ? "紧急" : "常规";
      const category = task.category === "work" ? "工作" : "学习";
      lines.push(`- [${checkbox}] [${category}/${urgency}] ${task.content}`);
    }
    if (day.tasks.length === 0) {
      lines.push("- 暂无任务");
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function buildPlanReportHtml(report: Omit<PlanReport, "markdown" | "html" | "excelHtml">): string {
  const daySections = report.days.length === 0
    ? `<p class="empty">暂无记录</p>`
    : report.days.map((day) => `
      <section>
        <h2>${escapeHtml(day.plan.planDate)} <span>${day.stats.doneCount}/${day.stats.total} (${day.stats.percentage}%)</span></h2>
        <ul>
          ${day.tasks.length === 0 ? `<li>暂无任务</li>` : day.tasks.map((task) => `
            <li class="${task.status === "done" ? "done" : "pending"}">
              <strong>${task.status === "done" ? "已完成" : "未完成"}</strong>
              <span>${task.category === "work" ? "工作" : "学习"}/${task.urgency === "urgent" ? "紧急" : "常规"}</span>
              ${escapeHtml(task.content)}
            </li>
          `).join("")}
        </ul>
      </section>
    `).join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(report.title)}</title>
  <style>
    body { margin: 40px; color: #18202f; font-family: "Microsoft YaHei", "Segoe UI", sans-serif; }
    h1 { margin: 0 0 12px; font-size: 26px; }
    .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 18px 0 24px; }
    .meta div { padding: 12px; border: 1px solid #dde4ef; border-radius: 8px; background: #f8fafc; }
    .meta span { display: block; color: #657084; font-size: 12px; }
    .meta strong { display: block; margin-top: 6px; font-size: 18px; }
    section { break-inside: avoid; margin: 14px 0; padding-top: 8px; border-top: 1px solid #e5e9f0; }
    h2 { font-size: 16px; }
    h2 span { color: #657084; font-size: 13px; }
    li { margin: 7px 0; line-height: 1.5; }
    li strong, li span { margin-right: 8px; color: #526076; font-size: 12px; }
    li.done { color: #0f766e; }
    li.pending { color: #b45309; }
    .empty { color: #657084; }
  </style>
</head>
<body>
  <h1>${escapeHtml(report.title)}</h1>
  <p>${escapeHtml(report.startDate)} ~ ${escapeHtml(report.endDate)}</p>
  <div class="meta">
    <div><span>计划天数</span><strong>${report.totals.planDays}</strong></div>
    <div><span>任务完成</span><strong>${report.totals.doneTasks}/${report.totals.totalTasks}</strong></div>
    <div><span>完成率</span><strong>${report.totals.completionRate}%</strong></div>
    <div><span>全部完成日</span><strong>${report.totals.completedPlanDays}</strong></div>
  </div>
  ${daySections}
</body>
</html>`;
}

function buildPlanReportExcelHtml(report: Omit<PlanReport, "markdown" | "html" | "excelHtml">): string {
  const rows: string[][] = [["日期", "任务", "状态", "分类", "紧急度", "习惯影响"]];
  for (const day of report.days) {
    const habitImpact = getHabitImpactLabel(day);
    if (day.tasks.length === 0) {
      rows.push([day.plan.planDate, "暂无任务", "", "", "", habitImpact]);
      continue;
    }

    for (const task of day.tasks) {
      rows.push([
        day.plan.planDate,
        task.content,
        task.status === "done" ? "已完成" : "未完成",
        task.category === "work" ? "工作" : "学习",
        task.urgency === "urgent" ? "紧急" : "常规",
        habitImpact
      ]);
    }
  }

  const tableRows = rows.map((row, rowIndex) => `
      <tr>${row.map((cell) => rowIndex === 0 ? `<th>${escapeHtml(cell)}</th>` : `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");

  return `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="ProgId" content="Excel.Sheet" />
  <meta name="Generator" content="LetsPlan" />
  <style>
    body { font-family: "Microsoft YaHei", Arial, sans-serif; }
    table { border-collapse: collapse; }
    th { background: #dbeafe; font-weight: 700; }
    th, td { border: 1px solid #94a3b8; padding: 6px 8px; mso-number-format:"\@"; }
    .meta td { border: none; padding: 4px 10px 8px 0; }
  </style>
</head>
<body>
  <table class="meta">
    <tr><td>标题</td><td>${escapeHtml(report.title)}</td></tr>
    <tr><td>范围</td><td>${escapeHtml(report.startDate)} ~ ${escapeHtml(report.endDate)}</td></tr>
    <tr><td>任务完成</td><td>${report.totals.doneTasks}/${report.totals.totalTasks} (${report.totals.completionRate}%)</td></tr>
  </table>
  <table>${tableRows}</table>
</body>
</html>`;
}

function getHabitImpactLabel(day: PlanReportDay): string {
  if (day.habitStats.total === 0) {
    return "无习惯";
  }

  return `${day.habitStats.checkedCount}/${day.habitStats.total} (${day.habitStats.percentage}%)`;
}

function getReportDateSelection(period: PlanReportPeriod, anchorDate: string, listAllPlanDates: PlanDateList): { startDate: string; endDate: string; planDates: string[] } {
  if (period === "all") {
    const planDates = [...new Set(listAllPlanDates().filter((planDate) => PLAN_DATE_PATTERN.test(planDate)))].sort();
    return {
      startDate: planDates[0] ?? anchorDate,
      endDate: planDates[planDates.length - 1] ?? anchorDate,
      planDates
    };
  }

  const range = getReportDateRange(period, anchorDate);
  return { ...range, planDates: listPlanDates(range.startDate, range.endDate) };
}

function getReportTitle(period: PlanReportPeriod, startDate: string, endDate: string): string {
  if (period === "today") {
    return `日报 ${startDate}`;
  }
  if (period === "week") {
    return `周报 ${startDate} ~ ${endDate}`;
  }
  if (period === "month") {
    return `月报 ${startDate} ~ ${endDate}`;
  }

  return startDate === endDate ? `全部计划 ${startDate}` : `全部计划 ${startDate} ~ ${endDate}`;
}

function getReportDateRange(period: Exclude<PlanReportPeriod, "all">, anchorDate: string): { startDate: string; endDate: string } {
  const anchor = parsePlanDate(anchorDate);
  if (period === "today") {
    return { startDate: anchorDate, endDate: anchorDate };
  }
  if (period === "month") {
    const start = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
    const end = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0));
    return { startDate: formatPlanDateUtc(start), endDate: formatPlanDateUtc(end) };
  }

  if (period !== "week") {
    throw new Error("Report period must be today, week, month or all.");
  }

  const day = anchor.getUTCDay();
  const offsetToMonday = day === 0 ? -6 : 1 - day;
  const start = new Date(anchor.getTime() + offsetToMonday * DAY_MS);
  const end = new Date(start.getTime() + 6 * DAY_MS);
  return { startDate: formatPlanDateUtc(start), endDate: formatPlanDateUtc(end) };
}

function listPlanDates(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  let current = parsePlanDate(startDate);
  const end = parsePlanDate(endDate);

  while (current.getTime() <= end.getTime()) {
    dates.push(formatPlanDateUtc(current));
    current = new Date(current.getTime() + DAY_MS);
  }

  return dates;
}

function parsePlanDate(planDate: string): Date {
  assertPlanDate(planDate);
  const [year, month, day] = planDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function assertPlanDate(planDate: string): void {
  if (!PLAN_DATE_PATTERN.test(planDate)) {
    throw new Error("Plan date must use YYYY-MM-DD format.");
  }
}

function formatPlanDateUtc(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
