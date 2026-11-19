import { lazy, Suspense, useEffect, useState } from 'react'
import { beats } from './content/copy'
import { useInput } from './state/hooks'
import { useSmoothScroll } from './animation/useSmoothScroll'
import { Story, Callouts } from './ui/Story'
import { Inspect, Hero } from './ui/Modes'
import { Journey } from './ui/Journey'
import { Chrome, Loader } from './ui/Chrome'

const Experience = lazy(() => import('./scene/Experience'))

export default function App() {
  useInput()
  useSmoothScroll()

  // Mount the scene only after fonts are in (the etched marks are drawn with them)
  // and the loader has painted, so texture generation never blocks first paint.
  const [boot, setBoot] = useState(false)
  useEffect(() => {
    let cancelled = false
    document.fonts.ready.then(() => {
      requestAnimationFrame(() => requestAnimationFrame(() => !cancelled && setBoot(true)))
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      <div className="canvas-wrap">
        {boot && (
          <Suspense fallback={null}>
            <Experience />
          </Suspense>
        )}
      </div>
      <div className="cut" aria-hidden />
      <Callouts />
      <Story />
      <Inspect />
      <Hero />
      <Journey />
      <Chrome />
      <main className="track" aria-hidden>
        {beats.map((b) => (
          <div key={b.id} id={`t-${b.id}`} data-track className="track-step" style={{ height: `${b.track}svh` }} />
        ))}
      </main>
      <Loader />
    </>
  )
}
