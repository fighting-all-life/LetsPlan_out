import { describe, expect, it } from "vitest";
import { calculatePetDodgeDelta, calculatePetDragTarget, clampPetDomPosition, createPetDragShakeState, updatePetDragShakeState } from "../../../src/modules/ui/petDrag.js";

describe("petDrag", () => {
  it("triggers dizzy after three seconds of back-and-forth shaking", () => {
    let state = createPetDragShakeState(0, 0, 0);
    let update = updatePetDragShakeState(state, 40, 0, 500);
    state = update.state;
    update = updatePetDragShakeState(state, -10, 0, 1000);
    state = update.state;
    update = updatePetDragShakeState(state, 45, 0, 1600);
    state = update.state;
    update = updatePetDragShakeState(state, -15, 0, 2300);
    state = update.state;
    update = updatePetDragShakeState(state, 50, 0, 3000);

    expect(update.shouldDizzy).toBe(true);
    expect(update.state.directionChanges).toBeGreaterThanOrEqual(4);
  });

  it("calculates a dodge delta away from the pointer", () => {
    const delta = calculatePetDodgeDelta({
      pointerX: 120,
      pointerY: 140,
      windowX: 100,
      windowY: 100,
      windowWidth: 180,
      windowHeight: 180
    });

    expect(delta.deltaX).toBeGreaterThan(0);
    expect(Math.hypot(delta.deltaX, delta.deltaY)).toBeGreaterThan(120);
  });

  it("uses the fixed client minus drag offset formula for dragging", () => {
    expect(calculatePetDragTarget({
      clientX: 500,
      clientY: 360,
      dragOffsetX: 42,
      dragOffsetY: 58,
      viewportWidth: 900,
      viewportHeight: 700,
      petWidth: 180,
      petHeight: 178
    })).toEqual({ left: 458, top: 302 });
  });

  it("clamps drag targets against the current viewport without shrinking the range", () => {
    const input = {
      viewportWidth: 900,
      viewportHeight: 700,
      petWidth: 180,
      petHeight: 178
    };

    expect(clampPetDomPosition({ ...input, targetX: -400, targetY: -90 })).toEqual({ left: 0, top: 0 });
    expect(clampPetDomPosition({ ...input, targetX: 2000, targetY: 1400 })).toEqual({ left: 720, top: 522 });
    expect(clampPetDomPosition({ ...input, targetX: 2000, targetY: 1400 })).toEqual({ left: 720, top: 522 });
  });

  it("does not trigger dizzy for a slow one-way drag", () => {
    let state = createPetDragShakeState(0, 0, 0);
    let update = updatePetDragShakeState(state, 20, 0, 1000);
    state = update.state;
    update = updatePetDragShakeState(state, 70, 0, 2500);
    state = update.state;
    update = updatePetDragShakeState(state, 170, 0, 3500);

    expect(update.shouldDizzy).toBe(false);
    expect(update.state.directionChanges).toBe(0);
  });
});




