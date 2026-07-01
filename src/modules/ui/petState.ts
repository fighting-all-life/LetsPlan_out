export const PET_STATE_IDS = ["sleep", "idle", "focused", "excited", "celebrate", "warning", "escape", "dizzy"] as const;

export type PetStateId = (typeof PET_STATE_IDS)[number];
export type PetMood = PetStateId;
export type PetTransitionReason = "progress" | "idle-warning" | "escape" | "manual";

export interface PetProgress {
  percentage: number;
  total: number;
  doneCount: number;
}

export interface PetViewState extends PetProgress {
  mood: PetMood;
  message: string;
}

export interface PetFsmState {
  currentMood: PetMood;
  previousMood: PetMood | null;
  reason: PetTransitionReason;
  updatedAt: string;
  progress: PetProgress;
}

interface PetFsmStateOptions {
  currentMood?: PetMood;
  previousMood?: PetMood | null;
  reason?: PetTransitionReason;
  updatedAt?: string;
}

export function isPetStateId(value: unknown): value is PetStateId {
  return typeof value === "string" && (PET_STATE_IDS as readonly string[]).includes(value);
}

export function getPetMood(progress: PetProgress): PetMood {
  if (progress.total > 0 && progress.percentage >= 100) {
    return "celebrate";
  }
  if (progress.percentage > 70) {
    return "excited";
  }
  if (progress.percentage > 30) {
    return "focused";
  }
  if (progress.percentage > 0) {
    return "idle";
  }

  return "sleep";
}

export function buildPetViewState(progress: PetProgress): PetViewState {
  const mood = getPetMood(progress);
  const remaining = Math.max(0, progress.total - progress.doneCount);
  const messages: Record<PetMood, string> = {
    sleep: "\u4eca\u5929\u4e5f\u8981\u52a0\u6cb9\u54e6",
    idle: `\u8fd8\u5269 ${remaining} \u4e2a\u4efb\u52a1`,
    focused: `\u5df2\u5b8c\u6210 ${progress.percentage}%`,
    excited: `\u5f88\u63a5\u8fd1\u4e86\uff1a${progress.percentage}%`,
    celebrate: "\u592a\u68d2\u4e86\uff0c\u5168\u90e8\u5b8c\u6210",
    warning: "\u6709\u4e00\u4f1a\u513f\u6ca1\u52a8\u5566",
    escape: "\u5148\u522b\u6293\u6211\uff0c\u53bb\u5b8c\u6210\u4e00\u4e2a\u5c0f\u4efb\u52a1",
    dizzy: "\u6655\u4e4e\u4e4e\u7684\uff0c\u522b\u6643\u5566"
  };

  return {
    ...progress,
    mood,
    message: messages[mood]
  };
}

export function buildPetFsmState(progress: PetProgress, options: PetFsmStateOptions = {}): PetFsmState {
  return {
    currentMood: options.currentMood ?? getPetMood(progress),
    previousMood: options.previousMood ?? null,
    reason: options.reason ?? "progress",
    updatedAt: options.updatedAt ?? new Date().toISOString(),
    progress
  };
}
