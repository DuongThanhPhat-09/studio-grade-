import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/newsreader/opsz.css'
import '@fontsource-variable/newsreader/opsz-italic.css'
import '@fontsource-variable/instrument-sans/index.css'
import 'lenis/dist/lenis.css'
import './styles/base.css'
import './styles/story.css'
import './styles/controls.css'
import './styles/modes.css'
import './styles/chrome.css'
import './styles/responsive.css'
import './styles/journey.css'
import App from './App'

// Make sure the fonts used by canvas-drawn engravings are actually requested.
document.fonts.load('600 32px "Instrument Sans Variable"')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
