import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { boot } from './api/client'
import { initTheme } from './shell/theme'
import './styles/tokens.css'
import './styles/base.css'

initTheme()
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
boot()
