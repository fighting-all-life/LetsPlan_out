export interface WorkAreaBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PetWindowPositionInput {
  x: number;
  y: number;
  width: number;
  height: number;
  deltaX: number;
  deltaY: number;
  workAreas: WorkAreaBounds[];
}

export interface PetWindowTargetPositionInput {
  targetX: number;
  targetY: number;
  width: number;
  height: number;
  workAreas: WorkAreaBounds[];
}

export interface PetWindowPosition {
  x: number;
  y: number;
}

export function getVirtualWorkAreaBounds(workAreas: WorkAreaBounds[]): WorkAreaBounds {
  if (workAreas.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const minX = Math.min(...workAreas.map((area) => area.x));
  const minY = Math.min(...workAreas.map((area) => area.y));
  const maxX = Math.max(...workAreas.map((area) => area.x + Math.max(0, area.width)));
  const maxY = Math.max(...workAreas.map((area) => area.y + Math.max(0, area.height)));

  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY)
  };
}

export function clampPetWindowPosition(input: PetWindowPositionInput): PetWindowPosition {
  return clampPetWindowTargetPosition({
    targetX: input.x + input.deltaX,
    targetY: input.y + input.deltaY,
    width: input.width,
    height: input.height,
    workAreas: input.workAreas
  });
}

export function clampPetWindowTargetPosition(input: PetWindowTargetPositionInput): PetWindowPosition {
  const primaryWorkArea = input.workAreas[0] ?? { x: 0, y: 0, width: 0, height: 0 };
  const maxX = primaryWorkArea.x + Math.max(0, primaryWorkArea.width - Math.max(0, input.width));
  const maxY = primaryWorkArea.y + Math.max(0, primaryWorkArea.height - Math.max(0, input.height));

  return {
    x: Math.round(clampNumber(input.targetX, primaryWorkArea.x, maxX)),
    y: Math.round(clampNumber(input.targetY, primaryWorkArea.y, maxY))
  };
}
function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
