import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type {
  CreateHabitInput,
  CreateTaskInput,
  DailyPlan,
  Habit,
  HabitFrequency,
  HabitLog,
  HabitStats,
  HabitStatus,
  HabitView,
  PlanStats,
  PlanSummary,
  PlanWithTasks,
  Task,
  TaskCategory,
  TaskStatus,
  TaskUrgency,
  UpdateHabitInput,
  UpdateTaskInput
} from "./types.js";

type SqliteDatabase = DatabaseSync;

interface DailyPlanRow {
  id: number;
  plan_date: string;
  created_at: string;
  completed_at: string | null;
}

interface TaskRow {
  id: number;
  plan_id: number;
  content: string;
  urgency: TaskUrgency;
  category: TaskCategory;
  status: TaskStatus;
  sort_order: number;
  created_at: string;
  completed_at: string | null;
}

interface HabitRow {
  id: number;
  name: string;
  frequency: HabitFrequency;
  custom_interval_days: number | null;
  status: HabitStatus;
  created_at: string;
  archived_at: string | null;
}

interface HabitLogRow {
  id: number;
  habit_id: number;
  log_date: string;
  created_at: string;
}

interface TaskCountRow {
  total: number;
  done_count: number;
}

interface PlanSummaryRow {
  plan_date: string;
  completed_at: string | null;
  total: number;
  done_count: number;
}

const PLAN_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const VALID_URGENCIES = new Set<TaskUrgency>(["urgent", "regular"]);
const VALID_CATEGORIES = new Set<TaskCategory>(["work", "study"]);
const VALID_STATUSES = new Set<TaskStatus>(["pending", "done"]);
const VALID_HABIT_FREQUENCIES = new Set<HabitFrequency>(["daily", "weekly", "custom"]);
const VALID_HABIT_STATUSES = new Set<HabitStatus>(["active", "archived"]);
const DEFAULT_CUSTOM_INTERVAL_DAYS = 3;

export function getDefaultDatabasePath(): string {
  const appData = process.env.APPDATA || join(homedir(), "AppData", "Roaming");
  return join(appData, "LetsPlan", "data.db");
}

export class LetsPlanDatabase {
  private readonly db: SqliteDatabase;

