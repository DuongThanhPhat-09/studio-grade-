import { useEffect, useRef, type CSSProperties } from 'react'
import { brand, chapters, film, finishes, finishName, flavourWords, fmtTime, methodById, methods, recipe, type BeatId } from '../content/copy'
import { store, useStore } from '../state/store'
import { domBar, domText } from '../state/runtime'
import { scrollToBeat } from '../animation/scroller'
import { enterJourney } from '../journey/control'
import { Choice, Cta, Index, Lines, Specs, TextButton } from './kit'

/* ------------------------------------------------------------------ */
/* Chapter 1 — the film                                                 */
/* ------------------------------------------------------------------ */

export function Intro() {
  return (
    <div className="block">
      <p className="eyebrow">
        {brand.name} {brand.product} <span className="eyebrow-sep">/</span> {film.intro.eyebrow}
      </p>
      <Lines lines={film.intro.headline} className="headline headline-xl" delay={250} as="h1" />
      <p className="body">{film.intro.body}</p>
    </div>
  )
}

/** Macro captions: a numeral, a material, one line. Small, like a plate caption in a book. */
export function Macro({ id }: { id: BeatId }) {
  const m = film.macros[id]
  return (
    <div className="block block-caption">
      <p className="caption-n">
        <span>{m.n}</span>
        <span className="caption-rule" />
        <span>v</span>
      </p>
      <Lines lines={[m.title]} className="headline headline-caption" />
      <p className="body body-caption">{m.line}</p>
    </div>
  )
}

