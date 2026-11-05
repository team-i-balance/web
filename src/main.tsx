import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { boot } from './api/client'
import './app.css'

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
boot()