  constructor(databasePath = getDefaultDatabasePath()) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.db = new DatabaseSync(databasePath);
    this.db.exec("PRAGMA foreign_keys = ON");
    this.initSchema();
  }

  close(): void {
    this.db.close();
  }

  getOrCreatePlan(planDate: string): DailyPlan {
    assertPlanDate(planDate);

    const existing = this.getPlan(planDate);
    if (existing) {
      return existing;
    }

    this.db.prepare("INSERT INTO daily_plans (plan_date) VALUES (?)").run(planDate);

    const created = this.getPlan(planDate);
    if (!created) {
      throw new Error(`Failed to create daily plan for ${planDate}.`);
    }

    return created;
  }

  getPlan(planDate: string): DailyPlan | null {
    assertPlanDate(planDate);

    const row = this.db
      .prepare("SELECT * FROM daily_plans WHERE plan_date = ?")
      .get(planDate) as unknown as DailyPlanRow | undefined;

    return row ? mapDailyPlan(row) : null;
  }

  getPlanWithTasks(planDate: string): PlanWithTasks {
    const plan = this.getOrCreatePlan(planDate);
    return {
      plan,
      tasks: this.listTasks(plan.id)
    };
  }

  addTask(planDate: string, input: CreateTaskInput): Task {
    const content = input.content.trim();
    if (!content) {
      throw new Error("Task content is required.");
    }

    const urgency = input.urgency ?? "regular";
    const category = input.category ?? "work";
    assertUrgency(urgency);
    assertCategory(category);

    const plan = this.getOrCreatePlan(planDate);
    const nextSortOrder = this.allocateSortOrder(plan.id, urgency);

    const result = this.db
      .prepare(
        `
        INSERT INTO tasks (plan_id, content, urgency, category, sort_order)
        VALUES (?, ?, ?, ?, ?)
        `
      )
      .run(plan.id, content, urgency, category, nextSortOrder);

    const task = this.getTask(Number(result.lastInsertRowid));
    if (!task) {
      throw new Error("Failed to create task.");
    }

    this.refreshPlanCompletion(plan.id);
    return task;
  }

  listTasks(planId: number): Task[] {
    const rows = this.db
      .prepare(
        `
        SELECT * FROM tasks
        WHERE plan_id = ?
        ORDER BY
          sort_order ASC,
          CASE urgency WHEN 'urgent' THEN 0 ELSE 1 END,
          id ASC
        `
      )
      .all(planId) as unknown as TaskRow[];

    return rows.map(mapTask);
  }

  setTaskStatus(taskId: number, status: TaskStatus): Task {
    assertStatus(status);

    const task = this.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} does not exist.`);
    }

    const completedAtExpression = status === "done" ? "COALESCE(completed_at, datetime('now', 'localtime'))" : "NULL";

    this.db
      .prepare(
        `
        UPDATE tasks
        SET status = ?, completed_at = ${completedAtExpression}
        WHERE id = ?
        `
      )
      .run(status, taskId);

    this.refreshPlanCompletion(task.planId);

    const updated = this.getTask(taskId);
    if (!updated) {
      throw new Error(`Task ${taskId} was removed during status update.`);
    }

    return updated;
  }

  updateTask(taskId: number, input: UpdateTaskInput): Task {
    const task = this.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} does not exist.`);
    }

    const content = input.content === undefined ? task.content : input.content.trim();
    if (!content) {
      throw new Error("Task content is required.");
    }

    const urgency = input.urgency ?? task.urgency;
    const category = input.category ?? task.category;
    assertUrgency(urgency);
    assertCategory(category);

    this.db
      .prepare(
        `
        UPDATE tasks
        SET content = ?, urgency = ?, category = ?
        WHERE id = ?
        `
      )
      .run(content, urgency, category, taskId);

    const updated = this.getTask(taskId);
    if (!updated) {
      throw new Error(`Task ${taskId} was removed during update.`);
    }

    return updated;
  }

  deleteTask(taskId: number): Task {
    const task = this.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} does not exist.`);
    }

    const result = this.db.prepare("DELETE FROM tasks WHERE id = ?").run(taskId);
    if (result.changes !== 1) {
      throw new Error(`Failed to delete task ${taskId}.`);
    }

    this.refreshPlanCompletion(task.planId);
    return task;
  }

  reorderTasks(planId: number, orderedTaskIds: number[]): Task[] {
    const uniqueTaskIds = new Set(orderedTaskIds);
    if (uniqueTaskIds.size !== orderedTaskIds.length) {
      throw new Error("Task order contains duplicate ids.");
    }

    const existingTasks = this.listTasks(planId);
    const existingTaskIds = new Set(existingTasks.map((task) => task.id));
    const hasForeignTask = orderedTaskIds.some((taskId) => !existingTaskIds.has(taskId));
    if (hasForeignTask) {
      throw new Error("Task order contains tasks outside the plan.");
    }

    const remainingTaskIds = existingTasks.filter((task) => !uniqueTaskIds.has(task.id)).map((task) => task.id);
    const nextTaskIds = [...orderedTaskIds, ...remainingTaskIds];
    const updateSortOrder = this.db.prepare("UPDATE tasks SET sort_order = ? WHERE id = ? AND plan_id = ?");
    this.db.exec("BEGIN IMMEDIATE TRANSACTION");
    try {
      nextTaskIds.forEach((taskId, index) => updateSortOrder.run(index, taskId, planId));
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return this.listTasks(planId);
  }

  createHabit(input: CreateHabitInput): Habit {
    const name = input.name.trim();
    if (!name) {
      throw new Error("Habit name is required.");
    }

    const frequency = input.frequency ?? "daily";
    assertHabitFrequency(frequency);
    const customIntervalDays = normalizeCustomIntervalDays(frequency, input.customIntervalDays);

    const result = this.db
      .prepare(
        `
        INSERT INTO habits (name, frequency, custom_interval_days)
        VALUES (?, ?, ?)
        `
      )
      .run(name, frequency, customIntervalDays);

    const habit = this.getHabit(Number(result.lastInsertRowid));
    if (!habit) {
      throw new Error("Failed to create habit.");
    }

    return habit;
  }

  updateHabit(habitId: number, input: UpdateHabitInput): Habit {
    const habit = this.getHabit(habitId);
    if (!habit) {
      throw new Error(`Habit ${habitId} does not exist.`);
    }

    const name = input.name === undefined ? habit.name : input.name.trim();
    if (!name) {
      throw new Error("Habit name is required.");
    }

    const frequency = input.frequency ?? habit.frequency;
    assertHabitFrequency(frequency);
    const customIntervalDays = normalizeCustomIntervalDays(
      frequency,
      input.customIntervalDays === undefined ? habit.customIntervalDays : input.customIntervalDays
    );
    const status = input.status ?? habit.status;
    assertHabitStatus(status);

    this.db
      .prepare(
        `
        UPDATE habits
        SET name = ?,
            frequency = ?,
            custom_interval_days = ?,
            status = ?,
            archived_at = CASE
              WHEN ? = 'archived' THEN COALESCE(archived_at, datetime('now', 'localtime'))
              ELSE NULL
            END
        WHERE id = ?
        `
      )
      .run(name, frequency, customIntervalDays, status, status, habitId);

    const updated = this.getHabit(habitId);
    if (!updated) {
      throw new Error(`Habit ${habitId} was removed during update.`);
    }

    return updated;
  }

  archiveHabit(habitId: number): Habit {
    return this.updateHabit(habitId, { status: "archived" });
  }

  listHabits(status: HabitStatus | "all" = "active"): Habit[] {
    const rows = (status === "all"
      ? this.db.prepare("SELECT * FROM habits ORDER BY status ASC, id ASC").all()
      : this.db.prepare("SELECT * FROM habits WHERE status = ? ORDER BY id ASC").all(status)) as unknown as HabitRow[];

    return rows.map(mapHabit);
  }

  checkInHabit(habitId: number, logDate: string): HabitLog {
    assertPlanDate(logDate);
    const habit = this.requireActiveHabit(habitId);

    this.db
      .prepare(
        `
        INSERT OR IGNORE INTO habit_logs (habit_id, log_date)
        VALUES (?, ?)
        `
      )
      .run(habit.id, logDate);

    const log = this.getHabitLog(habit.id, logDate);
    if (!log) {
      throw new Error("Failed to check in habit.");
    }

    return log;
  }

  undoHabitCheckIn(habitId: number, logDate: string): void {
    assertPlanDate(logDate);
    const habit = this.getHabit(habitId);
    if (!habit) {
      throw new Error(`Habit ${habitId} does not exist.`);
    }

    this.db.prepare("DELETE FROM habit_logs WHERE habit_id = ? AND log_date = ?").run(habitId, logDate);
  }

  listHabitLogs(habitId: number): HabitLog[] {
    const rows = this.db
      .prepare("SELECT * FROM habit_logs WHERE habit_id = ? ORDER BY log_date ASC, id ASC")
      .all(habitId) as unknown as HabitLogRow[];

    return rows.map(mapHabitLog);
  }

  getHabitProgress(planDate: string): HabitView[] {
    assertPlanDate(planDate);
    return this.listHabits("active").map((habit) => buildHabitView(habit, this.listHabitLogs(habit.id), planDate));
  }

  getHabitStats(planDate: string): HabitStats {
    const habits = this.getHabitProgress(planDate);
    const total = habits.length;
    const checkedCount = habits.filter((item) => item.isCheckedToday).length;

    return {
      total,
      checkedCount,
      percentage: total === 0 ? 0 : Math.round((checkedCount / total) * 100),
      brokenCount: habits.filter((item) => item.isBroken).length,
      recoverableCount: habits.filter((item) => item.canRecover).length
    };
  }

  listPlanSummaries(limit = 30): PlanSummary[] {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error("History limit must be a positive integer.");
    }

    const rows = this.db
      .prepare(
        `
        SELECT
          dp.plan_date,
          dp.completed_at,
          COUNT(t.id) AS total,
          COALESCE(SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END), 0) AS done_count
        FROM daily_plans dp
        LEFT JOIN tasks t ON t.plan_id = dp.id
        GROUP BY dp.id
        ORDER BY dp.plan_date DESC
        LIMIT ?
        `
      )
      .all(limit) as unknown as PlanSummaryRow[];

    return rows.map(mapPlanSummary);
  }

  listPlanDates(): string[] {
    const rows = this.db
      .prepare("SELECT plan_date FROM daily_plans ORDER BY plan_date ASC")
      .all() as unknown as Array<{ plan_date: string }>;

    return rows.map((row) => row.plan_date);
  }

  getPlanStats(planId: number): PlanStats {
    const row = this.db
      .prepare(
        `
        SELECT
          COUNT(*) AS total,
          COALESCE(SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END), 0) AS done_count
        FROM tasks
        WHERE plan_id = ?
        `
      )
      .get(planId) as unknown as TaskCountRow;

    const total = row.total;
    const doneCount = row.done_count;

    return {
      total,
      doneCount,
      percentage: total === 0 ? 0 : Math.round((doneCount / total) * 100)
    };
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS daily_plans (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_date    TEXT    NOT NULL,
        created_at   TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
        completed_at TEXT,
        UNIQUE(plan_date)
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_id      INTEGER NOT NULL,
        content      TEXT    NOT NULL,
        urgency      TEXT    NOT NULL DEFAULT 'regular',
        category     TEXT    NOT NULL DEFAULT 'work',
        status       TEXT    NOT NULL DEFAULT 'pending',
        sort_order   INTEGER NOT NULL DEFAULT 0,
        created_at   TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
        completed_at TEXT,
        FOREIGN KEY (plan_id) REFERENCES daily_plans(id) ON DELETE CASCADE,
        CHECK (urgency IN ('urgent', 'regular')),
        CHECK (category IN ('work', 'study')),
        CHECK (status IN ('pending', 'done'))
      );

      CREATE TABLE IF NOT EXISTS habits (
        id                   INTEGER PRIMARY KEY AUTOINCREMENT,
        name                 TEXT    NOT NULL,
        frequency            TEXT    NOT NULL DEFAULT 'daily',
        custom_interval_days INTEGER,
        status               TEXT    NOT NULL DEFAULT 'active',
        created_at           TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
        archived_at          TEXT,
        CHECK (frequency IN ('daily', 'weekly', 'custom')),
        CHECK (status IN ('active', 'archived')),
        CHECK (custom_interval_days IS NULL OR custom_interval_days >= 2)
      );

      CREATE TABLE IF NOT EXISTS habit_logs (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        habit_id   INTEGER NOT NULL,
        log_date   TEXT    NOT NULL,
        created_at TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE,
        UNIQUE(habit_id, log_date)
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_plan_id ON tasks(plan_id);
      CREATE INDEX IF NOT EXISTS idx_daily_plans_date ON daily_plans(plan_date);
      CREATE INDEX IF NOT EXISTS idx_habits_status ON habits(status);
      CREATE INDEX IF NOT EXISTS idx_habit_logs_habit_date ON habit_logs(habit_id, log_date);
    `);
  }

  private allocateSortOrder(planId: number, urgency: TaskUrgency): number {
    if (urgency !== "urgent") {
      return this.getNextSortOrder(planId);
    }

    const row = this.db
      .prepare("SELECT MIN(sort_order) AS first_regular_order FROM tasks WHERE plan_id = ? AND urgency <> 'urgent'")
      .get(planId) as unknown as { first_regular_order: number | null };

    if (row.first_regular_order === null) {
      return this.getNextSortOrder(planId);
    }

    this.db.prepare("UPDATE tasks SET sort_order = sort_order + 1 WHERE plan_id = ? AND sort_order >= ?").run(planId, row.first_regular_order);

    return row.first_regular_order;
  }

  private getTask(taskId: number): Task | null {
    const row = this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as unknown as TaskRow | undefined;

    return row ? mapTask(row) : null;
  }

  private getHabit(habitId: number): Habit | null {
    const row = this.db.prepare("SELECT * FROM habits WHERE id = ?").get(habitId) as unknown as HabitRow | undefined;

    return row ? mapHabit(row) : null;
  }

  private requireActiveHabit(habitId: number): Habit {
    const habit = this.getHabit(habitId);
    if (!habit) {
      throw new Error(`Habit ${habitId} does not exist.`);
    }
    if (habit.status !== "active") {
      throw new Error(`Habit ${habitId} is archived.`);
    }

    return habit;
  }

  private getHabitLog(habitId: number, logDate: string): HabitLog | null {
    const row = this.db
      .prepare("SELECT * FROM habit_logs WHERE habit_id = ? AND log_date = ?")
      .get(habitId, logDate) as unknown as HabitLogRow | undefined;

    return row ? mapHabitLog(row) : null;
  }

  private getNextSortOrder(planId: number): number {
    const row = this.db
      .prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM tasks WHERE plan_id = ?")
      .get(planId) as unknown as { next_order: number };

    return row.next_order;
  }

  private refreshPlanCompletion(planId: number): void {
    const stats = this.getPlanStats(planId);
    const shouldBeCompleted = stats.total > 0 && stats.doneCount === stats.total;

    this.db
      .prepare(
        `
        UPDATE daily_plans
        SET completed_at = CASE
          WHEN ? THEN COALESCE(completed_at, datetime('now', 'localtime'))
          ELSE NULL
        END
        WHERE id = ?
        `
      )
      .run(shouldBeCompleted ? 1 : 0, planId);
  }
}

