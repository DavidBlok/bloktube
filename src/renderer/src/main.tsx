import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { App } from './App'
import { MiniPlayer } from './components/MiniPlayer'
import { queryClient } from './lib/query'
import { initPlayerBindings } from './store/player'
import { initAppSettings } from './lib/appSettings'
import './styles.css'

const mini = location.hash === '#mini'

initPlayerBindings()
initAppSettings()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>{mini ? <MiniPlayer /> : <App />}</QueryClientProvider>
  </StrictMode>
)
