import { useCallback, useRef, useState } from 'react'
import { NotificacionesContext } from '../hooks/useNotificaciones'

export function NotificacionesProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const [confirmacion, setConfirmacion] = useState(null)
  const idRef = useRef(0)

  const mostrarToast = useCallback((mensaje, tipo = 'ok') => {
    const id = ++idRef.current
    setToasts((prev) => [...prev, { id, mensaje, tipo }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4000)
  }, [])

  const confirmar = useCallback((mensaje) => {
    return new Promise((resolve) => {
      setConfirmacion({ mensaje, resolver: resolve })
    })
  }, [])

  function responderConfirmacion(respuesta) {
    confirmacion?.resolver(respuesta)
    setConfirmacion(null)
  }

  return (
    <NotificacionesContext.Provider value={{ mostrarToast, confirmar }}>
      {children}

      <div className="toast-contenedor">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tipo}`}>
            {t.mensaje}
          </div>
        ))}
      </div>

      {confirmacion && (
        <div className="modal-overlay" onClick={() => responderConfirmacion(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <p className="modal-confirmar-mensaje">{confirmacion.mensaje}</p>
            <div className="campo-acciones">
              <button className="btn-secundario" onClick={() => responderConfirmacion(false)}>
                Cancelar
              </button>
              <button className="btn-primario" onClick={() => responderConfirmacion(true)}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </NotificacionesContext.Provider>
  )
}
