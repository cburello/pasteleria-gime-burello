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

function Gastos() {
  const esMobile = useEsMobile()

  const [gastos, setGastos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const [conceptos, setConceptos] = useState([])
  const [proveedores, setProveedores] = useState([])

  const [editandoId, setEditandoId] = useState(null)
  const [idConcepto, setIdConcepto] = useState('')
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [importe, setImporte] = useState('')
  const [idMedioPago, setIdMedioPago] = useState('')
  const [mediosPago, setMediosPago] = useState([])
  const [comprobante, setComprobante] = useState('')
  const [idProveedor, setIdProveedor] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [guardando, setGuardando] = useState(false)

  const [textoBusqueda, setTextoBusqueda] = useState('')

  // Mobile: controla si se muestra el formulario de carga o la lista
  const [modoMobile, setModoMobile] = useState('lista') // 'lista' | 'form'

  useEffect(() => {
    cargarGastos()
    cargarConceptos()
    cargarProveedores()
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

  async function cargarGastos() {
    setCargando(true)
    setError(null)
    const { data, error } = await supabase
      .from('gastos')
      .select('*, conceptos(descripcion), proveedores(descripcion), medios_pagos(descripcion)')
      .order('fecha', { ascending: false })

    if (error) {
      setError('Error al cargar los gastos: ' + error.message)
    } else {
      setGastos(data)
    }
    setCargando(false)
  }

  async function cargarConceptos() {
    const { data } = await supabase
      .from('conceptos')
      .select('*')
      .eq('indicador', 'Gasto')
      .order('descripcion')
    setConceptos(data || [])
  }

  async function cargarProveedores() {
    const { data } = await supabase.from('proveedores').select('*').order('descripcion')
    setProveedores(data || [])
  }

  async function cargarMediosPago() {
    const { data } = await supabase.from('medios_pagos').select('*').order('descripcion')
    setMediosPago(data || [])
  }

  function limpiarFormulario() {
    setEditandoId(null)
    setIdConcepto('')
    setFecha(new Date().toISOString().slice(0, 10))
    setImporte('')
    setIdMedioPago('')
    setComprobante('')
    setIdProveedor('')
    setObservaciones('')
  }

  function iniciarEdicion(gasto) {
    setEditandoId(gasto.id_gasto)
    setIdConcepto(gasto.id_concepto)
    setFecha(gasto.fecha?.slice(0, 10) || '')
    setImporte(gasto.importe)
    setIdMedioPago(gasto.id_medio_pago)
    setComprobante(gasto.comprobante || '')
    setIdProveedor(gasto.id_proveedor || '')
    setObservaciones(gasto.observaciones || '')
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
      comprobante: comprobante || null,
      id_proveedor: idProveedor ? parseInt(idProveedor) : null,
      observaciones: observaciones || null,
    }

    let resultado
    if (editandoId) {
      resultado = await supabase.from('gastos').update(registro).eq('id_gasto', editandoId)
    } else {
      resultado = await supabase.from('gastos').insert(registro)
    }

    if (resultado.error) {
      alert('Error al guardar: ' + resultado.error.message)
    } else {
      limpiarFormulario()
      cargarGastos()
      if (esMobile) setModoMobile('lista')
    }

    setGuardando(false)
  }

  async function eliminar(id) {
    const confirmar = window.confirm('¿Seguro que querés eliminar este gasto?')
    if (!confirmar) return

    const { error } = await supabase.from('gastos').delete().eq('id_gasto', id)

    if (error) {
      alert('No se pudo eliminar: ' + error.message)
    } else {
      cargarGastos()
    }
  }

  const gastosFiltrados = textoBusqueda.trim()
    ? gastos.filter((g) =>
        normalizar(g.conceptos?.descripcion).includes(normalizar(textoBusqueda)) ||
        normalizar(g.proveedores?.descripcion).includes(normalizar(textoBusqueda)) ||
        normalizar(g.observaciones).includes(normalizar(textoBusqueda))
      )
    : gastos

  const totalesPorMedio = gastosFiltrados.reduce((acc, g) => {
    const medio = g.medios_pagos?.descripcion || g.id_medio_pago
    acc[medio] = (acc[medio] || 0) + parseFloat(g.importe)
    return acc
  }, {})

  const totalGeneral = gastosFiltrados.reduce((acc, g) => acc + parseFloat(g.importe), 0)

  // ===== VISTA MOBILE =====
  if (esMobile) {
    // Formulario de carga/edición
    if (modoMobile === 'form') {
      return (
        <div className="pedidos-mobile">
          <div className="mobile-paso-header">
            <button onClick={() => { limpiarFormulario(); setModoMobile('lista') }}>←</button>
            <span>{editandoId ? 'Editar gasto' : 'Nuevo gasto'}</span>
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
                <label>Proveedor (opcional)</label>
                <select value={idProveedor} onChange={(e) => setIdProveedor(e.target.value)}>
                  <option value="">Sin proveedor</option>
                  {proveedores.map((p) => (
                    <option key={p.id_proveedor} value={p.id_proveedor}>{p.descripcion}</option>
                  ))}
                </select>
              </div>

              <div className="campo">
                <label>Comprobante (opcional)</label>
                <input
                  type="text"
                  placeholder="Ej: Factura A-001"
                  value={comprobante}
                  onChange={(e) => setComprobante(e.target.value)}
                />
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
                {guardando ? 'Guardando...' : editandoId ? 'Actualizar gasto' : 'Guardar gasto'}
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

    // Lista de gastos en tarjetas
    return (
      <div className="pedidos-mobile">
        <div className="pedidos-mobile-header">
          <h2>Gastos</h2>
        </div>

        <div className="campo-buscador">
          <input
            type="text"
            placeholder="🔎 Buscar por concepto, proveedor..."
            value={textoBusqueda}
            onChange={(e) => setTextoBusqueda(e.target.value)}
          />
        </div>

        {cargando && <p>Cargando...</p>}
        {error && <p className="mensaje-error">{error}</p>}

        {!cargando && !error && (
          <div className="lista-tarjetas">
            {gastosFiltrados.length === 0 && <p>No hay gastos registrados.</p>}

            {gastosFiltrados.map((g) => (
              <div key={g.id_gasto} className="tarjeta-pedido" onClick={() => iniciarEdicion(g)}>
                <div className="tarjeta-pedido-linea1">
                  <span className="tarjeta-pedido-cliente">{g.conceptos?.descripcion}</span>
                  <span className="tarjeta-pedido-id">{formatearFecha(g.fecha)}</span>
                </div>
                {g.proveedores?.descripcion && (
                  <div className="tarjeta-pedido-fecha">{g.proveedores.descripcion}</div>
                )}
                {g.observaciones && (
                  <div className="tarjeta-pedido-fecha">{g.observaciones}</div>
                )}
                <div className="tarjeta-pedido-linea2">
                  <span className="tarjeta-pedido-total">{g.medios_pagos?.descripcion}</span>
                  <span className="tarjeta-pedido-estado pendiente">${formatearMoneda(g.importe)}</span>
                </div>
                <div className="tarjeta-pedido-acciones">
                  <button
                    className="btn-link btn-eliminar"
                    onClick={(e) => { e.stopPropagation(); eliminar(g.id_gasto) }}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}

            {gastosFiltrados.length > 0 && (
              <div className="costo-total" style={{ marginBottom: '6px' }}>
                {Object.entries(totalesPorMedio).map(([medio, total]) => (
                  <div key={medio}>💰 {medio}: <strong>${formatearMoneda(total)}</strong></div>
                ))}
                <div style={{ marginTop: '6px' }}>Total: <strong>${formatearMoneda(totalGeneral)}</strong></div>
              </div>
            )}
          </div>
        )}

        <button className="boton-flotante" onClick={() => { limpiarFormulario(); setModoMobile('form') }} aria-label="Nuevo gasto">
          +
        </button>
      </div>
    )
  }

  // ===== VISTA DESKTOP (sin cambios) =====
  return (
    <div className="modulo">
      <h2>Gastos</h2>

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

        <div className="campo">
          <label>Comprobante (opcional)</label>
          <input
            type="text"
            placeholder="Ej: Factura A-001"
            value={comprobante}
            onChange={(e) => setComprobante(e.target.value)}
          />
        </div>

        <div className="campo">
          <label>Proveedor (opcional)</label>
          <select value={idProveedor} onChange={(e) => setIdProveedor(e.target.value)}>
            <option value="">Sin proveedor</option>
            {proveedores.map((p) => (
              <option key={p.id_proveedor} value={p.id_proveedor}>{p.descripcion}</option>
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
          placeholder="🔎 Buscar por concepto, proveedor u observación..."
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
                <th>Proveedor</th>
                <th>Comprobante</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {gastosFiltrados.length === 0 && (
                <tr><td colSpan="7">No hay gastos registrados.</td></tr>
              )}
              {gastosFiltrados.map((g) => (
                <tr key={g.id_gasto}>
                  <td>{formatearFecha(g.fecha)}</td>
                  <td>{g.conceptos?.descripcion}</td>
                  <td>${formatearMoneda(g.importe)}</td>
                  <td>{g.medios_pagos?.descripcion || g.id_medio_pago}</td>
                  <td>{g.proveedores?.descripcion || '—'}</td>
                  <td>{g.comprobante || '—'}</td>
                  <td>
                    <button className="btn-link" onClick={() => iniciarEdicion(g)}>Editar</button>
                    <button className="btn-link btn-eliminar" onClick={() => eliminar(g.id_gasto)}>Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!cargando && !error && gastosFiltrados.length > 0 && (
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

export default Gastos