function assertPlanDate(planDate: string): void {
  if (!PLAN_DATE_PATTERN.test(planDate)) {
    throw new Error("Plan date must use YYYY-MM-DD format.");
  }
}

function assertUrgency(urgency: TaskUrgency): void {
  if (!VALID_URGENCIES.has(urgency)) {
    throw new Error(`Unsupported urgency: ${urgency}`);
  }
}

function assertCategory(category: TaskCategory): void {
  if (!VALID_CATEGORIES.has(category)) {
    throw new Error(`Unsupported category: ${category}`);
  }
}

function assertStatus(status: TaskStatus): void {
  if (!VALID_STATUSES.has(status)) {
    throw new Error(`Unsupported task status: ${status}`);
  }
}

function assertHabitFrequency(frequency: HabitFrequency): void {
  if (!VALID_HABIT_FREQUENCIES.has(frequency)) {
    throw new Error(`Unsupported habit frequency: ${frequency}`);
  }
}

function assertHabitStatus(status: HabitStatus): void {
  if (!VALID_HABIT_STATUSES.has(status)) {
    throw new Error(`Unsupported habit status: ${status}`);
  }
}

function normalizeCustomIntervalDays(frequency: HabitFrequency, value: number | null | undefined): number | null {
  if (frequency !== "custom") {
    return null;
  }

  const interval = value ?? DEFAULT_CUSTOM_INTERVAL_DAYS;
  if (!Number.isInteger(interval) || interval < 2) {
    throw new Error("Custom habit interval must be an integer greater than or equal to 2.");
  }

  return interval;
}

