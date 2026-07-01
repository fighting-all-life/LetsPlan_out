import type { ReactElement } from "react";
import type { PetMood } from "./petState.js";

export const PET_CHARACTERS = ["cat", "dog", "robot"] as const;

export type PetCharacter = (typeof PET_CHARACTERS)[number];

interface PetSpriteProps {
  character?: PetCharacter;
  mood: PetMood;
  title?: string;
}

const moodAccent: Record<PetMood, string> = {
  sleep: "#93c5fd",
  idle: "#5eead4",
  focused: "#38bdf8",
  excited: "#86efac",
  celebrate: "#facc15",
  warning: "#fb923c",
  escape: "#c4b5fd",
  dizzy: "#fda4af"
};

export function isPetCharacter(value: unknown): value is PetCharacter {
  return typeof value === "string" && (PET_CHARACTERS as readonly string[]).includes(value);
}

export function getDefaultPetCharacter(): PetCharacter {
  return "cat";
}

export function PetSprite({ character = getDefaultPetCharacter(), mood, title = "LetsPlan 桌面宠物" }: PetSpriteProps): ReactElement {
  const accent = moodAccent[mood];
  const bodyGradientId = "pet-body-gradient-" + character;
  const faceGradientId = "pet-face-gradient-" + character;

  return (
    <svg
      className={"pet-vector pet-vector-" + character + " pet-vector-" + mood}
      data-pet-character={character}
      data-pet-mood={mood}
      viewBox="0 0 180 180"
      role="img"
      aria-label={title}
      focusable="false"
    >
      <title>{title}</title>
      <defs>
        <radialGradient id={faceGradientId} cx="34%" cy="24%" r="78%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="58%" stopColor={character === "robot" ? "#dbeafe" : "#fff7ed"} />
          <stop offset="100%" stopColor={character === "robot" ? "#93c5fd" : "#fed7aa"} />
        </radialGradient>
        <linearGradient id={bodyGradientId} x1="28%" y1="10%" x2="78%" y2="96%">
          <stop offset="0%" stopColor={character === "cat" ? "#f8fafc" : character === "dog" ? "#fde68a" : "#bfdbfe"} />
          <stop offset="100%" stopColor={character === "cat" ? "#cbd5e1" : character === "dog" ? "#f59e0b" : "#60a5fa"} />
        </linearGradient>
      </defs>

      <ellipse className="pet-ground-shadow" cx="90" cy="156" rx="48" ry="11" />
      {renderBackgroundAccent(mood, accent)}
      {character === "cat" ? renderCat(mood, bodyGradientId, faceGradientId, accent) : null}
      {character === "dog" ? renderDog(mood, bodyGradientId, faceGradientId, accent) : null}
      {character === "robot" ? renderRobot(mood, bodyGradientId, faceGradientId, accent) : null}
      {renderMoodBadge(mood, accent)}
    </svg>
  );
}

function renderCat(mood: PetMood, bodyGradientId: string, faceGradientId: string, accent: string): ReactElement {
  return (
    <g className="pet-character pet-character-cat">
      <path className="pet-tail" d="M125 126 C158 118 151 82 126 93 C112 99 121 112 134 107" fill="none" stroke="#334155" strokeWidth="12" strokeLinecap="round" />
      <ellipse cx="89" cy="124" rx="40" ry="38" fill={"url(#" + bodyGradientId + ")"} stroke="#273142" strokeWidth="5" />
      <path d="M50 73 L34 34 L72 57 Z" fill={"url(#" + faceGradientId + ")"} stroke="#273142" strokeWidth="5" strokeLinejoin="round" />
      <path d="M130 73 L146 34 L108 57 Z" fill={"url(#" + faceGradientId + ")"} stroke="#273142" strokeWidth="5" strokeLinejoin="round" />
      <path d="M46 76 C46 45 69 28 90 28 C111 28 134 45 134 76 C134 104 115 122 90 122 C65 122 46 104 46 76 Z" fill={"url(#" + faceGradientId + ")"} stroke="#273142" strokeWidth="5" />
      <path d="M57 83 C42 77 34 78 24 83" className="pet-whisker" />
      <path d="M58 93 C43 96 35 101 27 109" className="pet-whisker" />
      <path d="M123 83 C138 77 146 78 156 83" className="pet-whisker" />
      <path d="M122 93 C137 96 145 101 153 109" className="pet-whisker" />
      {renderFace(mood, "cat", accent)}
      <ellipse className="pet-paw" cx="73" cy="154" rx="13" ry="8" />
      <ellipse className="pet-paw" cx="108" cy="154" rx="13" ry="8" />
    </g>
  );
}

