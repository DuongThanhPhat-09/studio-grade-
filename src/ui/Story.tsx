import { useEffect, useRef, useState, type ReactNode } from 'react'
import { beats, type BeatId } from '../content/copy'
import { runtime } from '../state/runtime'
import { useRuntime } from '../state/hooks'
import { useStore } from '../state/store'
import { Build, Engineering, Final, Form, Grind, Intro, Lab, Macro, Xray } from './beats'
import { CALLOUT_SETS } from './callouts'

type BeatState = 'in' | 'past' | 'future'

const CONTENT: Record<BeatId, () => ReactNode> = {
  intro: () => <Intro />,
  mAlu: () => <Macro id="mAlu" />,
  mKnurl: () => <Macro id="mKnurl" />,
  mCrank: () => <Macro id="mCrank" />,
  mWalnut: () => <Macro id="mWalnut" />,
  mBurr: () => <Macro id="mBurr" />,
  form: () => <Form />,
  engineering: () => <Engineering />,
  xray: () => <Xray />,
  grind: () => <Grind />,
  build: () => <Build />,
  lab: () => <Lab />,
  final: () => <Final />,
}

/**
 * The copy layer. Fixed over the canvas; only the active beat is shown, so the
 * page reads as one continuous shot with titles rather than a stack of sections.
 * Copy arrives from the direction of travel. While a mode is open the film's
 * copy steps aside entirely.
 */
export function Story() {
  const active = useRuntime(() => runtime.activeSection)
  const isReady = useRuntime(() => runtime.ready)
  const mode = useStore((s) => s.mode)
  // Words wait for the light: the studio comes up first, then the headline.
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!isReady) return
    const t = setTimeout(() => setReady(true), runtime.reducedMotion ? 0 : 2900)
    return () => clearTimeout(t)
  }, [isReady])
  const last = useRef(0)
  if (active >= 0) last.current = active

  const stateOf = (i: number): BeatState => {
    if (ready && mode === 'film' && i === active) return 'in'
    if (i < last.current) return 'past'
    if (i > last.current) return 'future'
    return runtime.scroll > i ? 'past' : 'future'
  }

  return (
    <div className="story">
      {beats.map((b, i) => {
        const state = stateOf(i)
        return (
          <section key={b.id} className={`beat beat-${b.id} ${/^m[A-Z]/.test(b.id) ? 'beat-macro' : ''} is-${state}`} aria-hidden={state !== 'in'} inert={state !== 'in'}>
            {CONTENT[b.id]()}
          </section>
        )
      })}
    </div>
  )
}

/** Callouts for every chapter that labels the model. Positioned per frame by the CalloutProjector. */
export function Callouts() {
  return (
    <div className="callouts" aria-hidden>
      {CALLOUT_SETS.flatMap((set) =>
        set.items.map((c) => {
          const key = `${set.id}:${c.anchor}`
          return (
            <div
              key={key}
              className={`callout callout-${set.id}`}
              ref={(el) => {
                if (el) runtime.dom.callouts.set(key, el)
                else runtime.dom.callouts.delete(key)
              }}
            >
              <span className="callout-dot" />
              <span className="callout-line" />
              <span className="callout-label">
                {c.index && <span className="callout-index">{c.index}</span>}
                <span className="callout-name">{c.name}</span>
                {c.live ? (
                  <span
                    className="callout-detail"
                    ref={(el) => {
                      if (el) runtime.dom.text.set(c.live!, el)
                    }}
                  />
                ) : (
                  <span className="callout-detail">{c.detail}</span>
                )}
              </span>
            </div>
          )
        }),
      )}
    </div>
  )
}
