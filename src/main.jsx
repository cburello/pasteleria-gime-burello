import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { NotificacionesProvider } from './components/Notificaciones.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <NotificacionesProvider>
      <App />
    </NotificacionesProvider>
  </StrictMode>,
)