function renderDog(mood: PetMood, bodyGradientId: string, faceGradientId: string, accent: string): ReactElement {
  return (
    <g className="pet-character pet-character-dog">
      <path className="pet-tail" d="M123 128 C150 111 143 88 127 91" fill="none" stroke="#92400e" strokeWidth="12" strokeLinecap="round" />
      <ellipse cx="90" cy="126" rx="43" ry="36" fill={"url(#" + bodyGradientId + ")"} stroke="#273142" strokeWidth="5" />
      <path d="M51 66 C29 55 26 90 43 113 C51 124 64 113 60 98 Z" fill="#92400e" stroke="#273142" strokeWidth="5" />
      <path d="M129 66 C151 55 154 90 137 113 C129 124 116 113 120 98 Z" fill="#92400e" stroke="#273142" strokeWidth="5" />
      <path d="M45 77 C45 48 67 31 90 31 C113 31 135 48 135 77 C135 105 115 123 90 123 C65 123 45 105 45 77 Z" fill={"url(#" + faceGradientId + ")"} stroke="#273142" strokeWidth="5" />
      <ellipse cx="90" cy="91" rx="22" ry="17" fill="#fff7ed" stroke="#273142" strokeWidth="4" />
      <ellipse cx="90" cy="84" rx="7" ry="5" fill="#111827" />
      {renderFace(mood, "dog", accent)}
      <ellipse className="pet-paw" cx="70" cy="154" rx="14" ry="8" />
      <ellipse className="pet-paw" cx="110" cy="154" rx="14" ry="8" />
    </g>
  );
}

function renderRobot(mood: PetMood, bodyGradientId: string, faceGradientId: string, accent: string): ReactElement {
  return (
    <g className="pet-character pet-character-robot">
      <path d="M90 31 L90 18" stroke="#273142" strokeWidth="5" strokeLinecap="round" />
      <circle className="pet-accent-pop" cx="90" cy="14" r="7" fill={accent} stroke="#273142" strokeWidth="4" />
      <rect x="45" y="43" width="90" height="76" rx="20" fill={"url(#" + faceGradientId + ")"} stroke="#273142" strokeWidth="5" />
      <rect x="58" y="104" width="64" height="56" rx="18" fill={"url(#" + bodyGradientId + ")"} stroke="#273142" strokeWidth="5" />
      <path className="pet-arm" d="M58 119 C38 114 35 137 51 142" fill="none" stroke="#273142" strokeWidth="9" strokeLinecap="round" />
      <path className="pet-arm" d="M122 119 C142 114 145 137 129 142" fill="none" stroke="#273142" strokeWidth="9" strokeLinecap="round" />
      <rect x="72" y="121" width="36" height="18" rx="9" fill="#e0f2fe" stroke="#273142" strokeWidth="4" />
      <circle cx="82" cy="130" r="4" fill={accent} />
      <circle cx="98" cy="130" r="4" fill="#22c55e" />
      {renderFace(mood, "robot", accent)}
      <ellipse className="pet-paw" cx="75" cy="162" rx="13" ry="7" />
      <ellipse className="pet-paw" cx="105" cy="162" rx="13" ry="7" />
    </g>
  );
}

function renderFace(mood: PetMood, character: PetCharacter, accent: string): ReactElement {
  const eyeY = character === "robot" ? 74 : 72;
  const mouthY = character === "dog" ? 101 : character === "robot" ? 94 : 91;
  const cheekY = character === "robot" ? 91 : 89;

  return (
    <g className="pet-face-details">
      {renderEyes(mood, eyeY, character)}
      <ellipse className="pet-cheek" cx="64" cy={cheekY} rx="8" ry="5" fill="#fb7185" opacity="0.42" />
      <ellipse className="pet-cheek" cx="116" cy={cheekY} rx="8" ry="5" fill="#fb7185" opacity="0.42" />
      {renderMouth(mood, mouthY, accent)}
    </g>
  );
}

