#!/usr/bin/env node
// QC pass for the voiceover: transcribes each clip with ElevenLabs Scribe so a
// mispronounced word ("S&P", "ProntoFolio") shows up as a transcript mismatch,
// and writes src/words.json — each word's start frame — which scenes use to
// land their animation beats on the spoken words.
//
// Usage: ELEVENLABS_API_KEY=... node scripts/transcribe-voice.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FPS = 30;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error("Missing ELEVENLABS_API_KEY");
const { cues } = JSON.parse(fs.readFileSync(path.join(root, "scripts/cues.json"), "utf8"));

const out = {};
for (const cue of cues) {
  const form = new FormData();
  form.append("model_id", "scribe_v1");
  form.append("language_code", "spa");
  const bytes = fs.readFileSync(path.join(root, "public/audio", `${cue.id}.mp3`));
  form.append("file", new Blob([bytes], { type: "audio/mpeg" }), `${cue.id}.mp3`);
  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": key },
    body: form,
  });
  if (!res.ok) throw new Error(`${cue.id}: ${res.status} ${await res.text()}`);
  const json = await res.json();
  const words = json.words.filter((w) => w.type === "word");
  out[cue.id] = words.map((w) => ({ w: w.text, f: Math.round(w.start * FPS) }));
  console.log(`${cue.id}\n  script: ${cue.text}\n  heard:  ${json.text}`);
  console.log("  " + out[cue.id].map((w) => `${w.w}@${w.f}`).join(" "));
}
fs.writeFileSync(path.join(root, "src/words.json"), JSON.stringify(out, null, 1) + "\n");
