export interface PetInteractionZoneInput {
  clientX: number;
  clientY: number;
  windowWidth: number;
  windowHeight: number;
}

const PET_INTERACTION_ZONE_WIDTH = 150;
const PET_INTERACTION_ZONE_HEIGHT = 148;
const PET_INTERACTION_ZONE_TOP = 30;

export function isPointerInsidePetInteractionZone(input: PetInteractionZoneInput): boolean {
  const zoneWidth = Math.min(PET_INTERACTION_ZONE_WIDTH, Math.max(0, input.windowWidth));
  const availableHeight = Math.max(0, input.windowHeight - PET_INTERACTION_ZONE_TOP);
  const zoneHeight = Math.min(PET_INTERACTION_ZONE_HEIGHT, availableHeight || input.windowHeight);
  const left = (input.windowWidth - zoneWidth) / 2;
  const top = Math.min(PET_INTERACTION_ZONE_TOP, Math.max(0, input.windowHeight - zoneHeight));
  const right = left + zoneWidth;
  const bottom = top + zoneHeight;

  return input.clientX >= left && input.clientX <= right && input.clientY >= top && input.clientY <= bottom;
}
