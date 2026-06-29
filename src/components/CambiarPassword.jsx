import { useState } from 'react'
import { supabase } from '../lib/supabase'

function CambiarPassword({ onCerrar }) {
  const [passwordActual, setPasswordActual] = useState('')
  const [passwordNueva, setPasswordNueva] = useState('')
  const [passwordConfirmar, setPasswordConfirmar] = useState('')
  const [error, setError] = useState(null)
  const [exito, setExito] = useState(false)
  const [guardando, setGuardando] = useState(false)

  async function handleCambiar(e) {
    e.preventDefault()
    setError(null)

    if (passwordNueva.length < 6) {
      setError('La nueva contraseña debe tener al menos 6 caracteres')
      return
    }

    if (passwordNueva !== passwordConfirmar) {
      setError('Las contraseñas no coinciden')
      return
    }

    setGuardando(true)

    // Primero verificamos la contraseña actual reautenticando
    const { data: userData } = await supabase.auth.getUser()
    const email = userData?.user?.email

    const { error: errorLogin } = await supabase.auth.signInWithPassword({
      email,
      password: passwordActual,
    })

    if (errorLogin) {
      setError('La contraseña actual es incorrecta')
      setGuardando(false)
      return
    }

    // Si la actual es correcta, actualizamos a la nueva
    const { error: errorUpdate } = await supabase.auth.updateUser({
      password: passwordNueva,
    })

    if (errorUpdate) {
      setError('Error al actualizar la contraseña: ' + errorUpdate.message)
    } else {
      setExito(true)
    }

    setGuardando(false)
  }

  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3>Cambiar contraseña</h3>

        {exito ? (
          <>
            <p className="aviso-ok">✅ Contraseña actualizada correctamente.</p>
            <button className="btn-primario" onClick={onCerrar}>
              Cerrar
            </button>
          </>
        ) : (
          <form onSubmit={handleCambiar} className="form-modal">
            <div className="campo">
              <label>Contraseña actual</label>
              <input
                type="password"
                value={passwordActual}
                onChange={(e) => setPasswordActual(e.target.value)}
                required
              />
            </div>
            <div className="campo">
              <label>Nueva contraseña</label>
              <input
                type="password"
                value={passwordNueva}
                onChange={(e) => setPasswordNueva(e.target.value)}
                required
              />
            </div>
            <div className="campo">
              <label>Confirmar nueva contraseña</label>
              <input
                type="password"
                value={passwordConfirmar}
                onChange={(e) => setPasswordConfirmar(e.target.value)}
                required
              />
            </div>

            {error && <p className="mensaje-error">{error}</p>}

            <div className="campo-acciones">
              <button type="submit" className="btn-primario" disabled={guardando}>
                {guardando ? 'Guardando...' : 'Cambiar contraseña'}
              </button>
              <button type="button" className="btn-secundario" onClick={onCerrar}>
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default CambiarPassword