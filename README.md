# DAW — AI Music Studio

A mobile-first browser DAW for AI-composed songs and personal vocal recordings. Free static website, Web Audio and browser IndexedDB. No server, AI API key or paid service needed.

## Main features

- Import AI-generated song JSON (file or pasted text) using the exact schema described in [AI_FORMAT.md](./AI_FORMAT.md).
- Play original arrangements with Kick, Snare, Clap, Hat, Percussion, Synth Bass, 808 Bass, Synth Lead, Pad, Electric Piano, Plucked Guitar, Keys, Strings.
- Multi-track arrangement, independent clips and 1/16-note piano-roll editing; supports 4/4, 40–220 BPM and up to 128 bars.
- Mixer per track: volume, pan, mute, solo, reverb and delay.
- Record your own vocal by granting microphone permission. Backing tracks play during recording and vocals become their own audio track, stored locally in IndexedDB.
- Import an existing recording to an audio track via + Audio.
- Autosave and switch between multiple projects locally. A built-in original demo song is available.
- Responsive mobile UI, installable PWA and offline shell cache after first successful load.
- Audio/MIDI export is intentionally NOT implemented yet.

## Start making songs

1. Open https://ryuya-matsubara.github.io/daw/ (once GitHub Pages is enabled).
2. Tap Import AI, share AI_FORMAT.md with ChatGPT and ask it to write an original song as raw JSON.
3. Import the resulting file or paste JSON. The song appears as a new project.
4. Play, adjust instruments and track FX, click clips to edit notes or add new tracks.
5. Use headphones; position the song where recording should start and select Record vocal. Grant microphone permission. When finished, tap Stop recording.
6. The resulting Vocal track appears in the arrangement; play to listen to your voice over the composition.

## Publish with GitHub Pages

Settings -> Pages -> Build and deployment -> Deploy from a branch -> main / (root) -> Save.

This site needs HTTPS for microphone permissions. GitHub Pages provides HTTPS. The site code is public, so never put API keys or credentials in source files.

## Data retention

Projects, recorded voices and imported audio files are stored on THIS device in IndexedDB. They are not uploaded to GitHub and cannot be accessed from a different device. Browser storage eviction, deleting website data or using private browsing may erase them. There is no audio export or cloud backup yet, so do not rely on this version for irreplaceable recordings.

AI JSON stores MIDI-style composition data, not audio blobs. The app does not directly accept the older techno-sequencer-song v2 format; convert it to ai-daw v1 using the schema.

## Technical files

- index.html, style.css, app.js: interactive DAW
- data.js: AI JSON schema, normalization, local projects and audio assets
- audio.js: Web Audio synthesis, scheduling, mixing, audio clip playback
- sw.js, manifest.webmanifest, icon.svg: installable offline PWA
- AI_FORMAT.md: full JSON specification and example prompt

Current scope: original synthesized instruments, basic mixing/FX, fixed BPM and 4/4. No external instrument samples, pitch correction, audio stretching, server storage or audio export yet. Microphone latency varies by browser and device.
