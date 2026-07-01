import { describe, expect, it } from "vitest";
import { clampPetWindowPosition, clampPetWindowTargetPosition, getVirtualWorkAreaBounds } from "../../../src/main/petWindowBounds.js";

describe("pet window bounds", () => {
  it("can still calculate a virtual work area for diagnostics", () => {
    expect(getVirtualWorkAreaBounds([
      { x: 0, y: 0, width: 1920, height: 1040 },
      { x: 1920, y: 0, width: 1920, height: 1040 }
    ])).toEqual({ x: 0, y: 0, width: 3840, height: 1040 });
  });

  it("keeps relative movement inside the primary work area", () => {
    expect(clampPetWindowPosition({
      x: 1800,
      y: 120,
      width: 180,
      height: 180,
      deltaX: 400,
      deltaY: 0,
      workAreas: [
        { x: 0, y: 0, width: 1920, height: 1040 },
        { x: 1920, y: 0, width: 1920, height: 1040 }
      ]
    })).toEqual({ x: 1740, y: 120 });
  });

  it("clamps absolute target positions to the primary display", () => {
    expect(clampPetWindowTargetPosition({
      targetX: 2200,
      targetY: 240,
      width: 180,
      height: 180,
      workAreas: [
        { x: 0, y: 0, width: 1920, height: 1040 },
        { x: 1920, y: 0, width: 1920, height: 1040 }
      ]
    })).toEqual({ x: 1740, y: 240 });
  });

  it("clamps outside the primary display area", () => {
    expect(clampPetWindowPosition({
      x: 1600,
      y: 1000,
      width: 220,
      height: 200,
      deltaX: 400,
      deltaY: 400,
      workAreas: [
        { x: 0, y: 0, width: 1920, height: 1040 },
        { x: 1920, y: 0, width: 1920, height: 1040 }
      ]
    })).toEqual({ x: 1700, y: 840 });
  });

  it("supports a primary display with negative coordinates", () => {
    expect(clampPetWindowPosition({
      x: -20,
      y: 40,
      width: 160,
      height: 160,
      deltaX: -120,
      deltaY: 0,
      workAreas: [
        { x: -1280, y: 0, width: 1280, height: 984 },
        { x: 0, y: 0, width: 1920, height: 1040 }
      ]
    })).toEqual({ x: -160, y: 40 });
  });

  it("keeps the pet on the primary display when virtual bounds include a gap", () => {
    expect(clampPetWindowTargetPosition({
      targetX: 600,
      targetY: 1160,
      width: 180,
      height: 180,
      workAreas: [
        { x: 0, y: 0, width: 1920, height: 1040 },
        { x: 0, y: 1300, width: 1920, height: 1040 }
      ]
    })).toEqual({ x: 600, y: 860 });
  });
});