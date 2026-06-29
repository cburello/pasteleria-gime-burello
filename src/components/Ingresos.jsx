import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function Ingresos() {
  const [ingresos, setIngresos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const [conceptos, setConceptos] = useState([])
  const [mediosPago, setMediosPago] = useState([])

  const [editandoId, setEditandoId] = useState(null)
  const [idConcepto, setIdConcepto] = useState('')
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [importe, setImporte] = useState('')
  const [idMedioPago, setIdMedioPago] = useState('')
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
    // Excluimos "Pedidos" porque ese se genera automáticamente desde el módulo Pedidos
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
    setFecha(new Date().toISOString().slice(0, 10))
    setImporte('')
    setIdMedioPago('')
    setObservaciones('')
  }

  function iniciarEdicion(ingreso) {
    // No permitir editar ingresos generados automáticamente desde Pedidos
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
    if (fechaAjustada !== fecha) {
      setFecha(fechaAjustada)
    }

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
    }

    setGuardando(false)
  }

  async function eliminar(ingreso) {
    if (ingreso.id_pedido) {
      alert('Este ingreso fue generado automáticamente desde un pago de Pedidos y no se puede eliminar aquí. Eliminá el pago desde el módulo Pedidos si corresponde.')
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

  return (
    <div className="modulo">
      <h2>Ingresos</h2>

      <p className="ayuda-vigencia">
        💡 Los ingresos por "Pedidos" se generan automáticamente al registrar un pago en el módulo Pedidos. Acá solo se cargan ingresos manuales (Consultoría, Aportes, etc.).
      </p>

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
          <button type="button" className="btn-primario" onClick={cargarIngresos}>
            🔎 Consultar
          </button>
        </div>
      </div>      

      <form className="formulario formulario-costos" onSubmit={guardar}>
        <div className="campo">
          <label>Concepto</label>
          <select value={idConcepto} onChange={(e) => setIdConcepto(e.target.value)}>
            <option value="">Seleccionar...</option>
            {conceptos.map((c) => (
              <option key={c.id_concepto} value={c.id_concepto}>
                {c.descripcion}
              </option>
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
          placeholder="🔎 Buscar por concepto u observación..."
          value={textoBusqueda}
          onChange={(e) => setTextoBusqueda(e.target.value)}
        />
      </div>

      {cargando && <p>Cargando...</p>}
      {error && <p className="mensaje-error">{error}</p>}

      {!cargando && !error && (
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
              <tr>
                <td colSpan="6">No hay ingresos registrados.</td>
              </tr>
            )}
{ingresosFiltrados.map((i) => (
              <tr key={i.id_ingreso}>
                <td>{formatearFecha(i.fecha)}</td>
                <td>{i.conceptos?.descripcion}</td>
                <td>${formatearMoneda(i.importe)}</td>
                <td>{i.medios_pagos?.descripcion || i.id_medio_pago}</td>
                <td>{i.id_pedido ? `Pedido #${i.id_pedido}` : 'Manual'}</td>
                <td>
                  <button className="btn-link" onClick={() => iniciarEdicion(i)}>
                    Editar
                  </button>
                  <button className="btn-link btn-eliminar" onClick={() => eliminar(i)}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!cargando && !error && ingresosFiltrados.length > 0 && (
        <div className="costo-total">
          {Object.entries(
            ingresosFiltrados.reduce((acc, i) => {
              const medio = i.medios_pagos?.descripcion || i.id_medio_pago
              acc[medio] = (acc[medio] || 0) + parseFloat(i.importe)
              return acc
            }, {})
          ).map(([medio, total]) => (
            <span key={medio}>
              💰 {medio}: <strong>${formatearMoneda(total)}</strong>
              &nbsp;&nbsp;|&nbsp;&nbsp;
            </span>
          ))}
          Total general:{' '}
          <strong>
            ${formatearMoneda(ingresosFiltrados.reduce((acc, i) => acc + parseFloat(i.importe), 0))}
          </strong>
        </div>
      )}
    </div>
  )
}

export default Ingresos