import type { HabitStats, Task } from "../database/types.js";

export type InterventionLevel = "none" | "l1" | "l2" | "l3" | "l4";
export type InterventionReason = "none" | "habit-recovery" | "habit-broken" | "idle";
export type InterventionAction = "none" | "hint" | "pet-approach" | "center-intervention" | "force-animation";
export type InterventionThresholdLevel = Exclude<InterventionLevel, "none">;

export interface InterventionThresholdMinutes {
  l1: number;
  l2: number;
  l3: number;
  l4: number;
}

export interface NightlySummarySettings {
  enabled: boolean;
  time: string;
}

export interface InterventionSettings {
  thresholdMinutes: InterventionThresholdMinutes;
  nightlySummary: NightlySummarySettings;
}

export interface NightlySummaryTask {
  id: number;
  content: string;
  urgency: Task["urgency"];
  category: Task["category"];
}

export interface NightlySummarySnapshot {
  shouldShow: boolean;
  planDate: string;
  summaryTime: string;
  total: number;
  doneCount: number;
  pendingCount: number;
  pendingTasks: NightlySummaryTask[];
  message: string;
}

export interface InterventionSnapshot {
  level: InterventionLevel;
  reason: InterventionReason;
  action: InterventionAction;
  idleMinutes: number;
  message: string;
  canSnooze: boolean;
}

export interface EvaluateInterventionInput {
  now: Date;
  pendingTasks: Task[];
  doneTasks: Task[];
  habitStats: HabitStats;
  isCompleted: boolean;
  thresholdMinutes?: Partial<InterventionThresholdMinutes>;
  snoozedUntil?: Date | null;
}

export interface EvaluateNightlySummaryInput {
  now: Date;
  planDate: string;
  pendingTasks: Task[];
  doneTasks: Task[];
  enabled?: boolean;
  summaryTime?: string;
  todayDate?: string;
}

export const DEFAULT_INTERVENTION_THRESHOLDS: InterventionThresholdMinutes = {
  l1: 10,
  l2: 20,
  l3: 30,
  l4: 40
};

export const DEFAULT_NIGHTLY_SUMMARY_TIME = "21:30";
export const DEFAULT_NIGHTLY_SUMMARY_ENABLED = true;

const LEVEL_ORDER: InterventionLevel[] = ["none", "l1", "l2", "l3", "l4"];
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function evaluateIntervention(input: EvaluateInterventionInput): InterventionSnapshot {
  const thresholds = normalizeInterventionThresholds(input.thresholdMinutes);
  const idleMinutes = getIdleMinutes(input.now, [...input.pendingTasks, ...input.doneTasks]);

  if (input.isCompleted || (input.pendingTasks.length === 0 && input.habitStats.recoverableCount === 0 && input.habitStats.brokenCount === 0)) {
    return buildSnapshot("none", "none", idleMinutes);
  }

  if (input.snoozedUntil && input.snoozedUntil.getTime() > input.now.getTime()) {
    return buildSnapshot("none", "none", idleMinutes);
  }

  const idleLevel = getIdleLevel(idleMinutes, thresholds);
  const habitLevel = input.habitStats.brokenCount > 0 ? "l2" : input.habitStats.recoverableCount > 0 ? "l1" : "none";
  const level = getHigherLevel(idleLevel, habitLevel);
  const reason = level === "none" ? "none" : getLevelRank(habitLevel) > getLevelRank(idleLevel) ? (habitLevel === "l2" ? "habit-broken" : "habit-recovery") : "idle";

  return buildSnapshot(level, reason, idleMinutes);
}

export function evaluateNightlySummary(input: EvaluateNightlySummaryInput): NightlySummarySnapshot {
  const summaryTime = normalizeSummaryTime(input.summaryTime);
  const pendingTasks = input.pendingTasks.map((task) => ({
    id: task.id,
    content: task.content,
    urgency: task.urgency,
    category: task.category
  }));
  const total = input.pendingTasks.length + input.doneTasks.length;
  const doneCount = input.doneTasks.length;
  const pendingCount = pendingTasks.length;
  const todayDate = input.todayDate ?? input.now.toISOString().slice(0, 10);
  const shouldShow = Boolean(input.enabled ?? DEFAULT_NIGHTLY_SUMMARY_ENABLED)
    && input.planDate === todayDate
    && hasReachedSummaryTime(input.now, summaryTime);

  return {
    shouldShow,
    planDate: input.planDate,
    summaryTime,
    total,
    doneCount,
    pendingCount,
    pendingTasks,
    message: pendingCount > 0 ? `今晚还有 ${pendingCount} 个任务没收尾` : "夜间总结今日任务已结束，辛苦啦"
  };
}