function buildHabitView(habit: Habit, logs: HabitLog[], planDate: string): HabitView {
  const logDates = [...new Set(logs.map((log) => log.logDate).filter((logDate) => logDate <= planDate))].sort();
  const lastCheckedDate = logDates.at(-1) ?? null;
  const isCheckedToday = isHabitCheckedForDate(habit, logDates, planDate);
  const periodGap = getHabitPeriodGap(habit, lastCheckedDate, planDate);

  return {
    habit,
    isCheckedToday,
    streak: calculateHabitStreak(habit, logDates, planDate),
    lastCheckedDate,
    isBroken: periodGap !== null && periodGap > 1,
    canRecover: !isCheckedToday && periodGap !== null && periodGap <= 2
  };
}

function isHabitCheckedForDate(habit: Habit, logDates: string[], planDate: string): boolean {
  if (habit.frequency === "weekly") {
    const weekStart = getWeekStartDate(planDate);
    return logDates.some((logDate) => getWeekStartDate(logDate) === weekStart);
  }

  return logDates.includes(planDate);
}

function getHabitPeriodGap(habit: Habit, lastCheckedDate: string | null, planDate: string): number | null {
  if (!lastCheckedDate) {
    return null;
  }

  if (habit.frequency === "weekly") {
    return Math.floor(daysBetween(getWeekStartDate(lastCheckedDate), getWeekStartDate(planDate)) / 7);
  }

  const allowedGap = habit.frequency === "custom" ? habit.customIntervalDays ?? DEFAULT_CUSTOM_INTERVAL_DAYS : 1;
  return Math.ceil(daysBetween(lastCheckedDate, planDate) / allowedGap);
}

