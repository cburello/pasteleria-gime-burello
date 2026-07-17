import { useState, useEffect } from 'react'
import logo from '../assets/logo.jpeg'
import { soportaBiometria, hayCredencialRegistrada, desbloquearConBiometria } from '../lib/biometria'

function PantallaBloqueo({ onDesbloquear, onCerrarSesion }) {
  const [puedeBiometria, setPuedeBiometria] = useState(false)
  const [intentando, setIntentando] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelado = false
    async function verificar() {
      const soporta = await soportaBiometria()
      if (!cancelado) setPuedeBiometria(soporta && hayCredencialRegistrada())
    }
    verificar()
    return () => { cancelado = true }
  }, [])

  async function intentarBiometria() {
    setIntentando(true)
    setError(null)
    try {
      const ok = await desbloquearConBiometria()
      if (ok) {
        onDesbloquear()
        return
      }
      setError('No se pudo verificar. Probá de nuevo o ingresá con tu contraseña.')
    } catch {
      setError('No se pudo verificar. Probá de nuevo o ingresá con tu contraseña.')
    }
    setIntentando(false)
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <img src={logo} alt="Gime Burello Pastelería" className="login-logo" />
        <h1 className="login-titulo">
          Sesión <span>bloqueada</span>
        </h1>
        <p style={{ color: '#8A6A66', fontSize: 14, textAlign: 'center', margin: '0 0 20px' }}>
          Por inactividad se bloqueó el acceso. Desbloqueá para seguir.
        </p>

        {error && <p className="mensaje-error">{error}</p>}

        {puedeBiometria && (
          <button
            type="button"
            className="btn-primario btn-login"
            onClick={intentarBiometria}
            disabled={intentando}
            style={{ marginBottom: 12 }}
          >
            {intentando ? 'Verificando...' : '🔓 Desbloquear con huella / Face ID'}
          </button>
        )}

        <button type="button" className="btn-secundario" onClick={onCerrarSesion} style={{ width: '100%' }}>
          Ingresar con contraseña
        </button>
      </div>
    </div>
  )
}

export default PantallaBloqueo