export function getInterventionPetMood(snapshot: InterventionSnapshot): "warning" | null {
  return snapshot.level === "none" ? null : "warning";
}

export function normalizeInterventionThresholds(value: unknown): InterventionThresholdMinutes {
  const record = value && typeof value === "object" ? value as Partial<Record<InterventionThresholdLevel, unknown>> : {};
  const l1 = clampInterventionMinute(record.l1, DEFAULT_INTERVENTION_THRESHOLDS.l1);
  const l2 = Math.max(l1 + 1, clampInterventionMinute(record.l2, DEFAULT_INTERVENTION_THRESHOLDS.l2));
  const l3 = Math.max(l2 + 1, clampInterventionMinute(record.l3, DEFAULT_INTERVENTION_THRESHOLDS.l3));
  const l4 = Math.max(l3 + 1, clampInterventionMinute(record.l4, DEFAULT_INTERVENTION_THRESHOLDS.l4));

  return { l1, l2, l3, l4 };
}

export function clampInterventionMinute(value: unknown, fallback = 10): number {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.max(1, Math.min(240, Math.trunc(numericValue)));
}

export function normalizeSummaryTime(value: unknown): string {
  return typeof value === "string" && TIME_PATTERN.test(value) ? value : DEFAULT_NIGHTLY_SUMMARY_TIME;
}

function getIdleLevel(idleMinutes: number, thresholds: InterventionThresholdMinutes): InterventionLevel {
  if (idleMinutes >= thresholds.l4) {
    return "l4";
  }
  if (idleMinutes >= thresholds.l3) {
    return "l3";
  }
  if (idleMinutes >= thresholds.l2) {
    return "l2";
  }
  if (idleMinutes >= thresholds.l1) {
    return "l1";
  }

  return "none";
}

function getIdleMinutes(now: Date, tasks: Task[]): number {
  const latestActivity = tasks
    .map((task) => task.completedAt ?? task.createdAt)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value.replace(" ", "T")).getTime())
    .filter((value) => Number.isFinite(value))
    .sort((first, second) => second - first)[0];

  if (!Number.isFinite(latestActivity)) {
    return 0;
  }

  return Math.max(0, Math.floor((now.getTime() - latestActivity) / 60_000));
}

function buildSnapshot(level: InterventionLevel, reason: InterventionReason, idleMinutes: number): InterventionSnapshot {
  return {
    level,
    reason,
    action: getInterventionAction(level),
    idleMinutes,
    message: getInterventionMessage(level, reason, idleMinutes),
    canSnooze: level === "l1" || level === "l2"
  };
}

function getHigherLevel(first: InterventionLevel, second: InterventionLevel): InterventionLevel {
  return getLevelRank(first) >= getLevelRank(second) ? first : second;
}

function getLevelRank(level: InterventionLevel): number {
  return LEVEL_ORDER.indexOf(level);
}

function getInterventionAction(level: InterventionLevel): InterventionAction {
  if (level === "l4") {
    return "force-animation";
  }
  if (level === "l3") {
    return "center-intervention";
  }
  if (level === "l2") {
    return "pet-approach";
  }
  if (level === "l1") {
    return "hint";
  }

  return "none";
}

function getInterventionMessage(level: InterventionLevel, reason: InterventionReason, idleMinutes: number): string {
  if (level === "none") {
    return "";
  }
  if (reason === "habit-broken") {
    return "习惯有断签风险，先补一个小动作";
  }
  if (reason === "habit-recovery") {
    return "今天打卡一下，连续感就接回来了";
  }
  if (level === "l4") {
    return `${idleMinutes} 分钟没推进，强制打断一下`;
  }
  if (level === "l3") {
    return `${idleMinutes} 分钟停滞，先处理一个最小任务`;
  }
  if (level === "l2") {
    return `${idleMinutes} 分钟没动，桌宠靠近提醒你`;
  }

  return `${idleMinutes} 分钟没推进，先动一下`;
}

function hasReachedSummaryTime(now: Date, summaryTime: string): boolean {
  const currentMinutes = getBeijingMinutes(now);
  const summaryMinutes = parseTimeToMinutes(summaryTime);

  return currentMinutes >= summaryMinutes;
}

function parseTimeToMinutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function getBeijingMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit"
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);

  return hour * 60 + minute;
}
