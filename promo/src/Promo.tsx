import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile } from "remotion";
import cues from "../scripts/cues.json";
import voice from "./voice.json";
import words from "./words.json";
import { VOICE_OFFSET } from "./motion";
import { Benchmark } from "./scenes/Benchmark";
import { Delivery } from "./scenes/Delivery";
import { Frontier } from "./scenes/Frontier";
import { Hook } from "./scenes/Hook";
import { Outro } from "./scenes/Outro";
import { Risk } from "./scenes/Risk";
import { Strategies } from "./scenes/Strategies";
import { Caption, SceneFrame, Stage } from "./ui";

type SceneId = keyof typeof words;

/** Frames of air after each voice clip before the next scene cuts in. */
const TAIL: Record<SceneId, number> = {
  hook: 17,
  frontier: 14,
  strategies: 13,
  risk: 12,
  benchmark: 15,
  delivery: 14,
  outro: 33,
};

export type PromoProps = { captions: boolean; cta: string };

const sceneFor = (id: SceneId, duration: number, cta: string) => {
  switch (id) {
    case "hook":
      return <Hook duration={duration} />;
    case "frontier":
      return <Frontier />;
    case "strategies":
      return <Strategies />;
    case "risk":
      return <Risk />;
    case "benchmark":
      return <Benchmark />;
    case "delivery":
      return <Delivery />;
    case "outro":
      return <Outro cta={cta} />;
  }
};

/** Scene starts and lengths, derived from the measured voice clips. */
export const TIMELINE = (() => {
  let from = 0;
  return voice.map((clip) => {
    const duration = VOICE_OFFSET + clip.frames + TAIL[clip.id as SceneId];
    const entry = { id: clip.id as SceneId, file: clip.file, frames: clip.frames, from, duration };
    from += duration;
    return entry;
  });
})();
export const TOTAL_FRAMES = TIMELINE.reduce((sum, s) => sum + s.duration, 0);

export const Promo: React.FC<PromoProps> = ({ captions, cta }) => (
  <AbsoluteFill>
    <Stage />
    <Audio
      src={staticFile("audio/music.mp3")}
      volume={(f) =>
        interpolate(f, [0, 20, TOTAL_FRAMES - 60, TOTAL_FRAMES], [0, 0.22, 0.22, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      }
    />
    {TIMELINE.map((scene) => {
      const text = cues.cues.find((c) => c.id === scene.id)!.text;
      const starts = words[scene.id].map((w) => w.f + VOICE_OFFSET);
      return (
        <Sequence key={scene.id} from={scene.from} durationInFrames={scene.duration} name={scene.id}>
          <SceneFrame duration={scene.duration}>{sceneFor(scene.id, scene.duration, cta)}</SceneFrame>
          <Sequence from={VOICE_OFFSET}>
            <Audio src={staticFile(scene.file)} />
          </Sequence>
          {captions && scene.id !== "outro" && <Caption text={text} starts={starts} end={VOICE_OFFSET + scene.frames} />}
        </Sequence>
      );
    })}
  </AbsoluteFill>
);
