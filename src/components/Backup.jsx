import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNotificaciones } from '../hooks/useNotificaciones'
import { dispararBackup } from '../lib/backup'

function formatearFecha(fechaIso) {
  if (!fechaIso) return '—'
  return new Date(fechaIso).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function Backup() {
  const { mostrarToast } = useNotificaciones()
  const [historial, setHistorial] = useState([])
  const [cargando, setCargando] = useState(true)
  const [haciendoBackup, setHaciendoBackup] = useState(false)

  useEffect(() => {
    cargarHistorial()
  }, [])

  async function cargarHistorial() {
    setCargando(true)
    const { data, error } = await supabase
      .from('backups_log')
      .select('*')
      .order('fecha', { ascending: false })
      .limit(20)
    if (error) {
      mostrarToast('Error al cargar el historial: ' + error.message, 'error')
    } else {
      setHistorial(data)
    }
    setCargando(false)
  }

  async function hacerBackup() {
    setHaciendoBackup(true)
    try {
      const resultado = await dispararBackup()
      mostrarToast(`Backup completo: ${resultado.tablas} tablas, ${resultado.registros} registros.`)
      cargarHistorial()
    } catch (e) {
      mostrarToast('No se pudo hacer el backup: ' + e.message, 'error')
    } finally {
      setHaciendoBackup(false)
    }
  }

  return (
    <div className="modulo modulo-compacto">
      <div className="cabecera-lista">
        <h2>Backup</h2>
      </div>

      <p style={{ color: '#8A6A66', fontSize: '13.5px', margin: '0 0 16px' }}>
        Exporta todas las tablas del sistema a un archivo guardado de forma privada.
        No reemplaza los backups automáticos de Supabase — es un respaldo extra, para
        hacer antes de un cambio importante o cuando quieras estar tranquila.
      </p>

      <button className="btn-primario" onClick={hacerBackup} disabled={haciendoBackup}>
        {haciendoBackup ? 'Haciendo backup...' : '💾 Hacer backup ahora'}
      </button>

      <h3 style={{ marginTop: '28px', marginBottom: '10px', fontSize: '15px', color: '#4A2C2A' }}>
        Historial
      </h3>

      {cargando ? (
        <p>Cargando...</p>
      ) : historial.length === 0 ? (
        <p style={{ color: '#8A6A66', fontSize: '13.5px' }}>Todavía no se hizo ningún backup.</p>
      ) : (
        <div className="tabla-wrapper">
          <table className="tabla tabla-compacta">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Estado</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {historial.map((b) => (
                <tr key={b.id_backup}>
                  <td>{formatearFecha(b.fecha)}</td>
                  <td>
                    {b.estado === 'ok' ? (
                      <span style={{ color: '#2D6A35', fontWeight: 600 }}>✓ OK</span>
                    ) : (
                      <span style={{ color: '#C0392B', fontWeight: 600 }}>✕ Error</span>
                    )}
                  </td>
                  <td style={{ fontSize: '12.5px', color: '#8A6A66' }}>{b.detalle || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default Backup
