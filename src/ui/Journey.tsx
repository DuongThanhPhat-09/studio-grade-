import { useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { useRuntime } from '../state/hooks'
import { domBar } from '../state/runtime'
import { brand } from '../content/copy'
import { journey } from '../journey/state'
import { STILLS } from '../journey/timeline'
import { leaveJourney, registerVeil, replayJourney } from '../journey/control'
import { TextButton } from './kit'

/**
 * Inside the Grind — the only UI the film keeps:
 *  - "Skip film", top right, with a hairline that fills as the film runs
 *  - the title on the hero frame, then two quiet ways out
 *  - reduced motion: a one-line caption per still, and the crossfade between stills
 * Everything else on the page has stepped aside.
 */
export function Journey() {
  const on = useStore((s) => s.mode === 'journey')
  const phase = useRuntime(() => journey.phase)
  const still = useRuntime(() => journey.still)
  const stills = useRuntime(() => journey.stills)
  const hero = on && phase === 'hero'
  const [actions, setActions] = useState(false)

  useEffect(() => {
    document.documentElement.classList.toggle('in-journey', on)
  }, [on])

  // The ways out appear only once the title has landed.
  useEffect(() => {
    if (!hero) {
      setActions(false)
      return
    }
    const id = setTimeout(() => setActions(true), stills ? 600 : 2600)
    return () => clearTimeout(id)
  }, [hero, stills])

  // On the hero frame, any gesture that means "go on" continues the page.
  useEffect(() => {
    if (!actions) return
    const go = () => leaveJourney('continue')
    const onWheel = (e: WheelEvent) => e.deltaY > 8 && go()
    const onKey = (e: KeyboardEvent) => ['ArrowDown', 'PageDown', ' '].includes(e.key) && go()
    let y0 = 0
    const onTouchStart = (e: TouchEvent) => (y0 = e.touches[0].clientY)
    const onTouchMove = (e: TouchEvent) => y0 - e.touches[0].clientY > 40 && go()
    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('keydown', onKey)
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
    }
  }, [actions])

  // Reduced motion: the outgoing still, laid over the canvas, fades to reveal the next.
  const fade = useRef<HTMLImageElement>(null)
  useEffect(() => {
    journey.crossfade = (url) => {
      const img = fade.current
      if (!img) return
      img.classList.remove('is-fading')
      img.src = url
      void img.offsetWidth
      img.classList.add('is-fading')
    }
    return () => {
      journey.crossfade = null
    }
  }, [])

  const caption = stills ? STILLS[still]?.caption : ''

  return (
    <>
      <img ref={fade} className="journey-fade" alt="" aria-hidden />
      <div className="journey-veil" ref={registerVeil} aria-hidden />
      <section className={`journey ${on ? 'is-on' : ''} ${hero ? 'is-hero' : ''}`} aria-hidden={!on} aria-label="Inside the grind">
        <div className="journey-skip">
          <TextButton onClick={() => leaveJourney(hero ? 'continue' : 'skip')}>{hero ? 'Close film' : 'Skip film'}</TextButton>
          <span className="journey-track" aria-hidden>
            <span className="journey-bar" ref={domBar('j-progress')} />
          </span>
        </div>

        {stills && caption && (
          <p className="journey-caption" key={still} aria-live="polite">
            <span className="journey-caption-n">{String(still + 1).padStart(2, '0')}</span>
            {caption}
          </p>
        )}

        <div className="journey-title">
          <h2 className="journey-name">
            <span className="line">
              <span className="line-inner">
                {brand.name} {brand.product}
              </span>
            </span>
          </h2>
          <p className="journey-line">
            <span className="line">
              <span className="line-inner">Precision, all the way down.</span>
            </span>
          </p>
          <div className={`journey-actions ${actions ? 'is-on' : ''}`}>
            <TextButton onClick={() => leaveJourney('continue')}>
              Continue <span aria-hidden>↓</span>
            </TextButton>
            <TextButton onClick={replayJourney}>Watch again</TextButton>
          </div>
        </div>
      </section>
    </>
  )
}
