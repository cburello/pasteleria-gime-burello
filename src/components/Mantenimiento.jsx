import { useState, useEffect } from 'react'
import { useNotificaciones } from '../hooks/useNotificaciones'
import { listarBackupsDisponibles, inspeccionarBackup, reautenticar, dispararRestore } from '../lib/restore'

function formatearFecha(fechaIso) {
  if (!fechaIso) return '—'
  return new Date(fechaIso).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function Mantenimiento() {
  const { mostrarToast, confirmar } = useNotificaciones()

  const [backups, setBackups] = useState([])
  const [cargandoBackups, setCargandoBackups] = useState(true)

  const [archivoSeleccionado, setArchivoSeleccionado] = useState(null)
  const [tablasBackup, setTablasBackup] = useState([])
  const [cargandoTablas, setCargandoTablas] = useState(false)
  const [tablasSeleccionadas, setTablasSeleccionadas] = useState(new Set())

  const [mostrarModalPassword, setMostrarModalPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [errorPassword, setErrorPassword] = useState(null)
  const [restaurando, setRestaurando] = useState(false)

  useEffect(() => {
    cargarBackups()
  }, [])

  async function cargarBackups() {
    setCargandoBackups(true)
    try {
      const data = await listarBackupsDisponibles()
      setBackups(data)
    } catch (e) {
      mostrarToast('Error al cargar los backups: ' + e.message, 'error')
    }
    setCargandoBackups(false)
  }

  async function elegirBackup(backup) {
    setArchivoSeleccionado(backup.archivo)
    setTablasBackup([])
    setTablasSeleccionadas(new Set())
    setCargandoTablas(true)
    try {
      const info = await inspeccionarBackup(backup.archivo)
      setTablasBackup(info.tablas || [])
    } catch (e) {
      mostrarToast('No se pudo leer ese backup: ' + e.message, 'error')
    }
    setCargandoTablas(false)
  }

  function alternarTabla(tabla) {
    setTablasSeleccionadas((prev) => {
      const nuevo = new Set(prev)
      if (nuevo.has(tabla)) nuevo.delete(tabla)
      else nuevo.add(tabla)
      return nuevo
    })
  }

  function alternarTodas() {
    if (tablasSeleccionadas.size === tablasBackup.length) {
      setTablasSeleccionadas(new Set())
    } else {
      setTablasSeleccionadas(new Set(tablasBackup.map((t) => t.tabla)))
    }
  }

  async function pedirConfirmacion() {
    const backup = backups.find((b) => b.archivo === archivoSeleccionado)
    const cantidad = tablasSeleccionadas.size
    const confirmado = await confirmar(
      `¿Seguro que querés restaurar ${cantidad} tabla${cantidad > 1 ? 's' : ''} desde el backup del ` +
      `${formatearFecha(backup?.fecha)}? Se va a BORRAR el contenido actual de esa${cantidad > 1 ? 's' : ''} ` +
      `tabla${cantidad > 1 ? 's' : ''} y reemplazarlo por los datos de ese backup. Esta acción no se puede deshacer.`
    )
    if (!confirmado) return
    setErrorPassword(null)
    setPassword('')
    setMostrarModalPassword(true)
  }

  async function confirmarConPassword() {
    if (!password) {
      setErrorPassword('Ingresá tu contraseña.')
      return
    }
    setRestaurando(true)
    setErrorPassword(null)
    try {
      await reautenticar(password)
    } catch (e) {
      setErrorPassword(e.message)
      setRestaurando(false)
      return
    }

    try {
      const resultado = await dispararRestore({
        archivo: archivoSeleccionado,
        tablas: Array.from(tablasSeleccionadas),
      })
      mostrarToast(`Restauración completa: ${resultado.tablas.length} tabla(s) restaurada(s).`)
      setMostrarModalPassword(false)
      setPassword('')
      setTablasSeleccionadas(new Set())
      cargarBackups()
    } catch (e) {
      const completadas = e.tablasCompletadas || []
      const detalle = completadas.length > 0
        ? ` Se alcanzaron a restaurar: ${completadas.join(', ')}. Revisá el estado de la base antes de reintentar.`
        : ' No se llegó a restaurar ninguna tabla.'
      mostrarToast('No se pudo restaurar: ' + e.message + detalle, 'error')
      setMostrarModalPassword(false)
    }
    setRestaurando(false)
  }

  return (
    <div className="modulo modulo-compacto">
      <div className="cabecera-lista">
        <h2>Mantenimiento</h2>
      </div>

      <div className="aviso-similar" style={{ marginBottom: 20 }}>
        ⚠️ Restaurar un backup <strong>borra</strong> el contenido actual de las tablas elegidas y lo reemplaza
        por los datos del backup seleccionado. Usalo solo si sabés lo que estás haciendo — no se puede deshacer.
      </div>

      <div className="subseccion" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
        <h3 style={{ fontFamily: "'Playfair Display', serif", color: '#8A6A66', fontSize: 16, marginBottom: 12 }}>
          1. Elegí un backup
        </h3>

        {cargandoBackups ? (
          <p>Cargando backups...</p>
        ) : backups.length === 0 ? (
          <p style={{ color: '#8A6A66', fontSize: 13.5 }}>Todavía no hay backups disponibles para restaurar.</p>
        ) : (
          <div className="tabla-wrapper">
            <table className="tabla tabla-compacta">
              <thead>
                <tr>
                  <th></th>
                  <th>Fecha</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr
                    key={b.id_backup}
                    style={{ cursor: 'pointer', background: archivoSeleccionado === b.archivo ? '#FFF5F2' : 'transparent' }}
                    onClick={() => elegirBackup(b)}
                  >
                    <td>
                      <input type="radio" checked={archivoSeleccionado === b.archivo} onChange={() => elegirBackup(b)} />
                    </td>
                    <td>{formatearFecha(b.fecha)}</td>
                    <td style={{ fontSize: 12.5, color: '#8A6A66' }}>{b.detalle || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {archivoSeleccionado && (
        <div className="subseccion">
          <h3 style={{ fontFamily: "'Playfair Display', serif", color: '#8A6A66', fontSize: 16, marginBottom: 12 }}>
            2. Elegí qué tablas restaurar
          </h3>

          {cargandoTablas ? (
            <p>Leyendo el backup...</p>
          ) : (
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 10, fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={tablasBackup.length > 0 && tablasSeleccionadas.size === tablasBackup.length}
                  onChange={alternarTodas}
                  style={{ width: 'auto' }}
                />
                Seleccionar todas ({tablasBackup.length})
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '6px 16px', marginBottom: 16 }}>
                {tablasBackup.map((t) => (
                  <label key={t.tabla} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13.5 }}>
                    <input
                      type="checkbox"
                      checked={tablasSeleccionadas.has(t.tabla)}
                      onChange={() => alternarTabla(t.tabla)}
                      style={{ width: 'auto' }}
                    />
                    {t.tabla} <span style={{ color: '#A68E89', fontSize: 11.5 }}>({t.filas})</span>
                  </label>
                ))}
              </div>

              <button
                className="btn-primario"
                onClick={pedirConfirmacion}
                disabled={tablasSeleccionadas.size === 0}
              >
                Restaurar {tablasSeleccionadas.size > 0 ? `(${tablasSeleccionadas.size})` : ''}
              </button>
            </>
          )}
        </div>
      )}

      {mostrarModalPassword && (
        <div className="modal-overlay" onClick={() => !restaurando && setMostrarModalPassword(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Confirmá tu identidad</h3>
            <p className="modal-confirmar-mensaje">
              Por seguridad, antes de restaurar necesitamos que vuelvas a ingresar tu contraseña.
            </p>
            <div className="form-modal">
              <div className="campo">
                <label>Contraseña</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                />
              </div>
              {errorPassword && <p className="mensaje-error">{errorPassword}</p>}
              <div className="campo-acciones">
                <button className="btn-primario" onClick={confirmarConPassword} disabled={restaurando}>
                  {restaurando ? 'Restaurando...' : 'Confirmar y restaurar'}
                </button>
                <button className="btn-secundario" onClick={() => setMostrarModalPassword(false)} disabled={restaurando}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Mantenimiento
