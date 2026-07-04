import type { HabitStats, Task } from "../database/types.js";
import type { InterventionSnapshot } from "./intervention.js";

export type AgentInsightRisk = "clear" | "watch" | "risk" | "blocked";
export type AgentInsightFocus = "plan" | "urgent" | "habit" | "finish" | "recover" | "complete";

export interface AgentInsightSnapshot {
  risk: AgentInsightRisk;
  focus: AgentInsightFocus;
  score: number;
  headline: string;
  nextAction: string;
  reason: string;
  signals: string[];
}

export interface BuildAgentInsightInput {
  pendingTasks: Task[];
  doneTasks: Task[];
  habitStats: HabitStats;
  intervention: InterventionSnapshot;
  isCompleted: boolean;
}

export function buildAgentInsight(input: BuildAgentInsightInput): AgentInsightSnapshot {
  const pendingTasks = [...input.pendingTasks].sort(compareTasksForAttention);
  const doneCount = input.doneTasks.length;
  const totalTasks = input.pendingTasks.length + input.doneTasks.length;
  const completionRate = totalTasks === 0 ? 0 : Math.round((doneCount / totalTasks) * 100);
  const urgentPending = pendingTasks.filter((task) => task.urgency === "urgent");
  const firstTask = urgentPending[0] ?? pendingTasks[0] ?? null;
  const interventionRank = getInterventionRank(input.intervention.level);
  const signals = buildSignals(input, completionRate, urgentPending.length);
  const score = getAgentScore({
    completionRate,
    habitStats: input.habitStats,
    interventionRank,
    urgentPendingCount: urgentPending.length,
    isCompleted: input.isCompleted
  });

  if (input.isCompleted) {
    return {
      risk: "clear",
      focus: "complete",
      score,
      headline: "今天的主线已经收束完整",
      nextAction: "做一次 2 分钟复盘，保留明天可复用的节奏",
      reason: "任务已全部完成，继续加任务前先把有效策略沉淀下来。",
      signals
    };
  }

  if (input.intervention.level === "l4") {
    return {
      risk: "blocked",
      focus: "recover",
      score,
      headline: "当前进入强提醒区，需要立刻打断拖延",
      nextAction: firstTask ? `只做一步：${firstTask.content}` : "先写下一个 5 分钟内能完成的小任务",
      reason: "长时间无推进已经触发 L4，先恢复行动比继续规划更重要。",
      signals
    };
  }

  if (input.habitStats.brokenCount > 0) {
    return {
      risk: "risk",
      focus: "habit",
      score,
      headline: "习惯链路有断签风险",
      nextAction: "先补一个最小打卡动作，再回到今日任务",
      reason: "习惯断签会削弱连续感，先修复节奏更稳。",
      signals
    };
  }

  if (urgentPending.length > 0) {
    return {
      risk: interventionRank >= 2 ? "blocked" : "risk",
      focus: "urgent",
      score,
      headline: "紧急任务还在队列里，当前应减少切换",
      nextAction: `先推进：${urgentPending[0].content}`,
      reason: "紧急任务未完成会持续占用注意力，先把最贵的风险压下去。",
      signals
    };
  }

  if (input.habitStats.recoverableCount > 0) {
    return {
      risk: "watch",
      focus: "habit",
      score,
      headline: "今天可以顺手接回一个习惯连续感",
      nextAction: "完成一个可恢复习惯，再继续任务清单",
      reason: "可恢复习惯还没失控，用很小动作就能把连续感接回来。",
      signals
    };
  }

  if (totalTasks === 0) {
    return {
      risk: "watch",
      focus: "plan",
      score,
      headline: "今天还没有形成清晰主线",
      nextAction: "先写下一个最小任务，控制在 5 分钟内能启动",
      reason: "没有任务时桌宠无法判断推进方向，先给系统一个明确锚点。",
      signals
    };
  }

  if (completionRate >= 70) {
    return {
      risk: "clear",
      focus: "finish",
      score,
      headline: "今日进度已经接近收尾",
      nextAction: firstTask ? `收掉最后几项：${firstTask.content}` : "检查是否还有漏记事项",
      reason: "完成率已经较高，继续切换会稀释收尾优势。",
      signals
    };
  }

  return {
    risk: interventionRank >= 2 ? "risk" : "watch",
    focus: "plan",
    score,
    headline: "今天已经启动，下一步要更具体",
    nextAction: firstTask ? `推进下一项：${firstTask.content}` : "选择一个任务做 10 分钟",
    reason: "当前还没到危险区，但需要一个明确动作维持动量。",
    signals
  };
}

function buildSignals(input: BuildAgentInsightInput, completionRate: number, urgentPendingCount: number): string[] {
  const totalTasks = input.pendingTasks.length + input.doneTasks.length;
  const signals = totalTasks > 0
    ? [`任务进度 ${input.doneTasks.length}/${totalTasks}，完成率 ${completionRate}%`]
    : ["今天还没有任务"];

  if (urgentPendingCount > 0) {
    signals.push(`紧急待办 ${urgentPendingCount} 个`);
  }
  if (input.habitStats.total > 0) {
    signals.push(`习惯打卡 ${input.habitStats.checkedCount}/${input.habitStats.total}`);
  }
  if (input.intervention.level !== "none") {
    signals.push(`干预等级 ${input.intervention.level.toUpperCase()}`);
  }

  return signals.slice(0, 4);
}

function getAgentScore(input: { completionRate: number; habitStats: HabitStats; interventionRank: number; urgentPendingCount: number; isCompleted: boolean }): number {
  if (input.isCompleted) {
    return 100;
  }

  const habitScore = input.habitStats.total === 0 ? 50 : input.habitStats.percentage;
  const baseScore = Math.round(input.completionRate * 0.72 + habitScore * 0.28);
  const penalty = input.interventionRank * 10 + input.urgentPendingCount * 8 + input.habitStats.brokenCount * 12 + input.habitStats.recoverableCount * 4;

  return clamp(baseScore - penalty, 0, 100);
}

function compareTasksForAttention(first: Task, second: Task): number {
  if (first.urgency !== second.urgency) {
    return first.urgency === "urgent" ? -1 : 1;
  }
  if (first.sortOrder !== second.sortOrder) {
    return first.sortOrder - second.sortOrder;
  }

  return first.id - second.id;
}

function getInterventionRank(level: InterventionSnapshot["level"]): number {
  return { none: 0, l1: 1, l2: 2, l3: 3, l4: 4 }[level];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}