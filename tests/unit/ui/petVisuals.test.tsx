import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PET_CHARACTERS, PetSprite, getDefaultPetCharacter, isPetCharacter } from "../../../src/modules/ui/petVisuals.js";
import { PET_STATE_IDS } from "../../../src/modules/ui/petState.js";

describe("petVisuals", () => {
  it("generates code-rendered cartoon SVG characters without image assets", () => {
    expect(PET_CHARACTERS).toEqual(["cat", "dog", "robot"]);
    expect(getDefaultPetCharacter()).toBe("cat");

    for (const character of PET_CHARACTERS) {
      const html = renderToString(<PetSprite character={character} mood="celebrate" />);
      expect(html).toContain("<svg");
      expect(html).toContain("data-pet-character=\"" + character + "\"");
      expect(html).toContain("pet-face-details");
      expect(html).not.toContain("<img");
      expect(html).not.toContain(".png");
    }
  });

  it("renders all pet moods with mood-specific hooks", () => {
    for (const mood of PET_STATE_IDS) {
      const html = renderToString(<PetSprite character="cat" mood={mood} />);
      expect(html).toContain("data-pet-mood=\"" + mood + "\"");
    }

    expect(renderToString(<PetSprite character="cat" mood="warning" />)).toContain("pet-alert-mark");
    expect(renderToString(<PetSprite character="dog" mood="escape" />)).toContain("pet-motion-lines");
    expect(renderToString(<PetSprite character="robot" mood="sleep" />)).toContain("pet-sleep-mark");
    expect(renderToString(<PetSprite character="cat" mood="dizzy" />)).toContain("pet-eyes-dizzy");
  });

  it("validates supported pet characters", () => {
    expect(isPetCharacter("cat")).toBe(true);
    expect(isPetCharacter("dog")).toBe(true);
    expect(isPetCharacter("robot")).toBe(true);
    expect(isPetCharacter("fox")).toBe(false);
  });
});
