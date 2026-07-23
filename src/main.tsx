import { StrictMode, Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: any) { console.error('React Error:', error, info) }
  render() {
    if (this.state.error) {
      return <div style={{ padding: 40, fontFamily: 'sans-serif' }}>
        <h1 style={{ color: '#ef4444' }}>Erreur</h1>
        <pre style={{ background: '#f1f5f9', padding: 16, borderRadius: 8, overflow: 'auto' }}>{this.state.error.message}</pre>
        <pre style={{ fontSize: 12, color: '#64748b' }}>{this.state.error.stack}</pre>
        <button onClick={() => location.reload()} style={{ marginTop: 16, padding: '8px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Réessayer</button>
      </div>
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
