import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function Retiros() {
  const [retiros, setRetiros] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const [mediosPago, setMediosPago] = useState([])

  const [editandoId, setEditandoId] = useState(null)
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [importe, setImporte] = useState('')
  const [idMedioPagoOrigen, setIdMedioPagoOrigen] = useState('')
  const [idMedioPagoDestino, setIdMedioPagoDestino] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [guardando, setGuardando] = useState(false)

  const [textoBusqueda, setTextoBusqueda] = useState('')

  function primerDiaDelMes() {
    const hoy = new Date()
    return new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10)
  }

  function ultimoDiaDelMes(fechaDesdeStr) {
    const f = new Date(fechaDesdeStr + 'T00:00:00')
    const ultimoDia = new Date(f.getFullYear(), f.getMonth() + 1, 0)
    return ultimoDia.toISOString().slice(0, 10)
  }

  const [fechaDesdeFiltro, setFechaDesdeFiltro] = useState(primerDiaDelMes())
  const [fechaHastaFiltro, setFechaHastaFiltro] = useState(ultimoDiaDelMes(primerDiaDelMes()))

  useEffect(() => {
    cargarRetiros()
    cargarMediosPago()
  }, [])

  function formatearMoneda(valor) {
    if (valor === null || valor === undefined || isNaN(valor)) return '0,00'
    return new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(valor)
  }

  function formatearFecha(fecha) {
    if (!fecha) return ''
    return new Date(fecha + 'T00:00:00').toLocaleDateString('es-AR')
  }

  function normalizar(texto) {
    return (texto || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  }

  async function cargarRetiros() {
    setCargando(true)
    setError(null)
    const { data, error } = await supabase
      .from('retiros')
      .select('*, origen:medios_pagos!retiros_id_medio_pago_origen_fkey(descripcion), destino:medios_pagos!retiros_id_medio_pago_destino_fkey(descripcion)')
      .gte('fecha', fechaDesdeFiltro)
      .lte('fecha', fechaHastaFiltro)
      .order('fecha', { ascending: false })

    if (error) {
      setError('Error al cargar los retiros: ' + error.message)
    } else {
      setRetiros(data)
    }
    setCargando(false)
  }

  async function cargarMediosPago() {
    const { data } = await supabase.from('medios_pagos').select('*').order('descripcion')
    setMediosPago(data || [])
  }

  function manejarCambioFechaDesde(valor) {
    setFechaDesdeFiltro(valor)
    setFechaHastaFiltro(ultimoDiaDelMes(valor))
  }

  function limpiarFormulario() {
    setEditandoId(null)
    setFecha(new Date().toISOString().slice(0, 10))
    setImporte('')
    setIdMedioPagoOrigen('')
    setIdMedioPagoDestino('')
    setObservaciones('')
  }

  function iniciarEdicion(retiro) {
    setEditandoId(retiro.id_retiro)
    setFecha(retiro.fecha?.slice(0, 10) || '')
    setImporte(retiro.importe)
    setIdMedioPagoOrigen(retiro.id_medio_pago_origen)
    setIdMedioPagoDestino(retiro.id_medio_pago_destino)
    setObservaciones(retiro.observaciones || '')
  }

  async function ajustarFechaSiCerrada(fechaStr) {
    let fechaActual = fechaStr
    let ajustada = false

    while (true) {
      const periodo = fechaActual.slice(0, 7) + '-01'
      const { data } = await supabase
        .from('resultados')
        .select('id_resultado')
        .eq('periodo', periodo)
        .limit(1)

      if (!data || data.length === 0) break

      ajustada = true
      const f = new Date(periodo + 'T00:00:00')
      f.setMonth(f.getMonth() + 1)
      fechaActual = f.toISOString().slice(0, 10)
    }

    if (ajustada) {
      const f = new Date(fechaActual + 'T00:00:00')
      const nombresMes = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
      ]
      alert(
        `El período correspondiente a la fecha ingresada ya está cerrado. La fecha se ajustó automáticamente a ${nombresMes[f.getMonth()]} ${f.getFullYear()}.`
      )
    }

    return fechaActual
  }

  async function guardar(e) {
    e.preventDefault()

    if (!fecha || !importe || !idMedioPagoOrigen || !idMedioPagoDestino) {
      alert('Fecha, importe, origen y destino son obligatorios')
      return
    }

    const fechaAjustada = await ajustarFechaSiCerrada(fecha)
    if (fechaAjustada !== fecha) {
      setFecha(fechaAjustada)
    }

    if (idMedioPagoOrigen === idMedioPagoDestino) {
      const medioElegido = mediosPago.find((m) => m.id_medio_pago === idMedioPagoOrigen)
      const esEfectivo = medioElegido?.descripcion?.toLowerCase() === 'efectivo'

      if (!esEfectivo) {
        alert('Origen y destino solo pueden ser iguales si ambos son "Efectivo". Para otros medios de pago, elegí un destino distinto.')
        return
      }
    }

    setGuardando(true)

    const registro = {
      fecha: fechaAjustada,
      importe: parseFloat(importe),
      id_medio_pago_origen: idMedioPagoOrigen,
      id_medio_pago_destino: idMedioPagoDestino,
      observaciones: observaciones || null,
    }

    let resultado
    if (editandoId) {
      resultado = await supabase.from('retiros').update(registro).eq('id_retiro', editandoId)
    } else {
      resultado = await supabase.from('retiros').insert(registro)
    }

    if (resultado.error) {
      alert('Error al guardar: ' + resultado.error.message)
    } else {
      limpiarFormulario()
      cargarRetiros()
    }

    setGuardando(false)
  }

  async function eliminar(id) {
    const confirmar = window.confirm('¿Seguro que querés eliminar este retiro?')
    if (!confirmar) return

    const { error } = await supabase.from('retiros').delete().eq('id_retiro', id)

    if (error) {
      alert('No se pudo eliminar: ' + error.message)
    } else {
      cargarRetiros()
    }
  }

  const retirosFiltrados = textoBusqueda.trim()
    ? retiros.filter((r) => normalizar(r.observaciones).includes(normalizar(textoBusqueda)))
    : retiros

  return (
    <div className="modulo">
      <h2>Retiros</h2>

      <div className="formulario formulario-costos" style={{ marginBottom: '20px' }}>
        <div className="campo">
          <label>Desde</label>
          <input
            type="date"
            value={fechaDesdeFiltro}
            onChange={(e) => manejarCambioFechaDesde(e.target.value)}
          />
        </div>
        <div className="campo">
          <label>Hasta</label>
          <input
            type="date"
            value={fechaHastaFiltro}
            onChange={(e) => setFechaHastaFiltro(e.target.value)}
          />
        </div>
        <div className="campo-acciones">
          <button type="button" className="btn-primario" onClick={cargarRetiros}>
            🔎 Consultar
          </button>
        </div>
      </div>

      <form className="formulario formulario-costos" onSubmit={guardar}>
        <div className="campo">
          <label>Fecha</label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>

        <div className="campo">
          <label>Importe</label>
          <input
            type="number"
            step="0.01"
            placeholder="0.00"
            value={importe}
            onChange={(e) => setImporte(e.target.value)}
          />
        </div>

        <div className="campo">
          <label>Origen</label>
          <select value={idMedioPagoOrigen} onChange={(e) => setIdMedioPagoOrigen(e.target.value)}>
            <option value="">Seleccionar...</option>
            {mediosPago.map((m) => (
              <option key={m.id_medio_pago} value={m.id_medio_pago}>
                {m.descripcion}
              </option>
            ))}
          </select>
        </div>

        <div className="campo">
          <label>Destino</label>
          <select value={idMedioPagoDestino} onChange={(e) => setIdMedioPagoDestino(e.target.value)}>
            <option value="">Seleccionar...</option>
            {mediosPago.map((m) => (
              <option key={m.id_medio_pago} value={m.id_medio_pago}>
                {m.descripcion}
              </option>
            ))}
          </select>
        </div>

        <div className="campo" style={{ flex: 2 }}>
          <label>Observaciones</label>
          <input
            type="text"
            placeholder="Observaciones libres"
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
          />
        </div>

        <div className="campo-acciones">
          <button type="submit" className="btn-primario" disabled={guardando}>
            {guardando ? 'Guardando...' : editandoId ? 'Actualizar' : 'Agregar'}
          </button>
          {editandoId && (
            <button type="button" className="btn-secundario" onClick={limpiarFormulario}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="campo-buscador">
        <input
          type="text"
          placeholder="🔎 Buscar por observación..."
          value={textoBusqueda}
          onChange={(e) => setTextoBusqueda(e.target.value)}
        />
      </div>

      {cargando && <p>Cargando...</p>}
      {error && <p className="mensaje-error">{error}</p>}

      {!cargando && !error && (
        <div className="tabla-wrapper">
          <table className="tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Importe</th>
                <th>Origen</th>
                <th>Destino</th>
                <th>Observaciones</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {retirosFiltrados.length === 0 && (
                <tr>
                  <td colSpan="6">No hay retiros registrados.</td>
                </tr>
              )}
              {retirosFiltrados.map((r) => (
                <tr key={r.id_retiro}>
                  <td>{formatearFecha(r.fecha)}</td>
                  <td>${formatearMoneda(r.importe)}</td>
                  <td>{r.origen?.descripcion || r.id_medio_pago_origen}</td>
                  <td>{r.destino?.descripcion || r.id_medio_pago_destino}</td>
                  <td>{r.observaciones || '—'}</td>
                  <td>
                    <button className="btn-link" onClick={() => iniciarEdicion(r)}>
                      Editar
                    </button>
                    <button className="btn-link btn-eliminar" onClick={() => eliminar(r.id_retiro)}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!cargando && !error && retirosFiltrados.length > 0 && (
        <div className="costo-total">
          {Object.entries(
            retirosFiltrados.reduce((acc, r) => {
              const medio = r.origen?.descripcion || r.id_medio_pago_origen
              acc[medio] = (acc[medio] || 0) + parseFloat(r.importe)
              return acc
            }, {})
          ).map(([medio, total]) => (
            <span key={medio}>
              💰 Desde {medio}: <strong>${formatearMoneda(total)}</strong>
              &nbsp;&nbsp;|&nbsp;&nbsp;
            </span>
          ))}
          Total general:{' '}
          <strong>
            ${formatearMoneda(retirosFiltrados.reduce((acc, r) => acc + parseFloat(r.importe), 0))}
          </strong>
        </div>
      )}
    </div>
  )
}

export default Retiros
