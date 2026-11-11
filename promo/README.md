# ProntoFolio promo video

A 45-second, 1920×1080 promo in Rioplatense Spanish. Every frame is drawn in code with
[Remotion](https://remotion.dev). The voice is ElevenLabs "Franco – Confident Publicity,
Argentina", and the background music comes from ElevenLabs Music.

Standalone npm project, not part of the pnpm workspace.

```bash
npm install
npm run studio      # preview / scrub in Remotion Studio
npm run render      # → out/prontofolio-promo.mp4, loudness-normalised to −14 LUFS
```

## Changing the script

1. Edit `scripts/cues.json`, which has one cue per scene.
2. Delete `public/audio/<id>.mp3` for every cue you changed, then run
   `ELEVENLABS_API_KEY=… npm run voice`. This regenerates the missing clips and rewrites
   `src/voice.json` with their lengths. Each scene's length follows its clip.
3. Run `ELEVENLABS_API_KEY=… npm run transcribe`. Read the "heard" line for each cue: a word
   the model mispronounced shows up there as a different word. The first take of "Doce
   estrategias" came back as "Dos", which is why the line now says "Una docena". This step also
   writes `src/words.json`, the word timings that `beat()` uses to put animation beats on spoken
   words. Re-timing therefore happens automatically.

## Layout

- `src/Promo.tsx` contains the timeline. Scene lengths come from the voice clips, then the music
  bed and the word-by-word captions are added.
- `src/scenes/*` holds one scene per cue.
- `src/ui.tsx` holds the shared pieces: stage, scene envelope, headline, card, chip, captions
  and the animated mark.
- `src/data.ts` builds all the numbers from one model, so they agree with each other. The
  frontier, the max-Sharpe point, volatility, drawdown and probability of loss all come from the
  same portfolio. The figures are illustrative, not real market data.
- `src/motion.ts` has the springs, a seeded RNG and `beat()`. Every value is a pure function of
  the frame.

Colours, fonts and the isotype are copied from `apps/web` (`globals.css`, `fonts/`,
`ProntofolioMark.tsx`).
