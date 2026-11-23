import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { StoreProvider } from './state.tsx'
import './index.css'

const launchUrl = new URL(window.location.href)
const isTvLaunch = launchUrl.searchParams.get('tv') === '1'
  || /AFTT|Fire TV|Android TV|GoogleTV|BRAVIA/i.test(navigator.userAgent)
  || (window.location.hostname === 'localhost' && /Android/i.test(navigator.userAgent))
document.documentElement.classList.toggle('tv-mode', isTvLaunch)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
)
