import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/dagatscan-theme.css'
import 'primeicons/primeicons.css'
import './styles/tailwind.css'
import './pages/index.css'
import App from './App.jsx'
import 'leaflet/dist/leaflet.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
