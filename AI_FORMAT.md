# AI DAW JSON Format (v1)

Give this specification to ChatGPT or another AI. Ask it to generate RAW VALID JSON ONLY, not Markdown or code fences. DAW imports it as a NEW project.

## Top-level format

Required:
- "format": "ai-daw"
- "version": 1
- "name": up to 60 characters
- "bpm": 40–220
- "bars": 1–128
- "tracks": array with at most 32 instrument tracks

The time signature is 4/4. Time values are in **quarter-note beats**, NOT seconds, bars, or 16th-note grid step numbers.

Supported instruments (exact strings):
kick, snare, clap, hat, perc, bass, 808, lead, pad, piano, guitar, keys, strings

Track object properties:
- "name": descriptive name
- "instrument": one of the above
- "volume": 0 to 1.5 (default 0.85)
- "pan": -1 left to 1 right (default 0)
- "reverb": 0 to 1 (default 0.12)
- "delay": 0 to 1 (default 0)
- "mute", "solo": booleans, usually false
- "clips": array of clips (maximum 128 per track)

Clip properties:
- "start": absolute number of BEATS from start of song. Bar 1 starts at beat 0, bar 9 at beat 32.
- "length": clip length in beats. Four bars = 16 beats.
- "notes": array of notes, max 8192 per clip

Note properties:
- "beat": relative note position in the clip, in quarter-note beats. 0 = clip beginning, 0.25 = next sixteenth note, 0.5 = next eighth.
- "duration": note length in beats. 0.25 = sixteenth, 0.5 = eighth, 1 = quarter, 2 = half, 4 = whole.
- "pitch": e.g. "C4" or "F#3", or integer MIDI pitch 0–127. For drums use "C2".
- "velocity": strength 0–1.

All note positions/durations must be inside their parent clip. Each clip must fit within the song. Total notes limit 50,000. Maximum import file size 2MB.

## Valid example

{
  "format": "ai-daw",
  "version": 1,
  "name": "House Basics",
  "bpm": 126,
  "bars": 16,
  "tracks": [
    {
      "name": "Kick",
      "instrument": "kick",
      "volume": 0.92,
      "clips": [{
        "start": 0, "length": 16,
        "notes": [
          {"beat":0,"duration":0.25,"pitch":"C2","velocity":1},
          {"beat":1,"duration":0.25,"pitch":"C2","velocity":1},
          {"beat":2,"duration":0.25,"pitch":"C2","velocity":1},
          {"beat":3,"duration":0.25,"pitch":"C2","velocity":1}
        ]
      }]
    },
    {
      "name": "Chord Pad",
      "instrument": "pad",
      "volume": 0.6,
      "reverb": 0.45,
      "clips": [{
        "start": 0, "length": 16,
        "notes": [
          {"beat":0,"duration":3.8,"pitch":"A3","velocity":0.65},
          {"beat":0,"duration":3.8,"pitch":"C4","velocity":0.65},
          {"beat":0,"duration":3.8,"pitch":"E4","velocity":0.65}
        ]
      }]
    }
  ]
}

This example contains only a few notes in the FIRST bar of a 16-bar song; it is a FORMAT example, not a complete composition.

The app does not automatically loop clip notes. Repeat explicit clips across sections, e.g. clip.start=0, 16, 32, 48, etc. Instrument tracks may optionally supply "notes" directly instead of "clips"; those notes span the song.

## Recommended AI prompt

Generate a complete, original, modern music composition as RAW JSON only, using the exact ai-daw version 1 format in this document. Write a 64-bar original track in 4/4 at 138 BPM. Make intro (bars 1–8), verse (9–24), build (25–32), chorus/drop (33–48), bridge (49–56), final chorus (57–64). Use kick, snare, hat, bass or 808, piano, pad, lead, strings where appropriate. Vary the instrumentation and rhythmic density from section to section; write a compelling melody, chord progression, bassline and clearly articulated one-bar rhythmic motifs. Use varied velocities. Keep clip note positions relative to clip.start in quarter-note BEATS, not steps. Do not include vocals or audio track data: I will record vocals in the DAW. Return exactly one parseable JSON object with no Markdown.

## Recording and limitations

Record a vocal using the app's Record vocal button, or import an audio file using + Audio.
Recorded audio and imported audio bytes are stored locally in the browser (IndexedDB). Audio files cannot be represented within AI JSON; exporting audio is not yet supported.

DAW uses light synthesizers, not actual sampled guitars or piano libraries. BPM is constant throughout the song. Recorded audio does not time-stretch if BPM changes. Recorded vocal timing may vary with browser device latency.
