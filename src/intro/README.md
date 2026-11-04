# Intro sequence

A ~19 second opening animation for AutoTwin: the component assembles out of
scattered points as two halves - a green wireframe (the digital model) and a
shaded solid (the physical part) - which then snap together into one object.
That is the digital-twin idea stated literally, rather than a logo fade.

Beats: press to initialize → assembly + scanline → snap → **DIGITAL TWIN** →
host credit → **AUTOTWIN** wordmark → dissolve into the app.

Audio is synthesised at runtime with Web Audio oscillators. There are no
media files, so nothing to license and nothing to ship.

---

## Dropping it into another project

Copy the whole `src/intro/` folder. It depends on **React only** - no other
packages, no shared theme, no asset files. Every CSS custom property it
reads (`--ease-out`, `--mono`, `--font`) is written with a fallback, so it
renders correctly in a project that has never heard of AutoTwin's tokens.

Then three small changes in your app root:

```tsx
import { useCallback, useState } from 'react';
import { INTRO_SESSION_KEY, IntroSequence } from './intro/IntroSequence';

// 1. Decide whether to play. Once per browser session, so a reload
//    during a live demo drops straight into the app.
function shouldPlayIntro() {
  try {
    if (window.location.hash.includes('intro')) return true;      // forced replay
    return window.sessionStorage.getItem(INTRO_SESSION_KEY) !== '1';
  } catch {
    return true;                   // sessionStorage blocked (private mode)
  }
}

export default function App() {
  // 2. Hold the flag.
  const [intro, setIntro] = useState(shouldPlayIntro);
  const endIntro = useCallback(() => {
    try { window.sessionStorage.setItem(INTRO_SESSION_KEY, '1'); } catch { /* ignore */ }
    setIntro(false);
  }, []);

  // 3. Render it over everything. It is fixed-position at z-index 9999
  //    and removes itself, so the app underneath can mount normally.
  return (
    <>
      <YourApp />
      {intro && <IntroSequence onDone={endIntro} />}
    </>
  );
}
```

Mounting the app *underneath* rather than instead of the intro is
deliberate: the app gets its loading and first paint done during the
animation, so the hand-off is instant instead of landing on an empty screen.

---

## Things you will want to change

| What | Where |
|---|---|
| Host credit text | `HOST_COLLEGE` at the top of `IntroSequence.tsx` |
| Wordmark and tagline | the `.intro-mark` block in `IntroSequence.tsx` |
| Timing of every beat | `CUE` in `audio.ts` - the canvas and the score both read it |
| Accent colour | `GREEN` / `GREEN_HI` in `twinCanvas.ts`, and the hex values in `intro.css` |
| The part being assembled | `buildPoints()` in `twinCanvas.ts` (currently a 5-spoke wheel) |
| Volume | the argument to `audio.start()` in `IntroSequence.tsx`, default `0.5` |

`CUE` is the single source of truth for timing. The canvas timeline in
`twinCanvas.ts` mirrors it in its own `T` constant - **change both together
or the visuals and the score will drift apart.**

---

## Constraints worth knowing before you demo

**Audio cannot start on its own.** Every browser blocks it until a user
gesture, which is the entire reason the sequence opens on a "press to
initialize" button instead of playing immediately. `audio.start()` must stay
inside that click handler. If you remove the button, you lose the sound.

**It plays once per browser session.** Reloading goes straight to the app.
To replay: a new tab, a private window, or put `intro` anywhere in the URL
hash.

**`prefers-reduced-motion` collapses it** to a single still frame for about
2 seconds with no audio. That is intentional, but it means the animation
will not appear on a machine with "reduce motion" enabled in OS accessibility
settings - worth checking before a presentation.

**Skippable** with the on-screen button, `Esc`, or `Enter`.

---

## Performance note

The canvas is plain 2D with one `requestAnimationFrame` loop - no WebGL, no
scene graph, no asset load, so it cannot be the reason your first paint is
slow. It measured ~54 fps under software rendering (SwiftShader), which is
considerably harsher than real hardware.

If you add a background behind it, **do not put a large-radius `filter: blur()`
on a full-screen element.** Blur cost scales with area x radius and is
recomputed every frame; an earlier version of AutoTwin's backdrop did this
and starved the main thread badly enough that this sequence's own clock fell
~12 seconds behind wall time. Animate `transform` on a promoted layer
instead.

---

## Files

| File | Role |
|---|---|
| `IntroSequence.tsx` | Timeline, text beats, skip handling, session flag |
| `twinCanvas.ts` | The assembling-part animation (canvas 2D) |
| `audio.ts` | Procedural score (Web Audio), and `CUE`, the beat map |
| `intro.css` | Layout and type for the overlay |
