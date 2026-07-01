export interface PetDragShakeState {
  startedAt: number;
  lastX: number;
  lastY: number;
  totalDistance: number;
  directionChanges: number;
  lastHorizontalDirection: -1 | 0 | 1;
}

export interface PetDragShakeUpdate {
  state: PetDragShakeState;
  deltaX: number;
  deltaY: number;
  shouldDizzy: boolean;
}

export interface PetDomPositionInput {
  targetX: number;
  targetY: number;
  viewportWidth: number;
  viewportHeight: number;
  petWidth: number;
  petHeight: number;
}

export interface PetDragTargetInput {
  clientX: number;
  clientY: number;
  dragOffsetX: number;
  dragOffsetY: number;
  viewportWidth: number;
  viewportHeight: number;
  petWidth: number;
  petHeight: number;
}

export interface PetDomPosition {
  left: number;
  top: number;
}

export const PET_DIZZY_SHAKE_DURATION_MS = 3_000;
export const PET_DIZZY_RECOVER_MS = 3_000;
export const PET_DODGE_DISTANCE = 130;
const PET_DIZZY_MIN_DISTANCE = 160;
const PET_DIZZY_MIN_DIRECTION_CHANGES = 4;
const DIRECTION_DELTA_THRESHOLD = 6;

export function createPetDragShakeState(x: number, y: number, now: number): PetDragShakeState {
  return {
    startedAt: now,
    lastX: x,
    lastY: y,
    totalDistance: 0,
    directionChanges: 0,
    lastHorizontalDirection: 0
  };
}

export function updatePetDragShakeState(state: PetDragShakeState, x: number, y: number, now: number): PetDragShakeUpdate {
  const deltaX = x - state.lastX;
  const deltaY = y - state.lastY;
  const direction = getHorizontalDirection(deltaX);
  const directionChanges = direction !== 0 && state.lastHorizontalDirection !== 0 && direction !== state.lastHorizontalDirection
    ? state.directionChanges + 1
    : state.directionChanges;
  const nextState: PetDragShakeState = {
    startedAt: state.startedAt,
    lastX: x,
    lastY: y,
    totalDistance: state.totalDistance + Math.hypot(deltaX, deltaY),
    directionChanges,
    lastHorizontalDirection: direction === 0 ? state.lastHorizontalDirection : direction
  };

  return {
    state: nextState,
    deltaX,
    deltaY,
    shouldDizzy: now - state.startedAt >= PET_DIZZY_SHAKE_DURATION_MS
      && nextState.totalDistance >= PET_DIZZY_MIN_DISTANCE
      && nextState.directionChanges >= PET_DIZZY_MIN_DIRECTION_CHANGES
  };
}

export function calculatePetDragTarget(input: PetDragTargetInput): PetDomPosition {
  const targetX = input.clientX - input.dragOffsetX;
  const targetY = input.clientY - input.dragOffsetY;

  return clampPetDomPosition({
    targetX,
    targetY,
    viewportWidth: input.viewportWidth,
    viewportHeight: input.viewportHeight,
    petWidth: input.petWidth,
    petHeight: input.petHeight
  });
}

export function clampPetDomPosition(input: PetDomPositionInput): PetDomPosition {
  const maxX = Math.max(0, input.viewportWidth - Math.max(0, input.petWidth));
  const maxY = Math.max(0, input.viewportHeight - Math.max(0, input.petHeight));

  return {
    left: Math.round(clampNumber(input.targetX, 0, maxX)),
    top: Math.round(clampNumber(input.targetY, 0, maxY))
  };
}

function getHorizontalDirection(deltaX: number): -1 | 0 | 1 {
  if (Math.abs(deltaX) < DIRECTION_DELTA_THRESHOLD) {
    return 0;
  }

  return deltaX > 0 ? 1 : -1;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export interface PetDodgeInput {
  pointerX: number;
  pointerY: number;
  windowX: number;
  windowY: number;
  windowWidth: number;
  windowHeight: number;
  dodgeDistance?: number;
}

export function calculatePetDodgeDelta(input: PetDodgeInput): { deltaX: number; deltaY: number } {
  const centerX = input.windowX + input.windowWidth / 2;
  const centerY = input.windowY + input.windowHeight / 2;
  const dodgeDistance = clampPetDodgeDistance(input.dodgeDistance);
  const rawX = centerX - input.pointerX;
  const rawY = centerY - input.pointerY;
  const length = Math.hypot(rawX, rawY) || 1;
  const deltaX = Math.round((rawX / length) * dodgeDistance);
  const deltaY = Math.round((rawY / length) * dodgeDistance);

  if (Math.abs(deltaX) + Math.abs(deltaY) < 40) {
    return { deltaX: dodgeDistance, deltaY: -Math.round(dodgeDistance / 2) };
  }

  return { deltaX, deltaY };
}

export function clampPetDodgeDistance(value: unknown, fallback = PET_DODGE_DISTANCE): number {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.max(40, Math.min(320, Math.trunc(numericValue)));
}