export function Form() {
  return (
    <div className="block">
      <Index num={chapters[0].index} label="Form" />
      <Lines lines={film.form.headline} />
      <p className="body">{film.form.body}</p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Chapter 2 — engineering                                              */
/* ------------------------------------------------------------------ */

export function Engineering() {
  return (
    <div className="block">
      <Index num={chapters[1].index} label={chapters[1].label} />
      <Lines lines={film.engineering.headline} />
      <p className="body">{film.engineering.body}</p>
      <div className="actions">
        <Cta onClick={() => store.set({ mode: 'inspect', part: null })}>{film.engineering.cta}</Cta>
        <p className="hint-inline only-fine">or select any part</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Chapter 3 — X-ray                                                    */
/* ------------------------------------------------------------------ */

export function Xray() {
  return (
    <div className="block">
      <Index num={chapters[2].index} label={chapters[2].label} />
      <Lines lines={film.xray.headline} />
      <p className="body">{film.xray.body}</p>
      <div className="readout">
        <Readout k="Turns" valueKey="x-turns" of="/ 40" />
        <Readout k="Ground" valueKey="x-grams" of="/ 18 g" />
        <Readout k="Speed" valueKey="x-rpm" of="rpm" />
        <span className="readout-track">
          <span className="readout-bar" ref={domBar('x-progress')} />
        </span>
        <p className="readout-hint">{film.xray.hint}</p>
      </div>
    </div>
  )
}

function Readout({ k, valueKey, of, initial = '0' }: { k: string; valueKey: string; of?: string; initial?: string }) {
  return (
    <div className="readout-cell">
      <span className="readout-k">{k}</span>
      <span className="readout-v">
        <span ref={domText(valueKey)}>{initial}</span>
        {of && <span className="readout-of">{of}</span>}
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Chapter 4 — grind simulator                                          */
/* ------------------------------------------------------------------ */

export function Grind() {
  const method = useStore((s) => s.method)
  const phase = useStore((s) => s.grind.phase)
  const dose = useStore((s) => s.grind.dose)
  const busy = phase === 'loading' || phase === 'grinding'

  const choose = (id: (typeof methods)[number]['id']) => {
    if (busy) return
    const m = methodById[id]
    store.set({ method: id, clicks: m.clicks, grind: { phase: 'idle', startedAt: 0, dose: m.dose } })
  }
  const start = () => store.set((s) => ({ grind: { phase: 'loading', startedAt: performance.now(), dose: s.grind.dose } }))

  return (
    <div className={`block block-sim phase-${phase}`}>
      <Index num={chapters[3].index} label={chapters[3].label} />
      <Lines lines={film.grind.headline} />
      <p className="body">{film.grind.body}</p>
      <div className="choices choices-methods" role="radiogroup" aria-label="Brew method">
        {methods.map((m) => (
          <Choice key={m.id} selected={method === m.id} onSelect={() => choose(m.id)}>
            {m.name}
          </Choice>
        ))}
        <span className={`choice-custom ${method === null ? 'is-on' : ''}`}>Custom</span>
      </div>
      <div className="readout readout-3">
        <Readout k="Dial" valueKey="g-clicks" of="clicks" initial="30" />
        <Readout k="Burr gap" valueKey="g-gap" of="mm" initial="0.60" />
        <Readout k="Grounds" valueKey="g-size" of="µm" initial="720" />
      </div>
      <div className="sim-run">
        {phase === 'idle' && (
          <div className="actions">
            <Cta onClick={start}>Start grinding</Cta>
            <p className="hint-inline">
              {dose} g · <span className="only-fine">or turn the dial by hand</span>
            </p>
          </div>
        )}
        {phase !== 'idle' && (
          <div className="sim-progress" aria-live="polite">
            <div className="readout readout-3">
              <Readout k="Turns" valueKey="g-turns" />
              <Readout k="Ground" valueKey="g-grams" of={`/ ${dose} g`} initial="0.0" />
              <Readout k="Time" valueKey="g-time" initial="0:00" />
            </div>
            <span className="readout-track">
              <span className="readout-bar" ref={domBar('g-progress')} />
            </span>
            <p className="readout-hint">
              {phase === 'loading' && 'Loading beans…'}
              {phase === 'grinding' && (
                <>
                  Time-lapse <span ref={domText('g-lapse')} />
                </>
              )}
              {phase === 'done' && (
                <>
                  Ready.{' '}
                  <TextButton onClick={() => store.set((s) => ({ grind: { ...s.grind, phase: 'idle' } }))}>Grind again</TextButton>
                </>
              )}
            </p>
          </div>
        )}
      </div>
      <p className="enter-grind">
        <TextButton onClick={enterJourney} className={busy ? 'is-quiet' : ''}>
          Enter the grind <span aria-hidden>→</span>
        </TextButton>
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Chapter 5 — build your Orme                                          */
/* ------------------------------------------------------------------ */

type Group = 'body' | 'burr' | 'knob'

export function Build() {
  const config = useStore((s) => s.config)
  const release = useRef(0)

  // Touch has no hover: a tap leans the camera in for a moment, then lets go.
  const focus = (g: Group | null, linger = false) => {
    clearTimeout(release.current)
    store.set({ configFocus: g })
    if (linger) release.current = window.setTimeout(() => store.set({ configFocus: null }), 2600)
  }
  useEffect(() => () => clearTimeout(release.current), [])

  const groups: { id: Group; label: string }[] = [
    { id: 'body', label: 'Body' },
    { id: 'burr', label: 'Burr' },
    { id: 'knob', label: 'Knob' },
  ]

  return (
    <div className="block block-build">
      <Index num={chapters[4].index} label={chapters[4].label} />
      <Lines lines={film.build.headline} />
      <div className="config" onPointerLeave={(e) => e.pointerType === 'mouse' && focus(null)}>
        {groups.map((g) => (
          <div className="config-row" key={g.id} onPointerEnter={(e) => e.pointerType === 'mouse' && focus(g.id)}>
            <span className="config-k">{g.label}</span>
            <div className="choices" role="radiogroup" aria-label={g.label}>
              {finishes[g.id].map((f) => (
                <Choice
                  key={f.id}
                  swatch={f.swatch}
                  selected={config[g.id] === f.id}
                  onSelect={() => {
                    store.set({ config: { ...config, [g.id]: f.id } })
                    focus(g.id, true)
                  }}
                >
                  {f.name}
                </Choice>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="actions">
        <Cta
          onClick={() => {
            store.set({ mode: 'hero', configFocus: null })
          }}
        >
          {film.build.cta}
        </Cta>
      </div>
    </div>
  )
}

export function configSummary(c: ReturnType<typeof store.get>['config']) {
  return [
    ['Body', finishName('body', c.body)],
    ['Burr', finishName('burr', c.burr)],
    ['Knob', finishName('knob', c.knob)],
  ] as [string, string][]
}

/* ------------------------------------------------------------------ */
/* Chapter 6 — Coffee Lab                                               */
/* ------------------------------------------------------------------ */

export function Lab() {
  const id = useStore((s) => s.labMethod)
  const dose = useStore((s) => s.labDose)
  const m = methodById[id]
  const r = recipe(m, dose)

  return (
    <div className="block block-lab">
      <Index num={chapters[5].index} label={chapters[5].label} />
      <Lines lines={film.lab.headline} />
      <div className="choices choices-methods" role="radiogroup" aria-label="Brew method">
        {methods.map((x) => (
          <Choice key={x.id} selected={id === x.id} onSelect={() => store.set({ labMethod: x.id, labDose: x.dose })}>
            {x.name}
          </Choice>
        ))}
      </div>

      <label className="dose">
        <span className="dose-k">Dose</span>
        <input
          type="range"
          min={m.doseRange[0]}
          max={m.doseRange[1]}
          step={1}
          value={dose}
          onChange={(e) => store.set({ labDose: Number(e.target.value) })}
          style={{ '--p': (dose - m.doseRange[0]) / (m.doseRange[1] - m.doseRange[0]) } as CSSProperties}
          aria-valuetext={`${dose} grams`}
        />
        <span className="dose-v">
          {dose}
          <span className="readout-of">g</span>
        </span>
      </label>

      <div className="recipe">
        <Specs
          rows={[
            ['Water', r.waterLabel],
            ['Grind', `${r.clicks} clicks · ~${r.microns} µm`],
            ['Temperature', `${r.temp} °C`],
            ['Brew time', fmtTime(r.time)],
          ]}
        />
        <Flavour f={r.flavour} />
      </div>
    </div>
  )
}

/**
 * Flavour, set like a tasting note: a word, a hairline scale, a single mark.
 * The mark glides on a spring-like curve when the recipe changes.
 */
function Flavour({ f }: { f: { sweetness: number; acidity: number; body: number } }) {
  const rows = [
    ['sweetness', 'Sweetness'],
    ['acidity', 'Acidity'],
    ['body', 'Body'],
  ] as const
  return (
    <div className="flavour" aria-label="Flavour profile">
      {rows.map(([k, label]) => {
        const v = f[k]
        const words = flavourWords[k]
        const word = words[Math.min(words.length - 1, Math.floor(v * words.length))]
        return (
          <div className="flavour-row" key={k}>
            <span className="flavour-k">{label}</span>
            <span className="flavour-scale" aria-hidden>
              {Array.from({ length: 11 }, (_, i) => (
                <span key={i} className="flavour-tick" />
              ))}
              <span className="flavour-mark" style={{ '--v': v } as CSSProperties} />
            </span>
            <span className="flavour-word" key={word}>
              {word}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Chapter 7 — finale                                                   */
/* ------------------------------------------------------------------ */

export function Final() {
  const config = useStore((s) => s.config)
  return (
    <>
      <div className="block block-name">
        <Lines lines={film.final.headline} className="headline headline-name" />
        <p className="final-line">{film.final.line}</p>
      </div>
      <div className="block block-buy">
        <p className="final-config">{configSummary(config).map(([, v]) => v).join(' · ')}</p>
        <p className="price">
          {brand.price}
          <span className="price-note">{brand.ships}</span>
        </p>
        <Cta onClick={() => scrollToBeat('build')}>{film.final.cta}</Cta>
      </div>
    </>
  )
}

