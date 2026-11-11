import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import words from "./words.json";

// Every value here is a pure function of the frame, so any frame renders on its
// own with no dependence on the frames before it.

/** Frames between a scene's start and its voice clip's start. */
export const VOICE_OFFSET = 8;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const lerp = (frame: number, input: [number, number], output: [number, number]) =>
  interpolate(frame, input, output, clamp);

type SpringKind = "soft" | "snappy" | "bouncy";

const SPRINGS = {
  soft: { damping: 200 }, // glides with no overshoot
  snappy: { damping: 22, stiffness: 220, mass: 0.6 }, // UI snaps
  bouncy: { damping: 11, stiffness: 160, mass: 0.7 }, // pops that overshoot
} satisfies Record<SpringKind, object>;

/** 0→1 spring that starts at `delay`. */
export const springAt = (frame: number, fps: number, delay: number, kind: SpringKind = "soft") =>
  spring({ frame: frame - delay, fps, config: SPRINGS[kind] });

export const useSpring = (delay: number, kind: SpringKind = "soft") => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return springAt(frame, fps, delay, kind);
};

/** Seeded PRNG: the "random" scatter is identical on every render. */
export const rng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

type SceneId = keyof typeof words;

/**
 * Scene-local frame at which the voice starts saying the word that begins with
 * `prefix` (the n-th match). Measured by scripts/transcribe-voice.mjs, so a
 * re-recorded voice re-times its animation beats automatically.
 */
export const beat = (scene: SceneId, prefix: string, nth = 0) => {
  const matches = words[scene].filter((w) => w.w.toLowerCase().startsWith(prefix.toLowerCase()));
  const hit = matches[nth];
  if (!hit) throw new Error(`No word "${prefix}" in ${scene}`);
  return hit.f + VOICE_OFFSET;
};

/** Argentine number format: decimal comma. */
export const pct = (value: number, digits = 1) =>
  `${value.toFixed(digits).replace(".", ",")}%`;
