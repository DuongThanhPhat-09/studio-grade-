import { brand, parts } from '../content/copy'
import { store, useStore } from '../state/store'
import { scrollToBeat } from '../animation/scroller'
import { Cta, Lines, Specs, TextButton } from './kit'
import { configSummary } from './beats'

/**
 * Inspect: the exploded grinder becomes an object you can handle. Parts are
 * listed like an index in a book; choosing one dims the rest, brings a light
 * to it and moves the lens. The film waits underneath.
 */
export function Inspect() {
  const mode = useStore((s) => s.mode)
  const part = useStore((s) => s.part)
  const hover = useStore((s) => s.hover)
  const on = mode === 'inspect'
  const info = parts.find((p) => p.id === part)
  const close = () => store.set({ mode: 'film', part: null, hover: null })

  return (
    <section className={`mode mode-inspect ${on ? 'is-on' : ''}`} aria-hidden={!on} aria-label="Inspect the engineering">
      <div className="mode-top">
        <TextButton onClick={close} className="mode-close">
          <span aria-hidden>←</span> Back to the film
        </TextButton>
        <p className="mode-hint only-fine">Drag to orbit · Esc to step back</p>
      </div>

      <div className="inspect-info" key={part ?? 'all'}>
        <p className="eyebrow">{info ? `Part ${String(parts.indexOf(info) + 1).padStart(2, '0')} of 08` : 'Exploded view'}</p>
        <Lines lines={[info ? info.name : 'Eight parts.']} className="headline headline-inspect" />
        <p className="body">{info ? info.text : 'Select a part to bring it into the light. Nothing here is decorative; each one has a job.'}</p>
        {info && <Specs rows={info.specs} />}
        {info && (
          <TextButton onClick={() => store.set({ part: null })} className="inspect-back">
            <span aria-hidden>←</span> All parts
          </TextButton>
        )}
      </div>

      <nav className="inspect-index" aria-label="Parts">
        {parts.map((p, i) => (
          <button
            key={p.id}
            type="button"
            className={`inspect-item ${part === p.id ? 'is-selected' : ''} ${hover === p.id ? 'is-hover' : ''}`}
            aria-pressed={part === p.id}
            onClick={() => store.set({ part: part === p.id ? null : p.id })}
            onPointerEnter={(e) => e.pointerType === 'mouse' && store.set({ hover: p.id })}
            onPointerLeave={(e) => e.pointerType === 'mouse' && store.set({ hover: null })}
          >
            <span className="inspect-num">{String(i + 1).padStart(2, '0')}</span>
            <span className="inspect-name">{p.name}</span>
          </button>
        ))}
      </nav>
    </section>
  )
}

/** Your Orme: the configured grinder on a slow turntable, named and summarised. */
export function Hero() {
  const mode = useStore((s) => s.mode)
  const config = useStore((s) => s.config)
  const on = mode === 'hero'
  return (
    <section className={`mode mode-hero ${on ? 'is-on' : ''}`} aria-hidden={!on} aria-label="Your Orme">
      <div className="hero-copy">
        <p className="eyebrow">
          {brand.name} {brand.product}
        </p>
        <Lines lines={['Your Orme']} className="headline headline-hero" />
        <Specs rows={configSummary(config)} className="hero-specs" />
        <p className="price">
          {brand.price}
          <span className="price-note">{brand.ships}</span>
        </p>
        <div className="hero-actions">
          <Cta
            onClick={() => {
              store.set({ mode: 'film' })
              requestAnimationFrame(() => scrollToBeat('lab'))
            }}
          >
            Continue to the Coffee Lab
          </Cta>
          <TextButton onClick={() => store.set({ mode: 'film' })}>Change finish</TextButton>
        </div>
      </div>
    </section>
  )
}
