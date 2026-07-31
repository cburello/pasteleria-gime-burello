import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { generarListaPreciosPdf } from '../lib/listaPreciosPdf'
import { useNotificaciones } from '../hooks/useNotificaciones'

function fechaLocalHoy() {
  const hoy = new Date()
  const anio = hoy.getFullYear()
  const mes = String(hoy.getMonth() + 1).padStart(2, '0')
  const dia = String(hoy.getDate()).padStart(2, '0')
  return `${anio}-${mes}-${dia}`
}

function restarUnDia(fechaStr) {
  const f = new Date(fechaStr + 'T00:00:00')
  f.setDate(f.getDate() - 1)
  const anio = f.getFullYear()
  const mes = String(f.getMonth() + 1).padStart(2, '0')
  const dia = String(f.getDate()).padStart(2, '0')
  return `${anio}-${mes}-${dia}`
}

function PreciosMantenimiento() {
  const { mostrarToast, confirmar } = useNotificaciones()
  const [filas, setFilas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)

  const [coefMinorista, setCoefMinorista] = useState('1.00')
  const [coefMayorista, setCoefMayorista] = useState('1.00')
  const [tipoListaPdf, setTipoListaPdf] = useState('ambos')

  useEffect(() => {
    cargarDatos()
  }, [])

  function formatearMoneda(valor) {
    if (valor === null || valor === undefined || valor === '' || isNaN(valor)) return '—'
    return new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(valor)
  }

  async function cargarDatos() {
    setCargando(true)
    setError(null)

    const hoy = fechaLocalHoy()

    const { data: productos, error: errProductos } = await supabase
      .from('productos')
      .select('id_producto, descripcion')
      .order('descripcion')

    if (errProductos) {
      setError('Error al cargar productos: ' + errProductos.message)
      setCargando(false)
      return
    }

    const { data: precios, error: errPrecios } = await supabase
      .from('precios')
      .select('*')
      .lte('fecha_inicio', hoy)
      .gte('fecha_fin', hoy)

    if (errPrecios) {
      setError('Error al cargar precios: ' + errPrecios.message)
      setCargando(false)
      return
    }

    const filasArmadas = (productos || []).map((p) => {
      const precioVigente = (precios || []).find((pr) => pr.id_producto === p.id_producto)
      return {
        id_producto: p.id_producto,
        descripcion: p.descripcion,
        precioVigente: precioVigente || null,
        minoristaActual: precioVigente ? parseFloat(precioVigente.precio_venta) : null,
        mayoristaActual: precioVigente?.precio_mayorista ? parseFloat(precioVigente.precio_mayorista) : null,
        minoristaNuevo: precioVigente ? String(precioVigente.precio_venta) : '',
        mayoristaNuevo: precioVigente?.precio_mayorista ? String(precioVigente.precio_mayorista) : '',
      }
    })

    setFilas(filasArmadas)
    setCargando(false)
  }

  function simular() {
    const cMin = parseFloat(coefMinorista)
    const cMay = parseFloat(coefMayorista)

    if (isNaN(cMin) || isNaN(cMay) || cMin <= 0 || cMay <= 0) {
      mostrarToast('Los coeficientes deben ser números mayores a 0. Ej: 1.10 para +10%', 'error')
      return
    }

    setFilas(filas.map((f) => ({
      ...f,
      minoristaNuevo: f.minoristaActual !== null ? (f.minoristaActual * cMin).toFixed(2) : f.minoristaNuevo,
      mayoristaNuevo: f.mayoristaActual !== null ? (f.mayoristaActual * cMay).toFixed(2) : f.mayoristaNuevo,
    })))
  }

  function restablecer() {
    setFilas(filas.map((f) => ({
      ...f,
      minoristaNuevo: f.minoristaActual !== null ? String(f.minoristaActual) : '',
      mayoristaNuevo: f.mayoristaActual !== null ? String(f.mayoristaActual) : '',
    })))
    setCoefMinorista('1.00')
    setCoefMayorista('1.00')
  }

  function editarFila(idProducto, campo, valor) {
    setFilas(filas.map((f) => (f.id_producto === idProducto ? { ...f, [campo]: valor } : f)))
  }

  function calcularDelta(actual, nuevo) {
    if (actual === null || actual === 0 || nuevo === '' || isNaN(parseFloat(nuevo))) return null
    const delta = ((parseFloat(nuevo) - actual) / actual) * 100
    if (Math.abs(delta) < 0.005) return null
    return delta
  }

  function filaModificada(f) {
    const minCambio = f.minoristaActual !== null && f.minoristaNuevo !== '' &&
      Math.abs(parseFloat(f.minoristaNuevo) - f.minoristaActual) > 0.005
    const mayCambio =
      (f.mayoristaActual !== null && f.mayoristaNuevo !== '' &&
        Math.abs(parseFloat(f.mayoristaNuevo) - f.mayoristaActual) > 0.005) ||
      (f.mayoristaActual === null && f.mayoristaNuevo !== '' && !isNaN(parseFloat(f.mayoristaNuevo)))
    return minCambio || mayCambio
  }

  const modificadas = filas.filter(filaModificada)

  async function aplicarCambios() {
    if (modificadas.length === 0) {
      mostrarToast('No hay cambios para aplicar.', 'error')
      return
    }

    const confirmado = await confirmar(
      `Se van a actualizar los precios de ${modificadas.length} producto(s) con vigencia desde hoy. ¿Confirmás?`
    )
    if (!confirmado) return

    setGuardando(true)

    const hoy = fechaLocalHoy()
    const ayer = restarUnDia(hoy)
    let errores = []

    for (const f of modificadas) {
      const nuevoMinorista = f.minoristaNuevo !== '' ? parseFloat(f.minoristaNuevo) : f.minoristaActual
      const nuevoMayorista = f.mayoristaNuevo !== '' ? parseFloat(f.mayoristaNuevo) : null

      if (nuevoMinorista === null || isNaN(nuevoMinorista)) {
        errores.push(`${f.descripcion}: precio minorista inválido`)
        continue
      }

      if (f.precioVigente) {
        if (f.precioVigente.fecha_inicio?.slice(0, 10) === hoy) {
          // El precio vigente arrancó hoy: actualizar en lugar de cerrar+crear
          const { error } = await supabase
            .from('precios')
            .update({
              precio_venta: nuevoMinorista,
              precio_mayorista: nuevoMayorista,
            })
            .eq('id_precio', f.precioVigente.id_precio)
          if (error) errores.push(`${f.descripcion}: ${error.message}`)
        } else {
          // Cerrar el vigente y crear el nuevo desde hoy
          const { error: errCierre } = await supabase
            .from('precios')
            .update({ fecha_fin: ayer })
            .eq('id_precio', f.precioVigente.id_precio)

          if (errCierre) {
            errores.push(`${f.descripcion}: ${errCierre.message}`)
            continue
          }

          const { error: errAlta } = await supabase.from('precios').insert({
            id_producto: f.id_producto,
            fecha_inicio: hoy,
            fecha_fin: '3000-12-31',
            precio_venta: nuevoMinorista,
            precio_teorico: f.precioVigente.precio_teorico,
            precio_mayorista: nuevoMayorista,
          })
          if (errAlta) errores.push(`${f.descripcion}: ${errAlta.message}`)
        }
      } else {
        // Producto sin precio vigente: crear uno nuevo
        const { error } = await supabase.from('precios').insert({
          id_producto: f.id_producto,
          fecha_inicio: hoy,
          fecha_fin: '3000-12-31',
          precio_venta: nuevoMinorista,
          precio_teorico: null,
          precio_mayorista: nuevoMayorista,
        })
        if (error) errores.push(`${f.descripcion}: ${error.message}`)
      }
    }

    setGuardando(false)

    if (errores.length > 0) {
      mostrarToast('Algunos precios no se pudieron actualizar:\n\n' + errores.join('\n'), 'error')
    } else {
      mostrarToast(`Se actualizaron los precios de ${modificadas.length} producto(s) correctamente.`)
    }

    cargarDatos()
  }

  function generarPdf() {
    const filasPdf = filas.map((f) => ({
      descripcion: f.descripcion,
      minorista: f.minoristaNuevo !== '' && !isNaN(parseFloat(f.minoristaNuevo))
        ? parseFloat(f.minoristaNuevo)
        : null,
      mayorista: f.mayoristaNuevo !== '' && !isNaN(parseFloat(f.mayoristaNuevo))
        ? parseFloat(f.mayoristaNuevo)
        : null,
      fecha_inicio: f.precioVigente?.fecha_inicio || null,
      fecha_fin: f.precioVigente?.fecha_fin || null,
    }))
    generarListaPreciosPdf(filasPdf, tipoListaPdf)
  }

  return (
    <div className="modulo modulo-compacto">
      <h2>Mantenimiento de Precios</h2>

      <p className="ayuda-vigencia">
        💡 Ajustá los coeficientes y presioná "Simular" para previsualizar los nuevos precios. Podés editar
        cualquier valor a mano. Nada se guarda hasta que presiones "Aplicar cambios".
      </p>

      <div className="formulario formulario-costos" style={{ alignItems: 'flex-end' }}>
        <div className="campo">
          <label style={{ color: '#993C1D' }}>Coef. Minorista</label>
          <input
            type="number"
            step="0.01"
            value={coefMinorista}
            onChange={(e) => setCoefMinorista(e.target.value)}
            style={{ borderColor: '#E8765C', fontWeight: 600, maxWidth: '110px' }}
          />
        </div>
        <div className="campo">
          <label style={{ color: '#5B21B6' }}>Coef. Mayorista</label>
          <input
            type="number"
            step="0.01"
            value={coefMayorista}
            onChange={(e) => setCoefMayorista(e.target.value)}
            style={{ borderColor: '#7C3AED', fontWeight: 600, maxWidth: '110px' }}
          />
        </div>
        <div className="campo-acciones">
          <button type="button" className="btn-secundario" onClick={simular}>
            🔮 Simular
          </button>
          <button type="button" className="btn-secundario" onClick={restablecer}>
            ↩️ Restablecer
          </button>
          <select
            value={tipoListaPdf}
            onChange={(e) => setTipoListaPdf(e.target.value)}
            style={{ padding: '9px 10px', border: '1px solid #E8D5CF', borderRadius: '8px', fontSize: '13px' }}
          >
            <option value="ambos">PDF: Ambos precios</option>
            <option value="minorista">PDF: Solo minorista</option>
            <option value="mayorista">PDF: Solo mayorista</option>
          </select>
          <button type="button" className="btn-secundario" onClick={generarPdf}>
            📄 Generar PDF
          </button>
          <button
            type="button"
            className="btn-primario"
            onClick={aplicarCambios}
            disabled={guardando || modificadas.length === 0}
          >
            {guardando
              ? 'Aplicando...'
              : `✅ Aplicar cambios${modificadas.length > 0 ? ` (${modificadas.length})` : ''}`}
          </button>
        </div>
      </div>

      {cargando && <p>Cargando productos y precios...</p>}
      {error && <p className="mensaje-error">{error}</p>}

      {!cargando && !error && (
        <div className="tabla-wrapper">
          <table className="tabla tabla-compacta">
            <thead>
              <tr>
                <th rowSpan="2" style={{ verticalAlign: 'bottom', padding: '6px 8px', fontSize: '11px' }}>Producto</th>
                <th colSpan="3" style={{ backgroundColor: '#FBE4DD', color: '#993C1D', textAlign: 'center', padding: '4px 8px', fontSize: '11px' }}>Minorista</th>
                <th colSpan="3" style={{ backgroundColor: '#EDE9FE', color: '#5B21B6', textAlign: 'center', padding: '4px 8px', fontSize: '11px' }}>Mayorista</th>
              </tr>
              <tr>
                <th style={{ backgroundColor: '#FBE4DD', color: '#993C1D', padding: '4px 8px', fontSize: '10px' }}>Actual</th>
                <th style={{ backgroundColor: '#FBE4DD', color: '#993C1D', padding: '4px 8px', fontSize: '10px' }}>Nuevo</th>
                <th style={{ backgroundColor: '#FBE4DD', color: '#993C1D', padding: '4px 8px', fontSize: '10px' }}>Δ</th>
                <th style={{ backgroundColor: '#EDE9FE', color: '#5B21B6', padding: '4px 8px', fontSize: '10px' }}>Actual</th>
                <th style={{ backgroundColor: '#EDE9FE', color: '#5B21B6', padding: '4px 8px', fontSize: '10px' }}>Nuevo</th>
                <th style={{ backgroundColor: '#EDE9FE', color: '#5B21B6', padding: '4px 8px', fontSize: '10px' }}>Δ</th>
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 && (
                <tr><td colSpan="7">No hay productos cargados.</td></tr>
              )}
              {filas.map((f) => {
                const deltaMin = calcularDelta(f.minoristaActual, f.minoristaNuevo)
                const deltaMay = calcularDelta(f.mayoristaActual, f.mayoristaNuevo)
                const cambioMin = deltaMin !== null
                const cambioMay = deltaMay !== null ||
                  (f.mayoristaActual === null && f.mayoristaNuevo !== '' && !isNaN(parseFloat(f.mayoristaNuevo)))
                return (
                  <tr key={f.id_producto}>
                    <td style={{ padding: '5px 8px', fontSize: '13px' }}><strong>{f.descripcion}</strong></td>
                    <td style={{ color: '#8A6A66', padding: '5px 8px', fontSize: '12px' }}>
                      {f.minoristaActual !== null ? `$${formatearMoneda(f.minoristaActual)}` : '—'}
                    </td>
                    <td style={{ padding: '4px 8px' }}>
                      <input
                        type="number"
                        step="0.01"
                        value={f.minoristaNuevo}
                        onChange={(e) => editarFila(f.id_producto, 'minoristaNuevo', e.target.value)}
                        style={{
                          width: '90px', padding: '3px 6px', borderRadius: '6px', fontSize: '12px',
                          fontWeight: 600,
                          border: cambioMin ? '1.5px solid #E8765C' : '1px solid #E8D5CF',
                          backgroundColor: cambioMin ? '#FFF5F2' : 'white',
                          color: cambioMin ? '#993C1D' : '#4A2C2A',
                        }}
                      />
                    </td>
                    <td style={{ fontSize: '11px', fontWeight: 600, padding: '4px 6px', color: deltaMin > 0 ? '#2D6A35' : '#C0392B' }}>
                      {deltaMin !== null ? `${deltaMin > 0 ? '+' : ''}${deltaMin.toFixed(1)}%` : ''}
                    </td>
                    <td style={{ color: '#8A6A66', padding: '5px 8px', fontSize: '12px' }}>
                      {f.mayoristaActual !== null ? `$${formatearMoneda(f.mayoristaActual)}` : '—'}
                    </td>
                    <td style={{ padding: '4px 8px' }}>
                      <input
                        type="number"
                        step="0.01"
                        value={f.mayoristaNuevo}
                        placeholder="—"
                        onChange={(e) => editarFila(f.id_producto, 'mayoristaNuevo', e.target.value)}
                        style={{
                          width: '90px', padding: '3px 6px', borderRadius: '6px', fontSize: '12px',
                          fontWeight: 600,
                          border: cambioMay ? '1.5px solid #7C3AED' : '1px solid #E8D5CF',
                          backgroundColor: cambioMay ? '#F5F0FF' : 'white',
                          color: cambioMay ? '#5B21B6' : '#4A2C2A',
                        }}
                      />
                    </td>
                    <td style={{ fontSize: '11px', fontWeight: 600, padding: '4px 6px', color: deltaMay > 0 ? '#2D6A35' : '#C0392B' }}>
                      {deltaMay !== null ? `${deltaMay > 0 ? '+' : ''}${deltaMay.toFixed(1)}%` : ''}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {!cargando && modificadas.length > 0 && (
        <div className="aviso-similar" style={{ marginTop: '14px' }}>
          ⚠️ Hay {modificadas.length} producto(s) con cambios sin aplicar. Los cambios impactan en la base
          de datos recién al presionar "Aplicar cambios".
        </div>
      )}
    </div>
  )
}

export default PreciosMantenimiento