function calculateHabitStreak(habit: Habit, logDates: string[], planDate: string): number {
  if (logDates.length === 0) {
    return 0;
  }

  if (habit.frequency === "weekly") {
    const loggedWeeks = new Set(logDates.map(getWeekStartDate));
    let cursor = getWeekStartDate(planDate);
    if (!loggedWeeks.has(cursor)) {
      cursor = shiftPlanDate(cursor, -7);
    }

    let streak = 0;
    while (loggedWeeks.has(cursor)) {
      streak += 1;
      cursor = shiftPlanDate(cursor, -7);
    }

    return streak;
  }

  if (habit.frequency === "custom") {
    const intervalDays = habit.customIntervalDays ?? DEFAULT_CUSTOM_INTERVAL_DAYS;
    let streak = 0;
    let previousDate: string | null = null;

    for (const logDate of logDates) {
      streak = previousDate === null || daysBetween(previousDate, logDate) <= intervalDays ? streak + 1 : 1;
      previousDate = logDate;
    }

    return streak;
  }

  const loggedDays = new Set(logDates);
  let cursor = planDate;
  if (!loggedDays.has(cursor)) {
    cursor = shiftPlanDate(cursor, -1);
  }

  let streak = 0;
  while (loggedDays.has(cursor)) {
    streak += 1;
    cursor = shiftPlanDate(cursor, -1);
  }

  return streak;
}

