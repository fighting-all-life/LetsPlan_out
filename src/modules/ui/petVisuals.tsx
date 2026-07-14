import { useId, type ReactElement } from "react";
import catIdleUrl from "./assets/pets/actions/cat-idle.png";
import catSleepUrl from "./assets/pets/actions/cat-sleep.png";
import catWalkUrl from "./assets/pets/actions/cat-walk.png";
import dogIdleUrl from "./assets/pets/actions/dog-idle.png";
import dogSleepUrl from "./assets/pets/actions/dog-sleep.png";
import dogWalkUrl from "./assets/pets/actions/dog-walk.png";
import robotChargeUrl from "./assets/pets/actions/robot-charge.png";
import robotIdleUrl from "./assets/pets/actions/robot-idle.png";
import robotMoveUrl from "./assets/pets/actions/robot-move.png";
import type { PetMood } from "./petState.js";

export const PET_CHARACTERS = ["cat", "dog", "robot"] as const;

export type PetCharacter = (typeof PET_CHARACTERS)[number];
export type PetPose = "idle" | "travel" | "rest";

interface PetSpriteProps {
  character?: PetCharacter;
  mood: PetMood;
  title?: string;
}

interface SpriteFrame {
  href: string;
  width: number;
  height: number;
}

interface SpriteRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CharacterMotionSet {
  source: string;
  labels: Record<PetPose, string>;
  idle: SpriteFrame;
  travel: SpriteFrame;
  rest: SpriteFrame;
}

const moodAccent: Record<PetMood, string> = {
  sleep: "#8EC5E8",
  idle: "#63B7A7",
  focused: "#3CC6FF",
  excited: "#9CCB8A",
  celebrate: "#F6C34A",
  warning: "#F08A5D",
  escape: "#8DA2E3",
  dizzy: "#EF8FA6"
};

const motionSets: Record<PetCharacter, CharacterMotionSet> = {
  cat: {
    source: "Figures/猫.png",
    labels: { idle: "待机", travel: "行走", rest: "蜷睡" },
    idle: { href: catIdleUrl, width: 196, height: 248 },
    travel: { href: catWalkUrl, width: 283, height: 241 },
    rest: { href: catSleepUrl, width: 278, height: 206 }
  },
  dog: {
    source: "Figures/狗.png",
    labels: { idle: "待机", travel: "行走", rest: "睡眠" },
    idle: { href: dogIdleUrl, width: 204, height: 219 },
    travel: { href: dogWalkUrl, width: 247, height: 223 },
    rest: { href: dogSleepUrl, width: 272, height: 186 }
  },
  robot: {
    source: "Figures/机器人.png",
    labels: { idle: "待机", travel: "移动", rest: "充电 / 睡眠" },
    idle: { href: robotIdleUrl, width: 179, height: 236 },
    travel: { href: robotMoveUrl, width: 244, height: 222 },
    rest: { href: robotChargeUrl, width: 312, height: 222 }
  }
};

export function isPetCharacter(value: unknown): value is PetCharacter {
  return typeof value === "string" && (PET_CHARACTERS as readonly string[]).includes(value);
}

export function getDefaultPetCharacter(): PetCharacter {
  return "cat";
}

export function getPetPose(_character: PetCharacter, mood: PetMood): PetPose {
  if (mood === "sleep") {
    return "rest";
  }
  if (mood === "escape") {
    return "travel";
  }
  return "idle";
}

export function PetSprite({ character = getDefaultPetCharacter(), mood, title = "LetsPlan 桌面宠物" }: PetSpriteProps): ReactElement {
  const accent = moodAccent[mood];
  const motionSet = motionSets[character];
  const pose = getPetPose(character, mood);
  const primaryFrame = motionSet[pose];
  const secondaryFrame = motionSet.idle;
  const primaryRect = fitFrame(primaryFrame);
  const secondaryRect = fitFrame(secondaryFrame);
  const glowId = useId().replace(/:/g, "") + "-pet-glow";

  return (
    <svg
      className={"pet-vector pet-vector-" + character + " pet-vector-" + mood}
      data-pet-character={character}
      data-pet-mood={mood}
      data-pet-pose={pose}
      data-pet-action-label={motionSet.labels[pose]}
      data-pet-art-direction="figures-action-motion-v1"
      data-pet-source={motionSet.source}
      viewBox="0 0 200 200"
      role="img"
      aria-label={title + " · " + motionSet.labels[pose]}
      focusable="false"
    >
      <title>{title + " · " + motionSet.labels[pose]}</title>
      <defs>
        <radialGradient id={glowId}>
          <stop offset="0%" stopColor={accent} stopOpacity="0.34" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse className="pet-ground-shadow" cx="100" cy="184" rx={pose === "rest" ? 55 : 47} ry="7" />
      {renderBackgroundAccent(mood, accent, glowId)}
      {renderPoseEffect(character, pose, accent)}
      <g className={"pet-figure pet-figure-" + character + " pet-pose-" + pose}>
        <image
          className="pet-reference-sprite pet-reference-sprite-primary"
          href={primaryFrame.href}
          {...primaryRect}
          preserveAspectRatio="xMidYMid meet"
        />
        {pose === "travel" ? (
          <image
            className="pet-reference-sprite pet-reference-sprite-secondary"
            href={secondaryFrame.href}
            {...secondaryRect}
            preserveAspectRatio="xMidYMid meet"
          />
        ) : null}
      </g>
      {renderMoodBadge(mood, accent)}
    </svg>
  );
}

