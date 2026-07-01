import { describe, expect, it } from "vitest";
import { isPointerInsidePetInteractionZone } from "../../../src/modules/ui/petHitTest.js";

describe("pet hit test", () => {
  it("accepts the pet body area", () => {
    expect(isPointerInsidePetInteractionZone({ clientX: 90, clientY: 112, windowWidth: 180, windowHeight: 180 })).toBe(true);
  });

  it("ignores the top bubble area so it does not block mouse operations", () => {
    expect(isPointerInsidePetInteractionZone({ clientX: 90, clientY: 14, windowWidth: 180, windowHeight: 180 })).toBe(false);
  });

  it("keeps the interaction zone stable for a wider pet window", () => {
    expect(isPointerInsidePetInteractionZone({ clientX: 16, clientY: 90, windowWidth: 260, windowHeight: 180 })).toBe(false);
    expect(isPointerInsidePetInteractionZone({ clientX: 130, clientY: 90, windowWidth: 260, windowHeight: 180 })).toBe(true);
  });
});
