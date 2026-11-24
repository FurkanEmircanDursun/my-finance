import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/dm-sans'
import './styles/tokens.css'
import './styles/index.css'
import './styles/components.css'
import './styles/workspace.css'
import App from './app/App'
import { ErrorBoundary } from './app/ErrorBoundary'
import { AppStoreProvider } from './store/AppStore'

const container = document.getElementById('root')
if (!container) throw new Error('#root bulunamadı')

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <AppStoreProvider>
        <App />
      </AppStoreProvider>
    </ErrorBoundary>
  </StrictMode>,
)
