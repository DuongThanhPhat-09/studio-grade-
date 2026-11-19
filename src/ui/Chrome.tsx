import { useEffect, useState } from 'react'
import { beats, brand, chapters } from '../content/copy'
import { runtime } from '../state/runtime'
import { useRuntime } from '../state/hooks'
import { useStore } from '../state/store'
import { scrollToBeat } from '../animation/scroller'

/** Header, chapter rail, position indicator, contextual hint. Kept to the edges. */
export function Chrome() {
  const active = useRuntime(() => runtime.activeSection)
  const ready = useRuntime(() => runtime.ready)
  const mode = useStore((s) => s.mode)
  // During camera moves the indicator keeps the nearest beat instead of going blank.
  const [beat, setBeat] = useState(0)
  useEffect(() => {
    setBeat(active >= 0 ? active : Math.min(beats.length - 1, Math.round(runtime.scroll)))
  }, [active])
  const chapter = chapters[beats[beat].chapter]
  const id = beats[beat].id

  const hint =
    mode !== 'film' ? '' : active === 0 ? 'Scroll' : id === 'final' ? 'Drag to turn' : id === 'xray' ? 'Drag to crank' : ''

  return (
    <div className={`chrome ${ready ? 'is-ready' : ''} in-${mode} ${/^m[A-Z]/.test(id) || id === 'final' ? 'over-product' : ''}`}>
      <header className="header">
        <a
          className="wordmark"
          href="#t-intro"
          aria-label={`${brand.name} — back to the start`}
          onClick={(e) => {
            e.preventDefault()
            scrollToBeat('intro')
          }}
        >
          {brand.name.toUpperCase()}
        </a>
        <nav className="nav">
          <span className="nav-product">
            {brand.product} <span className="nav-muted">Hand grinder</span>
          </span>
          <a
            className="nav-link"
            href="#t-build"
            onClick={(e) => {
              e.preventDefault()
              scrollToBeat('build')
            }}
          >
            <span>Build yours</span>
          </a>
        </nav>
      </header>

      {/* Chapter rail: a table of contents you can jump through. */}
      <nav className="rail" aria-label="Chapters">
        {chapters.map((c, i) => (
          <a
            key={c.index}
            href={`#t-${c.beat}`}
            className={`rail-item ${beats[beat].chapter === i ? 'is-on' : ''}`}
            onClick={(e) => {
              e.preventDefault()
              scrollToBeat(c.beat)
            }}
          >
            <span className="rail-label">{c.label}</span>
            <span className="rail-num">{c.index}</span>
          </a>
        ))}
      </nav>

      <footer className="footer">
        <div className="where" aria-hidden>
          <span className="where-num" key={chapter.index}>
            {chapter.index}
          </span>
          <span className="where-track">
            <span className="where-fill" ref={(el) => {
                runtime.dom.progress = el
              }} />
          </span>
          <span className="where-label" key={chapter.label}>
            {chapter.label}
          </span>
        </div>
        <div className={`hint ${hint ? 'is-on' : ''}`} aria-hidden>
          <span className="hint-text" key={hint}>
            {hint}
          </span>
          {active === 0 && <span className="hint-line" />}
        </div>
      </footer>
    </div>
  )
}

/** Load screen: a wordmark and a single hairline, then the lights come up. */
export function Loader() {
  const ready = useRuntime(() => runtime.ready)
  const [gone, setGone] = useState(false)
  useEffect(() => {
    if (!ready) return
    const t = setTimeout(() => setGone(true), 1600)
    return () => clearTimeout(t)
  }, [ready])
  if (gone) return null
  return (
    <div className={`loader ${ready ? 'is-done' : ''}`} aria-hidden={ready}>
      <div className="loader-inner">
        <span className="loader-mark">{brand.name.toUpperCase()}</span>
        <span className="loader-track">
          <span className="loader-bar" />
        </span>
      </div>
    </div>
  )
}