function fitFrame(frame: SpriteFrame): SpriteRect {
  const scale = Math.min(176 / frame.width, 168 / frame.height);
  const width = Number((frame.width * scale).toFixed(2));
  const height = Number((frame.height * scale).toFixed(2));
  return {
    x: Number(((200 - width) / 2).toFixed(2)),
    y: Number((183 - height).toFixed(2)),
    width,
    height
  };
}

function renderPoseEffect(character: PetCharacter, pose: PetPose, accent: string): ReactElement | null {
  if (pose === "travel") {
    return (
      <g className="pet-travel-dust" fill={accent}>
        <circle cx="39" cy="164" r="4" />
        <circle cx="25" cy="171" r="3" opacity="0.68" />
        <circle cx="17" cy="158" r="2" opacity="0.42" />
      </g>
    );
  }
  if (character === "robot" && pose === "rest") {
    return (
      <g className="pet-charge-rings" fill="none" stroke={accent}>
        <ellipse cx="100" cy="177" rx="48" ry="10" />
        <ellipse cx="100" cy="177" rx="33" ry="6" opacity="0.66" />
      </g>
    );
  }
  return null;
}

function renderBackgroundAccent(mood: PetMood, accent: string, glowId: string): ReactElement | null {
  if (mood === "idle" || mood === "focused") {
    return <circle className="pet-halo" cx="100" cy="94" r="72" fill={"url(#" + glowId + ")"} />;
  }
  if (mood === "dizzy") {
    return (
      <g className="pet-dizzy-stars" fill={accent} stroke="#4E4A49" strokeWidth="2">
        <path d="M28 46 L33 56 L44 58 L36 66 L38 77 L28 72 L18 77 L20 66 L12 58 L23 56 Z" />
        <path d="M157 28 L161 36 L170 37 L164 43 L166 52 L157 48 L149 52 L151 43 L145 37 L153 36 Z" />
      </g>
    );
  }
  if (mood === "escape") {
    return (
      <g className="pet-motion-lines" stroke={accent} strokeWidth="5" strokeLinecap="round">
        <path className="pet-motion-line" d="M14 82 L38 82" />
        <path className="pet-motion-line" d="M10 109 L33 102" />
        <path className="pet-motion-line" d="M158 56 L178 47" />
      </g>
    );
  }
  return null;
}

function renderMoodBadge(mood: PetMood, accent: string): ReactElement | null {
  if (mood === "sleep") {
    return (
      <g className="pet-sleep-mark" fill="none" stroke={accent} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M143 31 L161 31 L143 49 L163 49" />
        <path d="M159 14 L174 14 L159 29 L176 29" opacity="0.72" />
      </g>
    );
  }
  if (mood === "celebrate") {
    return (
      <g className="pet-confetti pet-accent-pop">
        <circle cx="35" cy="37" r="5" fill="#EF8FA6" />
        <circle cx="166" cy="76" r="5" fill="#9CCB8A" />
        <path d="M151 29 L156 41 L169 42 L159 50 L162 63 L151 56 L140 63 L143 50 L133 42 L146 41 Z" fill={accent} stroke="#4E4A49" strokeWidth="2" />
      </g>
    );
  }
  if (mood === "warning") {
    return (
      <g className="pet-alert-mark pet-accent-pop">
        <path d="M154 25 L177 68 L131 68 Z" fill={accent} stroke="#4E4A49" strokeWidth="4" strokeLinejoin="round" />
        <path d="M154 40 L154 54" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" />
        <circle cx="154" cy="61" r="3" fill="#ffffff" />
      </g>
    );
  }
  return null;
}
