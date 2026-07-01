import { describe, expect, it } from "vitest";
import { buildPetFsmState, buildPetViewState, getPetMood, isPetStateId, PET_STATE_IDS } from "../../../src/modules/ui/petState.js";

describe("petState", () => {
  it("maps progress to desktop pet moods", () => {
    expect(getPetMood({ percentage: 0, total: 2, doneCount: 0 })).toBe("sleep");
    expect(getPetMood({ percentage: 10, total: 2, doneCount: 0 })).toBe("idle");
    expect(getPetMood({ percentage: 50, total: 2, doneCount: 1 })).toBe("focused");
    expect(getPetMood({ percentage: 80, total: 5, doneCount: 4 })).toBe("excited");
    expect(getPetMood({ percentage: 100, total: 1, doneCount: 1 })).toBe("celebrate");
  });

  it("defines the 2.1.0 pet FSM state set", () => {
    expect(PET_STATE_IDS).toEqual(["sleep", "idle", "focused", "excited", "celebrate", "warning", "escape", "dizzy"]);
    expect(isPetStateId("warning")).toBe(true);
    expect(isPetStateId("escape")).toBe(true);
    expect(isPetStateId("dizzy")).toBe(true);
    expect(isPetStateId("unknown")).toBe(false);
  });

  it("builds a user-facing status message", () => {
    expect(buildPetViewState({ percentage: 50, total: 4, doneCount: 2 })).toMatchObject({
      mood: "focused",
      message: "\u5df2\u5b8c\u6210 50%"
    });
  });

  it("builds a traceable FSM snapshot", () => {
    expect(
      buildPetFsmState(
        { percentage: 0, total: 3, doneCount: 0 },
        { currentMood: "warning", previousMood: "idle", reason: "idle-warning", updatedAt: "2026-06-28T00:00:00.000Z" }
      )
    ).toMatchObject({
      currentMood: "warning",
      previousMood: "idle",
      reason: "idle-warning",
      updatedAt: "2026-06-28T00:00:00.000Z"
    });
  });
});
