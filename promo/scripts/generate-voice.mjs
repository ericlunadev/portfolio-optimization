#!/usr/bin/env node
// Generates one ElevenLabs MP3 per cue in cues.json and writes
// src/voice.json with each clip's measured duration (in frames at 30 fps),
// which the composition uses to time every scene around the spoken audio.
//
// Usage: ELEVENLABS_API_KEY=... node scripts/generate-voice.mjs [--force]

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const FPS = 30;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error("Missing ELEVENLABS_API_KEY");
const force = process.argv.includes("--force");

const config = JSON.parse(fs.readFileSync(path.join(root, "scripts/cues.json"), "utf8"));
const outDir = path.join(root, "public/audio");
fs.mkdirSync(outDir, { recursive: true });

const measured = [];
for (const [index, cue] of config.cues.entries()) {
  const file = path.join(outDir, `${cue.id}.mp3`);
  if (force || !fs.existsSync(file)) {
    const previous = config.cues[index - 1]?.text;
    const next = config.cues[index + 1]?.text;
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${config.voice_id}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          text: cue.text,
          model_id: config.model_id,
          // Neighbouring lines keep intonation continuous across separate clips.
          previous_text: previous,
          next_text: next,
          voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true },
        }),
      },
    );
    if (!res.ok) throw new Error(`${cue.id}: ${res.status} ${await res.text()}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    console.log(`generated ${cue.id}`);
  }
  const probe = spawnSync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file,
  ]);
  const seconds = parseFloat(probe.stdout.toString().trim());
  measured.push({ id: cue.id, text: cue.text, file: `audio/${cue.id}.mp3`, frames: Math.ceil(seconds * FPS) });
}

fs.writeFileSync(path.join(root, "src/voice.json"), JSON.stringify(measured, null, 2) + "\n");
console.table(measured.map(({ id, frames }) => ({ id, frames, seconds: (frames / FPS).toFixed(2) })));
