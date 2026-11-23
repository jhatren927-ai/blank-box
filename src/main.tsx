import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { StoreProvider } from './state.tsx'
import './index.css'

class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Blank Box caught an application error:', error, info.componentStack)
  }

  render() {
    if (this.state.failed) {
      return (
        <main style={{ minHeight: '100vh', display: 'grid', placeContent: 'center', gap: 16, padding: 24, background: '#080d18', color: '#fff', fontFamily: 'system-ui, sans-serif', textAlign: 'center' }}>
          <h1 style={{ fontSize: 28, fontWeight: 800 }}>Blank Box hit a snag</h1>
          <p style={{ maxWidth: 440, lineHeight: 1.5, color: '#cbd5e1' }}>The app caught an unexpected error instead of leaving a blank screen. Your saved lineup is kept in this browser whenever local storage is available.</p>
          <button type="button" onClick={() => window.location.reload()} style={{ justifySelf: 'center', padding: '12px 20px', background: '#facc15', color: '#111827', fontWeight: 800, borderRadius: 4 }}>RESTART BLANK BOX</button>
        </main>
      )
    }
    return this.props.children
  }
}

const launchUrl = new URL(window.location.href)
const isTvLaunch = launchUrl.searchParams.get('tv') === '1'
  || /AFTT|Fire TV|Android TV|GoogleTV|BRAVIA/i.test(navigator.userAgent)
  || (window.location.hostname === 'localhost' && /Android/i.test(navigator.userAgent))
document.documentElement.classList.toggle('tv-mode', isTvLaunch)

const root = document.getElementById('root')
if (!root) throw new Error('Blank Box could not find its app root element.')

createRoot(root).render(
  <StrictMode>
    <AppErrorBoundary>
      <StoreProvider>
        <App />
      </StoreProvider>
    </AppErrorBoundary>
  </StrictMode>,
)
