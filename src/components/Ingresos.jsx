import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function useEsMobile() {
  const [esMobile, setEsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false
  )
  useEffect(() => {
    function handler() { setEsMobile(window.innerWidth <= 768) }
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return esMobile
}

// Devuelve la fecha de HOY en formato YYYY-MM-DD usando el huso horario local
// (toISOString() convierte a UTC y puede adelantar/atrasar un día cerca de medianoche).
function fechaLocalHoy() {
  const hoy = new Date()
  const anio = hoy.getFullYear()
  const mes = String(hoy.getMonth() + 1).padStart(2, '0')
  const dia = String(hoy.getDate()).padStart(2, '0')
  return `${anio}-${mes}-${dia}`
}

function Ingresos() {
  const esMobile = useEsMobile()

  const [ingresos, setIngresos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const [conceptos, setConceptos] = useState([])
  const [mediosPago, setMediosPago] = useState([])

  const [editandoId, setEditandoId] = useState(null)
  const [idConcepto, setIdConcepto] = useState('')
  const [fecha, setFecha] = useState(fechaLocalHoy())
  const [importe, setImporte] = useState('')
  const [idMedioPago, setIdMedioPago] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [guardando, setGuardando] = useState(false)

  const [textoBusqueda, setTextoBusqueda] = useState('')
  const [modoMobile, setModoMobile] = useState('lista') // 'lista' | 'form'

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
    cargarIngresos()
    cargarConceptos()
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

  async function cargarIngresos() {
    setCargando(true)
    setError(null)
    const { data, error } = await supabase
      .from('ingresos')
      .select('*, conceptos(descripcion), medios_pagos(descripcion)')
      .gte('fecha', fechaDesdeFiltro)
      .lte('fecha', fechaHastaFiltro)
      .order('fecha', { ascending: false })

    if (error) {
      setError('Error al cargar los ingresos: ' + error.message)
    } else {
      setIngresos(data)
    }
    setCargando(false)
  }

  function manejarCambioFechaDesde(valor) {
    setFechaDesdeFiltro(valor)
    setFechaHastaFiltro(ultimoDiaDelMes(valor))
  }

  async function cargarConceptos() {
    const { data } = await supabase
      .from('conceptos')
      .select('*')
      .eq('indicador', 'Ingreso')
      .neq('descripcion', 'Pedidos')
      .order('descripcion')
    setConceptos(data || [])
  }

  async function cargarMediosPago() {
    const { data } = await supabase.from('medios_pagos').select('*').order('descripcion')
    setMediosPago(data || [])
  }

  function limpiarFormulario() {
    setEditandoId(null)
    setIdConcepto('')
    setFecha(fechaLocalHoy())
    setImporte('')
    setIdMedioPago('')
    setObservaciones('')
  }

  function iniciarEdicion(ingreso) {
    if (ingreso.id_pedido) {
      alert('Este ingreso fue generado automáticamente desde un pago de Pedidos y no se puede editar aquí.')
      return
    }
    setEditandoId(ingreso.id_ingreso)
    setIdConcepto(ingreso.id_concepto)
    setFecha(ingreso.fecha?.slice(0, 10) || '')
    setImporte(ingreso.importe)
    setIdMedioPago(ingreso.id_medio_pago)
    setObservaciones(ingreso.observaciones || '')
    if (esMobile) setModoMobile('form')
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

    if (!idConcepto || !fecha || !importe || !idMedioPago) {
      alert('Concepto, fecha, importe y medio de pago son obligatorios')
      return
    }

    const fechaAjustada = await ajustarFechaSiCerrada(fecha)
    if (fechaAjustada !== fecha) setFecha(fechaAjustada)

    setGuardando(true)

    const registro = {
      id_concepto: parseInt(idConcepto),
      fecha: fechaAjustada,
      importe: parseFloat(importe),
      id_medio_pago: idMedioPago,
      observaciones: observaciones || null,
    }

    let resultado
    if (editandoId) {
      resultado = await supabase.from('ingresos').update(registro).eq('id_ingreso', editandoId)
    } else {
      resultado = await supabase.from('ingresos').insert(registro)
    }

    if (resultado.error) {
      alert('Error al guardar: ' + resultado.error.message)
    } else {
      limpiarFormulario()
      cargarIngresos()
      if (esMobile) setModoMobile('lista')
    }

    setGuardando(false)
  }

  async function eliminar(ingreso) {
    if (ingreso.id_pedido) {
      alert('Este ingreso fue generado automáticamente desde un pago de Pedidos y no se puede eliminar aquí.')
      return
    }

    const confirmar = window.confirm('¿Seguro que querés eliminar este ingreso?')
    if (!confirmar) return

    const { error } = await supabase.from('ingresos').delete().eq('id_ingreso', ingreso.id_ingreso)

    if (error) {
      alert('No se pudo eliminar: ' + error.message)
    } else {
      cargarIngresos()
    }
  }

  const ingresosFiltrados = textoBusqueda.trim()
    ? ingresos.filter((i) =>
        normalizar(i.conceptos?.descripcion).includes(normalizar(textoBusqueda)) ||
        normalizar(i.observaciones).includes(normalizar(textoBusqueda))
      )
    : ingresos

  const totalesPorMedio = ingresosFiltrados.reduce((acc, i) => {
    const medio = i.medios_pagos?.descripcion || i.id_medio_pago
    acc[medio] = (acc[medio] || 0) + parseFloat(i.importe)
    return acc
  }, {})

  const totalGeneral = ingresosFiltrados.reduce((acc, i) => acc + parseFloat(i.importe), 0)

  // ===== VISTA MOBILE =====
  if (esMobile) {
    if (modoMobile === 'form') {
      return (
        <div className="pedidos-mobile">
          <div className="mobile-paso-header">
            <button onClick={() => { limpiarFormulario(); setModoMobile('lista') }}>←</button>
            <span>{editandoId ? 'Editar ingreso' : 'Nuevo ingreso'}</span>
          </div>

          <form onSubmit={guardar}>
            <div className="campos-apilados">
              <div className="campo">
                <label>Concepto</label>
                <select value={idConcepto} onChange={(e) => setIdConcepto(e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {conceptos.map((c) => (
                    <option key={c.id_concepto} value={c.id_concepto}>{c.descripcion}</option>
                  ))}
                </select>
              </div>

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
                <label>Medio de pago</label>
                <select value={idMedioPago} onChange={(e) => setIdMedioPago(e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {mediosPago.map((m) => (
                    <option key={m.id_medio_pago} value={m.id_medio_pago}>{m.descripcion}</option>
                  ))}
                </select>
              </div>

              <div className="campo">
                <label>Observaciones</label>
                <input
                  type="text"
                  placeholder="Observaciones libres"
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                />
              </div>
            </div>

            <div className="mobile-acciones-finales">
              <button type="submit" className="btn-primario" disabled={guardando}>
                {guardando ? 'Guardando...' : editandoId ? 'Actualizar ingreso' : 'Guardar ingreso'}
              </button>
              {editandoId && (
                <button type="button" className="btn-secundario" onClick={() => { limpiarFormulario(); setModoMobile('lista') }}>
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </div>
      )
    }

    // Lista en tarjetas
    return (
      <div className="pedidos-mobile">
        <div className="pedidos-mobile-header">
          <h2>Ingresos</h2>
        </div>

        <p className="ayuda-vigencia" style={{ marginBottom: '12px', fontSize: '12px' }}>
          💡 Los ingresos por Pedidos se generan automáticamente. Acá solo se cargan ingresos manuales.
        </p>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <div className="campo" style={{ flex: 1 }}>
            <label>Desde</label>
            <input type="date" value={fechaDesdeFiltro} onChange={(e) => manejarCambioFechaDesde(e.target.value)} />
          </div>
          <div className="campo" style={{ flex: 1 }}>
            <label>Hasta</label>
            <input type="date" value={fechaHastaFiltro} onChange={(e) => setFechaHastaFiltro(e.target.value)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn-primario" style={{ padding: '10px 12px', fontSize: '13px' }} onClick={cargarIngresos}>
              🔎
            </button>
          </div>
        </div>

        <div className="campo-buscador">
          <input
            type="text"
            placeholder="🔎 Buscar por concepto u observación..."
            value={textoBusqueda}
            onChange={(e) => setTextoBusqueda(e.target.value)}
          />
        </div>

        {cargando && <p>Cargando...</p>}
        {error && <p className="mensaje-error">{error}</p>}

        {!cargando && !error && (
          <div className="lista-tarjetas">
            {ingresosFiltrados.length === 0 && <p>No hay ingresos en ese período.</p>}

            {ingresosFiltrados.map((i) => (
              <div
                key={i.id_ingreso}
                className="tarjeta-pedido"
                onClick={() => iniciarEdicion(i)}
              >
                <div className="tarjeta-pedido-linea1">
                  <span className="tarjeta-pedido-cliente">{i.conceptos?.descripcion}</span>
                  <span className="tarjeta-pedido-id">{formatearFecha(i.fecha)}</span>
                </div>
                {i.observaciones && (
                  <div className="tarjeta-pedido-fecha">{i.observaciones}</div>
                )}
                <div className="tarjeta-pedido-linea2">
                  <span className="tarjeta-pedido-total">
                    {i.id_pedido ? `Pedido #${i.id_pedido}` : i.medios_pagos?.descripcion}
                  </span>
                  <span className="tarjeta-pedido-estado cobrado">${formatearMoneda(i.importe)}</span>
                </div>
                {!i.id_pedido && (
                  <div className="tarjeta-pedido-acciones">
                    <button
                      className="btn-link btn-eliminar"
                      onClick={(e) => { e.stopPropagation(); eliminar(i) }}
                    >
                      Eliminar
                    </button>
                  </div>
                )}
              </div>
            ))}

            {ingresosFiltrados.length > 0 && (
              <div className="costo-total" style={{ marginBottom: '6px' }}>
                {Object.entries(totalesPorMedio).map(([medio, total]) => (
                  <div key={medio}>💰 {medio}: <strong>${formatearMoneda(total)}</strong></div>
                ))}
                <div style={{ marginTop: '6px' }}>Total: <strong>${formatearMoneda(totalGeneral)}</strong></div>
              </div>
            )}
          </div>
        )}

        <button className="boton-flotante" onClick={() => { limpiarFormulario(); setModoMobile('form') }} aria-label="Nuevo ingreso">
          +
        </button>
      </div>
    )
  }

  // ===== VISTA DESKTOP (sin cambios) =====
  return (
    <div className="modulo">
      <h2>Ingresos</h2>

      <p className="ayuda-vigencia">
        💡 Los ingresos por "Pedidos" se generan automáticamente al registrar un pago en el módulo Pedidos. Acá solo se cargan ingresos manuales (Consultoría, Aportes, etc.).
      </p>

      <div className="formulario formulario-costos" style={{ marginBottom: '20px' }}>
        <div className="campo">
          <label>Desde</label>
          <input type="date" value={fechaDesdeFiltro} onChange={(e) => manejarCambioFechaDesde(e.target.value)} />
        </div>
        <div className="campo">
          <label>Hasta</label>
          <input type="date" value={fechaHastaFiltro} onChange={(e) => setFechaHastaFiltro(e.target.value)} />
        </div>
        <div className="campo-acciones">
          <button type="button" className="btn-primario" onClick={cargarIngresos}>🔎 Consultar</button>
        </div>
      </div>

      <form className="formulario formulario-costos" onSubmit={guardar}>
        <div className="campo">
          <label>Concepto</label>
          <select value={idConcepto} onChange={(e) => setIdConcepto(e.target.value)}>
            <option value="">Seleccionar...</option>
            {conceptos.map((c) => (
              <option key={c.id_concepto} value={c.id_concepto}>{c.descripcion}</option>
            ))}
          </select>
        </div>

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
          <label>Medio de pago</label>
          <select value={idMedioPago} onChange={(e) => setIdMedioPago(e.target.value)}>
            <option value="">Seleccionar...</option>
            {mediosPago.map((m) => (
              <option key={m.id_medio_pago} value={m.id_medio_pago}>{m.descripcion}</option>
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
            <button type="button" className="btn-secundario" onClick={limpiarFormulario}>Cancelar</button>
          )}
        </div>
      </form>

      <div className="campo-buscador">
        <input
          type="text"
          placeholder="🔎 Buscar por concepto u observación..."
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
                <th>Concepto</th>
                <th>Importe</th>
                <th>Medio de pago</th>
                <th>Origen</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {ingresosFiltrados.length === 0 && (
                <tr><td colSpan="6">No hay ingresos registrados.</td></tr>
              )}
              {ingresosFiltrados.map((i) => (
                <tr key={i.id_ingreso}>
                  <td>{formatearFecha(i.fecha)}</td>
                  <td>{i.conceptos?.descripcion}</td>
                  <td>${formatearMoneda(i.importe)}</td>
                  <td>{i.medios_pagos?.descripcion || i.id_medio_pago}</td>
                  <td>{i.id_pedido ? `Pedido #${i.id_pedido}` : 'Manual'}</td>
                  <td>
                    <button className="btn-link" onClick={() => iniciarEdicion(i)}>Editar</button>
                    <button className="btn-link btn-eliminar" onClick={() => eliminar(i)}>Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!cargando && !error && ingresosFiltrados.length > 0 && (
        <div className="costo-total">
          {Object.entries(totalesPorMedio).map(([medio, total]) => (
            <span key={medio}>
              💰 {medio}: <strong>${formatearMoneda(total)}</strong>&nbsp;&nbsp;|&nbsp;&nbsp;
            </span>
          ))}
          Total general: <strong>${formatearMoneda(totalGeneral)}</strong>
        </div>
      )}
    </div>
  )
}

export default Ingresos
