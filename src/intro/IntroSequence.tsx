import { useCallback, useEffect, useRef, useState } from 'react';
import { CUE, IntroAudio } from './audio';
import { createTwinScene } from './twinCanvas';
import './intro.css';

/**
 * Opening sequence.
 *
 * Beats (seconds): press to initialize -> the part assembles as a split
 * digital/physical pair -> the halves snap into one -> "DIGITAL TWIN" ->
 * host credit -> wordmark -> dissolve into the app.
 *
 * Three things keep it from becoming an obstacle:
 *   - it is skippable (button, Esc, or Enter),
 *   - it plays once per browser session, so a reload during a demo goes
 *     straight to the app,
 *   - `prefers-reduced-motion` collapses it to a still frame with no audio.
 *
 * Change HOST_COLLEGE below to re-credit the sequence.
 */
const HOST_COLLEGE = {
  line1: 'Phaltan Education Society’s',
  line2: 'College of Engineering, Phaltan',
};

export const INTRO_SESSION_KEY = 'autotwin.intro.played';

/** Total runtime including the dissolve. */
const END = CUE.tail + 0.9;

type Phase = 'prompt' | 'running' | 'leaving';

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function IntroSequence({ onDone }: { onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<IntroAudio | null>(null);
  const rafRef = useRef(0);
  const doneRef = useRef(false);

  const [phase, setPhase] = useState<Phase>('prompt');
  const [t, setT] = useState(0);
  const reduced = useRef(prefersReducedMotion()).current;

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    cancelAnimationFrame(rafRef.current);
    audioRef.current?.stop();
    setPhase('leaving');
    // Let the dissolve play out before unmounting.
    window.setTimeout(onDone, 620);
  }, [onDone]);

  const begin = useCallback(() => {
    if (phase !== 'prompt') return;
    if (!reduced) {
      const audio = new IntroAudio();
      audio.start(0.5); // must happen inside the gesture
      audioRef.current = audio;
    }
    setPhase('running');
  }, [phase, reduced]);

  // Esc / Enter skip; Space or Enter also starts it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        finish();
        return;
      }
      if (phase === 'prompt' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        begin();
      } else if (phase === 'running' && e.key === 'Enter') {
        finish();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, begin, finish]);

  // The animation loop.
  useEffect(() => {
    if (phase !== 'running') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scene = createTwinScene(canvas, reduced);
    const onResize = () => scene.resize();
    window.addEventListener('resize', onResize);

    // Reduced motion: hold a still frame, then hand over without the full run.
    if (reduced) {
      scene.draw(CUE.wordmark);
      const id = window.setTimeout(finish, 2200);
      return () => {
        window.clearTimeout(id);
        window.removeEventListener('resize', onResize);
        scene.dispose();
      };
    }

    const started = performance.now();
    const tick = (now: number) => {
      const elapsed = (now - started) / 1000;
      scene.draw(elapsed);
      setT(elapsed);
      if (elapsed >= END) {
        finish();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', onResize);
      scene.dispose();
    };
  }, [phase, reduced, finish]);

  useEffect(() => () => audioRef.current?.stop(), []);

  const shown = (from: number, to: number) => (reduced ? true : t >= from && t < to);

  return (
    <div
      className={`intro ${phase === 'leaving' ? 'intro-leaving' : ''}`}
      role="dialog"
      aria-label="AutoTwin opening sequence"
    >
      <canvas
        ref={canvasRef}
        className={`intro-canvas ${phase === 'running' && (reduced || t > CUE.snap + 0.45) ? 'dim' : ''}`}
        aria-hidden="true"
      />
      <div className="intro-vignette" aria-hidden="true" />

      {phase === 'prompt' && (
        <button className="intro-start" onClick={begin} autoFocus>
          <span className="intro-ring" aria-hidden="true" />
          <span className="intro-start-label">Press to initialize</span>
          <span className="intro-start-sub">sound on</span>
        </button>
      )}

      {phase !== 'prompt' && (
        <>
          <div className="intro-stage" aria-live="polite">
            <div className={`intro-beat intro-title ${shown(CUE.snap, CUE.credit) ? 'on' : ''}`}>
              <span className="intro-kicker">Generative engineering</span>
              <h1>DIGITAL TWIN</h1>
              <span className="intro-rule" aria-hidden="true" />
            </div>

            <div className={`intro-beat intro-credit ${shown(CUE.credit, CUE.wordmark) ? 'on' : ''}`}>
              <span className="intro-kicker">Hosted by</span>
              <p className="intro-college-1">{HOST_COLLEGE.line1}</p>
              <p className="intro-college-2">{HOST_COLLEGE.line2}</p>
            </div>

            <div className={`intro-beat intro-mark ${shown(CUE.wordmark, END + 1) ? 'on' : ''}`}>
              <span className="intro-wordmark">
                AUTO<em>TWIN</em>
              </span>
              <span className="intro-tag">Virtual prototyping for automotive components</span>
            </div>
          </div>

          <button className="intro-skip" onClick={finish}>
            Skip <kbd>Esc</kbd>
          </button>

          <div className="intro-progress" aria-hidden="true">
            <i style={{ transform: `scaleX(${Math.min(1, t / END)})` }} />
          </div>
        </>
      )}
    </div>
  );
}
