# Launch video

Re-runnable pipeline that records the local web app and assembles the launch
videos. Output is untracked: `Paldora-launch.mp4` (1920x1080) and
`Paldora-launch-mobile.mp4` (1080x1920) in the repo root. `out/` here is
git-ignored (frames, cards, segments).

## Prerequisites

- The web app running at `http://127.0.0.1:3000` with the Firebase emulators and
  the rich demo data (`PALDORA_ENV=local`, so `/design-preview/rooms/<theme>`
  exists). This script never starts or resets anything.
- `me@example.test` signed in via the form (local demo credentials, see
  `scenes.mjs` / `record.mjs`). Only demo accounts appear on screen.
- `ffmpeg` on PATH, and the root `node_modules` (uses `@playwright/test`'s Chromium).

## Run

```bash
node tools/pitch-video/record.mjs desktop     # 1440x810 @ 4/3 -> 1920x1080 frames
node tools/pitch-video/record.mjs phone       # 390x844 @ 2.5, for the phone mock
node tools/pitch-video/record.mjs vertical    # 390x693 @ 3, for the vertical cut
node tools/pitch-video/render-cards.mjs       # title/end/principle cards, captions
node tools/pitch-video/assemble.mjs desktop   # -> Paldora-launch.mp4
node tools/pitch-video/assemble.mjs vertical  # -> Paldora-launch-mobile.mp4
```

`record.mjs <profile> <scene...>` re-records only the named scenes.

## Notes

- Frame-by-frame screenshots (30 fps) with a scripted cursor, so motion is
  deterministic. The cursor, click ripple and theme label are injected with
  `bypassCSP` (recording only; the app's CSP is untouched).
- Page navigations are clicked on camera but waited out of frame, so no loading
  skeleton is ever recorded.
- The composer scene really posts to the "Wren and Me" Box in the demo data;
  `record.mjs` deletes that post again afterwards (`record.mjs desktop cleanup`
  retries the cleanup alone). The sample photo is a generated 3000x2000 gradient.
- Light/Dark is shown by emulating the device colour scheme on the "System"
  setting; no setting is saved. Nothing is submitted in the Life Update scene.
- Captions and cards use the app's Fraunces and Geist and the Hearth & Brass
  tokens (`design/tokens/paldora.tokens.json`). The audio is a generated ambient
  pad (ffmpeg `aevalsrc`), no external assets.
- Edit the story, captions and timing in `story.mjs`; scene choreography is in `scenes.mjs`.
