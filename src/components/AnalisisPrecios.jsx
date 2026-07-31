import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
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

function formatearFechaDDMMYYYY(fechaStr) {
  const [anio, mes, dia] = fechaStr.split('-')
  return `${dia}/${mes}/${anio}`
}

function normalizar(texto) {
  return (texto || '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function extraerCantidadPresentacion(presentacion) {
  const match = (presentacion || '').match(/[\d.,]+/)
  if (!match) return null
  return parseFloat(match[0].replace(',', '.'))
}

const CHIP_ESTILOS = {
  ok: { bg: '#E8F5E9', color: '#2E7D32' },
  riesgo: { bg: '#FDECEA', color: '#C0392B' },
  neutro: { bg: '#F1E9E6', color: '#8A6A66' },
}

function Chip({ estado, texto }) {
  const c = CHIP_ESTILOS[estado] || CHIP_ESTILOS.neutro
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', fontSize: '11px', fontWeight: 600,
      padding: '3px 9px', borderRadius: '20px', whiteSpace: 'nowrap',
      background: c.bg, color: c.color,
    }}>
      {texto}
    </span>
  )
}

function AnalisisPrecios() {
  const { mostrarToast, confirmar } = useNotificaciones()
  const [filas, setFilas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)

  const [textoBusqueda, setTextoBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [umbral, setUmbral] = useState('10')

  const hoy = fechaLocalHoy()

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

    const [
      { data: productos, error: errProductos },
      { data: precios, error: errPrecios },
    ] = await Promise.all([
      supabase.from('productos').select('id_producto, descripcion, id_receta, coeficiente_ganancia').order('descripcion'),
      supabase.from('precios').select('*').lte('fecha_inicio', hoy).gte('fecha_fin', hoy),
    ])

    if (errProductos) {
      setError('Error al cargar productos: ' + errProductos.message)
      setCargando(false)
      return
    }
    if (errPrecios) {
      setError('Error al cargar precios: ' + errPrecios.message)
      setCargando(false)
      return
    }

    const idsReceta = [...new Set((productos || []).map((p) => p.id_receta).filter(Boolean))]
    const idsRecetaSeguro = idsReceta.length ? idsReceta : [-1]

    const [
      { data: recetas, error: errRecetas },
      { data: detalles, error: errDetalles },
    ] = await Promise.all([
      supabase.from('recetas').select('id_receta, cantidad_producto_final').in('id_receta', idsRecetaSeguro),
      supabase.from('detalle_receta').select('id_receta, id_materia_prima, cantidad').in('id_receta', idsRecetaSeguro),
    ])

    if (errRecetas) {
      setError('Error al cargar recetas: ' + errRecetas.message)
      setCargando(false)
      return
    }
    if (errDetalles) {
      setError('Error al cargar detalle de recetas: ' + errDetalles.message)
      setCargando(false)
      return
    }

    const idsMateriaPrima = [...new Set((detalles || []).map((d) => d.id_materia_prima))]
    const idsMateriaPrimaSeguro = idsMateriaPrima.length ? idsMateriaPrima : [-1]

    const { data: costos, error: errCostos } = await supabase
      .from('costos_materia_prima')
      .select('id_materia_prima, presentacion, precio, fecha_inicio')
      .in('id_materia_prima', idsMateriaPrimaSeguro)
      .lte('fecha_inicio', hoy)
      .gte('fecha_fin', hoy)

    if (errCostos) {
      setError('Error al cargar costos de materias primas: ' + errCostos.message)
      setCargando(false)
      return
    }

    const costoPorMateriaPrima = new Map()
    for (const c of costos || []) {
      const existente = costoPorMateriaPrima.get(c.id_materia_prima)
      if (!existente || c.fecha_inicio > existente.fecha_inicio) costoPorMateriaPrima.set(c.id_materia_prima, c)
    }

    const detallesPorReceta = new Map()
    for (const d of detalles || []) {
      if (!detallesPorReceta.has(d.id_receta)) detallesPorReceta.set(d.id_receta, [])
      detallesPorReceta.get(d.id_receta).push(d)
    }

    const recetaPorId = new Map((recetas || []).map((r) => [r.id_receta, r]))
    const precioPorProducto = new Map((precios || []).map((p) => [p.id_producto, p]))

    function calcularTeorico(producto) {
      if (!producto.id_receta) return null
      const receta = recetaPorId.get(producto.id_receta)
      if (!receta || !receta.cantidad_producto_final) return null
      const detalle = detallesPorReceta.get(producto.id_receta) || []
      if (detalle.length === 0) return null

      let total = 0
      for (const ing of detalle) {
        const costo = costoPorMateriaPrima.get(ing.id_materia_prima)
        if (!costo) return null
        const cantidadPresentacion = extraerCantidadPresentacion(costo.presentacion)
        if (!cantidadPresentacion || cantidadPresentacion <= 0) return null
        const precioUnitario = parseFloat(costo.precio) / cantidadPresentacion
        total += precioUnitario * parseFloat(ing.cantidad)
      }

      const costoPorUnidad = total / receta.cantidad_producto_final
      return costoPorUnidad * parseFloat(producto.coeficiente_ganancia || 0)
    }

    const filasArmadas = (productos || []).map((p) => {
      const precioVigente = precioPorProducto.get(p.id_producto) || null
      return {
        id_producto: p.id_producto,
        descripcion: p.descripcion,
        teorico: calcularTeorico(p),
        precioVigente,
        minoristaActual: precioVigente ? parseFloat(precioVigente.precio_venta) : null,
        mayoristaActual: precioVigente?.precio_mayorista ? parseFloat(precioVigente.precio_mayorista) : null,
        minoristaNuevo: precioVigente ? String(precioVigente.precio_venta) : '',
        mayoristaNuevo: precioVigente?.precio_mayorista ? String(precioVigente.precio_mayorista) : '',
      }
    })

    setFilas(filasArmadas)
    setCargando(false)
  }

  function delta(actual, teorico) {
    if (actual === null || actual === undefined || teorico === null || teorico === 0) return null
    return ((actual - teorico) / teorico) * 100
  }

  function estadoFila(f, umbralNum) {
    if (f.minoristaActual === null) return 'sin-precio'
    if (f.teorico === null) return 'neutro'
    const d = delta(f.minoristaActual, f.teorico)
    if (d !== null && d < -umbralNum) return 'riesgo'
    return 'ok'
  }

  const umbralNum = (() => {
    const v = parseFloat(umbral)
    return isNaN(v) || v <= 0 ? 10 : v
  })()

  function chipDeFila(f) {
    const est = estadoFila(f, umbralNum)
    if (est === 'sin-precio') return <Chip estado="neutro" texto="Sin precio cargado" />
    if (est === 'neutro') return <Chip estado="neutro" texto="Sin costo" />
    const d = delta(f.minoristaActual, f.teorico)
    if (est === 'riesgo') return <Chip estado="riesgo" texto={`▼ ${d.toFixed(0)}% vs teórico`} />
    const signo = d > 0 ? '+' : ''
    return <Chip estado="ok" texto={`${signo}${d.toFixed(0)}% vs teórico`} />
  }

  function editarFila(idProducto, campo, valor) {
    setFilas(filas.map((f) => (f.id_producto === idProducto ? { ...f, [campo]: valor } : f)))
  }

  function restablecer() {
    setFilas(filas.map((f) => ({
      ...f,
      minoristaNuevo: f.minoristaActual !== null ? String(f.minoristaActual) : '',
      mayoristaNuevo: f.mayoristaActual !== null ? String(f.mayoristaActual) : '',
    })))
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

    const ayer = restarUnDia(hoy)
    let errores = []

    for (const f of modificadas) {
      const nuevoMinorista = f.minoristaNuevo !== '' ? parseFloat(f.minoristaNuevo) : f.minoristaActual
      const nuevoMayorista = f.mayoristaNuevo !== '' ? parseFloat(f.mayoristaNuevo) : null
      const teoricoRedondeado = f.teorico !== null ? parseFloat(f.teorico.toFixed(2)) : null

      if (nuevoMinorista === null || isNaN(nuevoMinorista)) {
        errores.push(`${f.descripcion}: precio minorista inválido`)
        continue
      }

      if (f.precioVigente) {
        if (f.precioVigente.fecha_inicio?.slice(0, 10) === hoy) {
          const { error } = await supabase
            .from('precios')
            .update({
              precio_venta: nuevoMinorista,
              precio_mayorista: nuevoMayorista,
              precio_teorico: teoricoRedondeado,
            })
            .eq('id_precio', f.precioVigente.id_precio)
          if (error) errores.push(`${f.descripcion}: ${error.message}`)
        } else {
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
            precio_teorico: teoricoRedondeado,
            precio_mayorista: nuevoMayorista,
          })
          if (errAlta) errores.push(`${f.descripcion}: ${errAlta.message}`)
        }
      } else {
        const { error } = await supabase.from('precios').insert({
          id_producto: f.id_producto,
          fecha_inicio: hoy,
          fecha_fin: '3000-12-31',
          precio_venta: nuevoMinorista,
          precio_teorico: teoricoRedondeado,
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

  const filasFiltradas = filas.filter((f) => {
    if (textoBusqueda.trim() && !normalizar(f.descripcion).includes(normalizar(textoBusqueda))) return false
    if (filtroEstado === 'todos') return true
    return estadoFila(f, umbralNum) === filtroEstado
  })

  const conteoRiesgo = filas.filter((f) => estadoFila(f, umbralNum) === 'riesgo').length
  const conteoOk = filas.filter((f) => estadoFila(f, umbralNum) === 'ok').length
  const conteoSinDato = filas.filter((f) => {
    const e = estadoFila(f, umbralNum)
    return e === 'neutro' || e === 'sin-precio'
  }).length

  return (
    <div className="modulo modulo-compacto">
      <h2>Análisis de Precios</h2>

      <p className="ayuda-vigencia">
        💡 Compara el precio teórico (calculado hoy en base al costo vigente de cada receta) contra el precio
        minorista y mayorista realmente cargados. Editá los valores y presioná "Aplicar cambios" para guardarlos
        con vigencia desde hoy — nada se guarda antes de eso.
      </p>

      {!cargando && !error && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <span className="stat-chip" style={{ color: '#C0392B' }}>
            <strong>{conteoRiesgo}</strong> por debajo
          </span>
          <span className="stat-chip" style={{ color: '#2E7D32' }}>
            <strong>{conteoOk}</strong> alineados
          </span>
          <span className="stat-chip" style={{ color: '#8A6A66' }}>
            <strong>{conteoSinDato}</strong> sin costo o precio
          </span>
          <span className="stat-chip" style={{ color: '#E8765C' }}>
            <strong>{filas.length}</strong> productos activos
          </span>
        </div>
      )}

      {!cargando && conteoRiesgo > 0 && (
        <div className="aviso-similar">
          ⚠️ {conteoRiesgo} producto(s) tienen un precio minorista más de {umbralNum}% por debajo de su precio
          teórico — están perdiendo margen respecto al costo actual de sus ingredientes.
        </div>
      )}

      <div className="formulario formulario-costos" style={{ alignItems: 'flex-end' }}>
        <div className="campo" style={{ flex: 2 }}>
          <label>Buscar</label>
          <input
            type="text"
            placeholder="🔎 Buscar por producto..."
            value={textoBusqueda}
            onChange={(e) => setTextoBusqueda(e.target.value)}
          />
        </div>
        <div className="campo">
          <label>Mostrar</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ display: 'inline-flex', border: '1px solid #E8D5CF', borderRadius: '20px', overflow: 'hidden' }}>
              {[
                { id: 'todos', label: 'Todos' },
                { id: 'riesgo', label: 'Por debajo' },
                { id: 'ok', label: 'Alineados' },
              ].map((op) => (
                <button
                  key={op.id}
                  type="button"
                  onClick={() => setFiltroEstado(op.id)}
                  style={{
                    border: 'none', padding: '9px 14px', fontSize: '12.5px', cursor: 'pointer',
                    fontFamily: 'Poppins, sans-serif',
                    background: filtroEstado === op.id ? '#E8765C' : 'none',
                    color: filtroEstado === op.id ? 'white' : '#8A6A66',
                    fontWeight: filtroEstado === op.id ? 500 : 400,
                  }}
                >
                  {op.label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: '#8A6A66' }}>
              <span>Umbral</span>
              <input
                type="number"
                min="1"
                max="100"
                step="1"
                value={umbral}
                onChange={(e) => setUmbral(e.target.value)}
                style={{ width: '46px', minWidth: '46px', textAlign: 'center', padding: '7px 6px', fontWeight: 600 }}
              />
              <span>%</span>
            </div>
          </div>
        </div>
        <div className="campo-acciones">
          <button type="button" className="btn-secundario" onClick={restablecer}>
            ↩️ Restablecer
          </button>
          <button
            type="button"
            className="btn-primario"
            onClick={aplicarCambios}
            disabled={guardando || modificadas.length === 0}
          >
            {guardando ? 'Aplicando...' : `✅ Aplicar cambios${modificadas.length > 0 ? ` (${modificadas.length})` : ''}`}
          </button>
        </div>
      </div>

      {cargando && <p>Cargando productos, recetas y costos...</p>}
      {error && <p className="mensaje-error">{error}</p>}

      {!cargando && !error && (
        <div className="tabla-wrapper">
          <table className="tabla">
            <thead>
              <tr>
                <th>ID</th>
                <th>Producto</th>
                <th>Precio teórico al {formatearFechaDDMMYYYY(hoy)}</th>
                <th style={{ backgroundColor: '#FBE4DD', color: '#993C1D' }}>Precio minorista</th>
                <th style={{ backgroundColor: '#EDE9FE', color: '#5B21B6' }}>Precio mayorista</th>
              </tr>
            </thead>
            <tbody>
              {filasFiltradas.length === 0 && (
                <tr><td colSpan="5">No hay productos que coincidan con el filtro.</td></tr>
              )}
              {filasFiltradas.map((f) => (
                <tr key={f.id_producto}>
                  <td style={{ color: '#8A6A66', fontSize: '12.5px' }}>#{f.id_producto}</td>
                  <td><strong>{f.descripcion}</strong></td>
                  <td>
                    {f.teorico === null
                      ? <span style={{ color: '#8A6A66', fontStyle: 'italic', fontSize: '12.5px' }}>No se pudo calcular (receta sin costos vigentes)</span>
                      : <span style={{ fontWeight: 600 }}>${formatearMoneda(f.teorico)}</span>}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Sin cargar"
                        value={f.minoristaNuevo}
                        onChange={(e) => editarFila(f.id_producto, 'minoristaNuevo', e.target.value)}
                        style={{ width: '96px', padding: '6px 8px', borderRadius: '7px', fontWeight: 600 }}
                      />
                      {chipDeFila(f)}
                    </div>
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Sin cargar"
                      value={f.mayoristaNuevo}
                      onChange={(e) => editarFila(f.id_producto, 'mayoristaNuevo', e.target.value)}
                      style={{ width: '96px', padding: '6px 8px', borderRadius: '7px', fontWeight: 600 }}
                    />
                  </td>
                </tr>
              ))}
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

export default AnalisisPrecios
