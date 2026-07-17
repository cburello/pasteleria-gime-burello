import { createContext, useContext } from 'react'

export const NotificacionesContext = createContext(null)

export function useNotificaciones() {
  const ctx = useContext(NotificacionesContext)
  if (!ctx) throw new Error('useNotificaciones debe usarse dentro de <NotificacionesProvider>')
  return ctx
}