function shiftPlanDate(planDate: string, offsetDays: number): string {
  const [year, month, day] = planDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + offsetDays));

  return date.toISOString().slice(0, 10);
}

function getWeekStartDate(planDate: string): string {
  const [year, month, day] = planDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - dayOfWeek + 1);

  return date.toISOString().slice(0, 10);
}

function daysBetween(startDate: string, endDate: string): number {
  const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = endDate.split("-").map(Number);
  const start = Date.UTC(startYear, startMonth - 1, startDay);
  const end = Date.UTC(endYear, endMonth - 1, endDay);

  return Math.max(0, Math.round((end - start) / 86_400_000));
}

function mapPlanSummary(row: PlanSummaryRow): PlanSummary {
  const total = row.total;
  const doneCount = row.done_count;

  return {
    planDate: row.plan_date,
    completedAt: row.completed_at,
    total,
    doneCount,
    percentage: total === 0 ? 0 : Math.round((doneCount / total) * 100),
    isCompleted: total > 0 && doneCount === total
  };
}

function mapDailyPlan(row: DailyPlanRow): DailyPlan {
  return {
    id: row.id,
    planDate: row.plan_date,
    createdAt: row.created_at,
    completedAt: row.completed_at
  };
}

function mapTask(row: TaskRow): Task {
  return {
    id: row.id,
    planId: row.plan_id,
    content: row.content,
    urgency: row.urgency,
    category: row.category,
    status: row.status,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    completedAt: row.completed_at
  };
}

function mapHabit(row: HabitRow): Habit {
  return {
    id: row.id,
    name: row.name,
    frequency: row.frequency,
    customIntervalDays: row.custom_interval_days,
    status: row.status,
    createdAt: row.created_at,
    archivedAt: row.archived_at
  };
}

function mapHabitLog(row: HabitLogRow): HabitLog {
  return {
    id: row.id,
    habitId: row.habit_id,
    logDate: row.log_date,
    createdAt: row.created_at
  };
}
