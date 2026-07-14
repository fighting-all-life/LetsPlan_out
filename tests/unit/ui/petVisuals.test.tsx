import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PET_CHARACTERS, PetSprite, getDefaultPetCharacter, getPetPose, isPetCharacter } from "../../../src/modules/ui/petVisuals.js";
import { PET_STATE_IDS } from "../../../src/modules/ui/petState.js";

describe("petVisuals", () => {
  it("renders exact Figures action poses inside the SVG motion rig", () => {
    const expected = {
      cat: { idle: "cat-idle.png", travel: "cat-walk.png", rest: "cat-sleep.png", source: "Figures/猫.png" },
      dog: { idle: "dog-idle.png", travel: "dog-walk.png", rest: "dog-sleep.png", source: "Figures/狗.png" },
      robot: { idle: "robot-idle.png", travel: "robot-move.png", rest: "robot-charge.png", source: "Figures/机器人.png" }
    } as const;

    expect(PET_CHARACTERS).toEqual(["cat", "dog", "robot"]);
    expect(getDefaultPetCharacter()).toBe("cat");

    for (const character of PET_CHARACTERS) {
      const idle = renderToString(<PetSprite character={character} mood="idle" />);
      const travel = renderToString(<PetSprite character={character} mood="escape" />);
      const rest = renderToString(<PetSprite character={character} mood="sleep" />);

      expect(idle).toContain("data-pet-art-direction=\"figures-action-motion-v1\"");
      expect(idle).toContain("data-pet-source=\"" + expected[character].source + "\"");
      expect(idle).toContain("data-pet-pose=\"idle\"");
      expect(idle).toContain(expected[character].idle);
      expect(travel).toContain("data-pet-pose=\"travel\"");
      expect(travel).toContain(expected[character].travel);
      expect(travel.match(/<image/g)).toHaveLength(2);
      expect(rest).toContain("data-pet-pose=\"rest\"");
      expect(rest).toContain(expected[character].rest);
      expect(rest).not.toContain("<img");
    }
  });

  it("maps moods to the action-sheet pose families", () => {
    for (const character of PET_CHARACTERS) {
      expect(getPetPose(character, "idle")).toBe("idle");
      expect(getPetPose(character, "focused")).toBe("idle");
      expect(getPetPose(character, "warning")).toBe("idle");
      expect(getPetPose(character, "escape")).toBe("travel");
      expect(getPetPose(character, "sleep")).toBe("rest");
    }
  });

  it("renders all moods with motion and state-specific SVG hooks", () => {
    for (const mood of PET_STATE_IDS) {
      const html = renderToString(<PetSprite character="cat" mood={mood} />);
      expect(html).toContain("data-pet-mood=\"" + mood + "\"");
      expect(html).toContain("pet-reference-sprite-primary");
    }

    expect(renderToString(<PetSprite character="cat" mood="warning" />)).toContain("pet-alert-mark");
    expect(renderToString(<PetSprite character="dog" mood="escape" />)).toContain("pet-travel-dust");
    expect(renderToString(<PetSprite character="robot" mood="sleep" />)).toContain("pet-charge-rings");
    expect(renderToString(<PetSprite character="cat" mood="dizzy" />)).toContain("pet-dizzy-stars");
  });

  it("validates supported pet characters", () => {
    expect(isPetCharacter("cat")).toBe(true);
    expect(isPetCharacter("dog")).toBe(true);
    expect(isPetCharacter("robot")).toBe(true);
    expect(isPetCharacter("fox")).toBe(false);
  });
});