function renderEyes(mood: PetMood, y: number, character: PetCharacter): ReactElement {
  if (mood === "sleep") {
    return (
      <g className="pet-eyes pet-eyes-sleep">
        <path d={"M69 " + y + " C74 " + (y + 5) + " 80 " + (y + 5) + " 85 " + y} />
        <path d={"M95 " + y + " C100 " + (y + 5) + " 106 " + (y + 5) + " 111 " + y} />
      </g>
    );
  }

  if (mood === "celebrate" || mood === "excited") {
    return (
      <g className="pet-eyes pet-eyes-happy">
        <path d={"M68 " + y + " C73 " + (y - 7) + " 82 " + (y - 7) + " 87 " + y} />
        <path d={"M93 " + y + " C98 " + (y - 7) + " 107 " + (y - 7) + " 112 " + y} />
      </g>
    );
  }

  if (mood === "escape") {
    return (
      <g className="pet-eyes pet-eyes-escape">
        <path d={"M69 " + (y - 5) + " L84 " + (y + 5) + " M84 " + (y - 5) + " L69 " + (y + 5)} />
        <path d={"M96 " + (y - 5) + " L111 " + (y + 5) + " M111 " + (y - 5) + " L96 " + (y + 5)} />
      </g>
    );
  }


  if (mood === "dizzy") {
    return (
      <g className="pet-eyes pet-eyes-dizzy">
        <path d={"M69 " + y + " C82 " + (y - 13) + " 91 " + (y + 4) + " 75 " + (y + 8) + " C64 " + (y + 11) + " 63 " + (y - 5) + " 77 " + (y - 2)} />
        <path d={"M97 " + y + " C110 " + (y - 13) + " 119 " + (y + 4) + " 103 " + (y + 8) + " C92 " + (y + 11) + " 91 " + (y - 5) + " 105 " + (y - 2)} />
      </g>
    );
  }

  return (
    <g className="pet-eyes pet-eyes-open">
      {mood === "focused" || mood === "warning" ? <path className="pet-brow" d={"M64 " + (y - 15) + " C72 " + (y - 19) + " 80 " + (y - 18) + " 87 " + (y - 13)} /> : null}
      {mood === "focused" || mood === "warning" ? <path className="pet-brow" d={"M93 " + (y - 13) + " C100 " + (y - 18) + " 108 " + (y - 19) + " 116 " + (y - 15)} /> : null}
      <ellipse cx="77" cy={y} rx={character === "robot" ? 8 : 6} ry={mood === "warning" ? 9 : 7} />
      <ellipse cx="103" cy={y} rx={character === "robot" ? 8 : 6} ry={mood === "warning" ? 9 : 7} />
      <circle cx="79" cy={y - 3} r="2" fill="#ffffff" />
      <circle cx="105" cy={y - 3} r="2" fill="#ffffff" />
    </g>
  );
}

function renderMouth(mood: PetMood, y: number, accent: string): ReactElement {
  if (mood === "warning") {
    return <ellipse className="pet-mouth-fill" cx="90" cy={y} rx="6" ry="8" fill={accent} stroke="#273142" strokeWidth="3" />;
  }

  if (mood === "focused") {
    return <path className="pet-mouth" d={"M80 " + y + " L100 " + y} />;
  }

  if (mood === "escape") {
    return <path className="pet-mouth" d={"M80 " + (y + 4) + " C87 " + (y - 2) + " 94 " + (y - 2) + " 101 " + (y + 4)} />;
  }

  if (mood === "dizzy") {
    return <path className="pet-mouth" d={"M78 " + y + " C84 " + (y - 5) + " 91 " + (y + 5) + " 98 " + y} />;
  }

  return <path className="pet-mouth" d={"M78 " + (y - 2) + " C84 " + (y + 8) + " 96 " + (y + 8) + " 102 " + (y - 2)} />;
}

function renderBackgroundAccent(mood: PetMood, accent: string): ReactElement | null {
  if (mood === "idle" || mood === "focused") {
    return <circle className="pet-halo" cx="90" cy="82" r="58" fill={accent} opacity="0.12" />;
  }

  if (mood === "dizzy") {
    return (
      <g className="pet-dizzy-stars" fill={accent} stroke="#273142" strokeWidth="2" opacity="0.86">
        <path d="M32 43 L37 53 L48 55 L40 63 L42 74 L32 69 L22 74 L24 63 L16 55 L27 53 Z" />
        <path d="M142 24 L146 32 L155 33 L149 39 L151 48 L142 44 L134 48 L136 39 L130 33 L138 32 Z" />
      </g>
    );
  }

  if (mood === "escape") {
    return (
      <g className="pet-motion-lines" stroke={accent} strokeWidth="5" strokeLinecap="round" opacity="0.7">
        <path className="pet-motion-line" d="M18 76 L38 76" />
        <path className="pet-motion-line" d="M14 101 L33 95" />
        <path className="pet-motion-line" d="M145 52 L160 45" />
      </g>
    );
  }

  return null;
}

function renderMoodBadge(mood: PetMood, accent: string): ReactElement | null {
  if (mood === "sleep") {
    return (
      <g className="pet-sleep-mark" fill={accent} stroke="#273142" strokeWidth="2">
        <path d="M128 31 L146 31 L128 49 L148 49" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M143 15 L158 15 L143 30 L160 30" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
      </g>
    );
  }

  if (mood === "celebrate") {
    return (
      <g className="pet-confetti pet-accent-pop">
        <circle cx="34" cy="36" r="5" fill="#ef4444" />
        <circle cx="149" cy="70" r="5" fill="#22c55e" />
        <path d="M139 30 L144 42 L156 43 L147 51 L150 63 L139 56 L128 63 L131 51 L122 43 L134 42 Z" fill={accent} stroke="#273142" strokeWidth="2" />
      </g>
    );
  }

  if (mood === "warning") {
    return (
      <g className="pet-alert-mark pet-accent-pop">
        <path d="M139 25 L162 66 L116 66 Z" fill={accent} stroke="#273142" strokeWidth="4" strokeLinejoin="round" />
        <path d="M139 39 L139 52" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" />
        <circle cx="139" cy="59" r="3" fill="#ffffff" />
      </g>
    );
  }

  return null;
}
