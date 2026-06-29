import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function Resultados() {
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const [filasAbiertas, setFilasAbiertas] = useState([])
  const [periodosCerrados, setPeriodosCerrados] = useState([])

  const [periodosSeleccionados, setPeriodosSeleccionados] = useState([])
  const [filaExpandida, setFilaExpandida] = useState(null)
  const [datosCrudos, setDatosCrudos] = useState({ ingresos: [], gastos: [], retiros: [] })
  const [cerrandoPeriodo, setCerrandoPeriodo] = useState(false)

  useEffect(() => {
    cargarDatos()
  }, [])

  function formatearMoneda(valor) {
    if (valor === null || valor === undefined || isNaN(valor)) return '0,00'
    return new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(valor)
  }

  function formatearPeriodo(periodoStr) {
    const [anio, mes] = periodoStr.split('-')
    const nombresMes = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ]
    return `${nombresMes[parseInt(mes) - 1]} ${anio}`
  }

  function periodoDeFecha(fechaStr) {
    return fechaStr.slice(0, 7)
  }

  async function cargarDatos() {
    setCargando(true)
    setError(null)

    try {
      const { data: resultadosExistentes, error: errorResultados } = await supabase
        .from('resultados')
        .select('*, medios_pagos(descripcion)')
        .order('periodo', { ascending: false })

      if (errorResultados) throw errorResultados

      setPeriodosCerrados(resultadosExistentes || [])

      const periodosCerradosSet = new Set(
        (resultadosExistentes || []).map((r) => r.periodo.slice(0, 7))
      )

      const { data: ingresos, error: errorIngresos } = await supabase
        .from('ingresos')
        .select('*, medios_pagos(descripcion), conceptos(descripcion), pedidos(fecha_pedido, fecha_entrega, descripcion)')

      if (errorIngresos) throw errorIngresos

      const { data: gastos, error: errorGastos } = await supabase
        .from('gastos')
        .select('*, medios_pagos(descripcion), conceptos(descripcion), proveedores(descripcion)')

      if (errorGastos) throw errorGastos

      const { data: retiros, error: errorRetiros } = await supabase
        .from('retiros')
        .select('*, origen:medios_pagos!retiros_id_medio_pago_origen_fkey(descripcion)')

      if (errorRetiros) throw errorRetiros

      const agrupado = {}

      function agregar(periodo, origen, idMedioPago, descMedioPago, importe) {
        const clave = `${periodo}|${origen}|${idMedioPago}`
        if (!agrupado[clave]) {
          agrupado[clave] = {
            periodo,
            origen,
            id_medio_pago: idMedioPago,
            medio_pago: descMedioPago,
            importe: 0,
          }
        }
        agrupado[clave].importe += parseFloat(importe)
      }

      ;(ingresos || []).forEach((i) => {
        const periodo = periodoDeFecha(i.fecha)
        if (periodosCerradosSet.has(periodo)) return
        agregar(periodo, 'Ingreso', i.id_medio_pago, i.medios_pagos?.descripcion || i.id_medio_pago, i.importe)
      })

      ;(gastos || []).forEach((g) => {
        const periodo = periodoDeFecha(g.fecha)
        if (periodosCerradosSet.has(periodo)) return
        agregar(periodo, 'Gasto', g.id_medio_pago, g.medios_pagos?.descripcion || g.id_medio_pago, g.importe)
      })

      ;(retiros || []).forEach((r) => {
        const periodo = periodoDeFecha(r.fecha)
        if (periodosCerradosSet.has(periodo)) return
        agregar(periodo, 'Retiro', r.id_medio_pago_origen, r.origen?.descripcion || r.id_medio_pago_origen, r.importe)
      })

      const filas = Object.values(agrupado).sort((a, b) => b.periodo.localeCompare(a.periodo))

      setFilasAbiertas(filas)
      setDatosCrudos({ ingresos: ingresos || [], gastos: gastos || [], retiros: retiros || [] })
    } catch (err) {
      setError('Error al cargar los datos: ' + err.message)
    }

    setCargando(false)
  }

  function obtenerDetalle(fila) {
    if (fila.origen === 'Ingreso') {
      return datosCrudos.ingresos.filter(
        (i) => periodoDeFecha(i.fecha) === fila.periodo && i.id_medio_pago === fila.id_medio_pago
      )
    }
    if (fila.origen === 'Gasto') {
      return datosCrudos.gastos.filter(
        (g) => periodoDeFecha(g.fecha) === fila.periodo && g.id_medio_pago === fila.id_medio_pago
      )
    }
    if (fila.origen === 'Retiro') {
      return datosCrudos.retiros.filter(
        (r) => periodoDeFecha(r.fecha) === fila.periodo && r.id_medio_pago_origen === fila.id_medio_pago
      )
    }
    return []
  }

  function formatearFecha(fecha) {
    if (!fecha) return ''
    return new Date(fecha + 'T00:00:00').toLocaleDateString('es-AR')
  }

  function togglePeriodo(periodo) {
    setPeriodosSeleccionados((prev) => (prev.includes(periodo) ? [] : [periodo]))
  }

  async function obtenerSaldoAnterior(idMedioPago, periodoStr) {
    const primerDiaPeriodo = periodoStr + '-01'
    const { data, error } = await supabase
      .from('saldos')
      .select('*')
      .eq('id_medio_pago', idMedioPago)
      .lt('periodo', primerDiaPeriodo)
      .order('periodo', { ascending: false })
      .limit(1)

    if (error || !data || data.length === 0) return null
    return data[0]
  }

  async function handleCerrarPeriodo() {
    if (periodosSeleccionados.length === 0) return

    const periodo = periodosSeleccionados[0]

    const hoy = new Date()
    const periodoActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`

    if (periodo >= periodoActual) {
      const confirmarAdelantado = window.confirm(
        `El período seleccionado aún no llegó al final del mes. ¿Seguro quiere realizar el cierre?`
      )
      if (!confirmarAdelantado) return
    }

    const confirmar = window.confirm(
      `Se realizará el cierre del período ${formatearPeriodo(periodo)}. ¿Confirma?`
    )
    if (!confirmar) return

    setCerrandoPeriodo(true)

    try {
      const filasDelPeriodo = filasAbiertas.filter((f) => f.periodo === periodo)
      const mediosPagoDelPeriodo = [...new Set(filasDelPeriodo.map((f) => f.id_medio_pago))]

      const saldosAnteriores = {}
      const mediosSinSaldo = []

      for (const idMedioPago of mediosPagoDelPeriodo) {
        const saldo = await obtenerSaldoAnterior(idMedioPago, periodo)
        if (!saldo) {
          mediosSinSaldo.push(idMedioPago)
        } else {
          saldosAnteriores[idMedioPago] = parseFloat(saldo.importe)
        }
      }

      if (mediosSinSaldo.length > 0) {
        alert(
          'No se puede cerrar el período porque falta el saldo inicial para uno o más medios de pago: ' +
            mediosSinSaldo.join(', ') +
            '.\n\nCargá el saldo inicial correspondiente directamente en la tabla "saldos" de Supabase antes de cerrar.'
        )
        setCerrandoPeriodo(false)
        return
      }

      const primerDiaPeriodo = periodo + '-01'

      for (const idMedioPago of mediosPagoDelPeriodo) {
        const filaIngreso = filasDelPeriodo.find((f) => f.origen === 'Ingreso' && f.id_medio_pago === idMedioPago)
        const filaGasto = filasDelPeriodo.find((f) => f.origen === 'Gasto' && f.id_medio_pago === idMedioPago)
        const filaRetiro = filasDelPeriodo.find((f) => f.origen === 'Retiro' && f.id_medio_pago === idMedioPago)

        const totalIngresos = filaIngreso ? filaIngreso.importe : 0
        const totalGastos = filaGasto ? filaGasto.importe : 0
        const totalRetiros = filaRetiro ? filaRetiro.importe : 0

        const saldoInicial = saldosAnteriores[idMedioPago]
        const importeResultado = saldoInicial + totalIngresos - totalGastos - totalRetiros

        const { error: errorResultado } = await supabase
          .from('resultados')
          .upsert(
            {
              periodo: primerDiaPeriodo,
              id_medio_pago: idMedioPago,
              importe_ingresos: totalIngresos,
              importe_gastos: totalGastos,
              importe_retiro: totalRetiros,
              importe_resultado: importeResultado,
            },
            { onConflict: 'periodo,id_medio_pago' }
          )

        if (errorResultado) {
          throw new Error(`Falló al guardar el resultado del medio de pago "${idMedioPago}": ${errorResultado.message}`)
        }

        const { error: errorSaldo } = await supabase
          .from('saldos')
          .upsert(
            {
              periodo: primerDiaPeriodo,
              id_medio_pago: idMedioPago,
              importe: importeResultado,
            },
            { onConflict: 'periodo,id_medio_pago' }
          )

        if (errorSaldo) {
          throw new Error(`Falló al guardar el saldo del medio de pago "${idMedioPago}": ${errorSaldo.message}`)
        }
      }

      alert(`Período ${formatearPeriodo(periodo)} cerrado correctamente.`)
      setPeriodosSeleccionados([])
      await cargarDatos()
    } catch (err) {
      alert('Error al cerrar el período: ' + err.message)
    }

    setCerrandoPeriodo(false)
  }

  return (
    <div className="modulo">
      <h2>Resultados</h2>

      <div className="subseccion">
        <h3>Períodos abiertos</h3>

        {cargando && <p>Cargando...</p>}
        {error && <p className="mensaje-error">{error}</p>}

        {!cargando && !error && (
          <>
            {filasAbiertas.length === 0 ? (
              <p className="aviso-ok">✅ No hay movimientos pendientes de cierre.</p>
            ) : (
              <div className="tabla-wrapper">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Cerrar</th>
                      <th></th>
                      <th>Período</th>
                      <th>Origen</th>
                      <th>Medio de pago</th>
                      <th>Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filasAbiertas.map((fila, idx) => (
                      <>
                        <tr key={idx}>
                          <td>
                            <input
                              type="checkbox"
                              checked={periodosSeleccionados.includes(fila.periodo)}
                              onChange={() => togglePeriodo(fila.periodo)}
                            />
                          </td>
                          <td>
                            <button
                              className="btn-link"
                              onClick={() => setFilaExpandida(filaExpandida === idx ? null : idx)}
                              style={{ fontSize: '16px' }}
                            >
                              {filaExpandida === idx ? '▾' : '▸'}
                            </button>
                          </td>
                          <td>{formatearPeriodo(fila.periodo)}</td>
                          <td>
                            <span
                              className={
                                'badge-origen ' +
                                (fila.origen === 'Ingreso'
                                  ? 'badge-ingreso'
                                  : fila.origen === 'Gasto'
                                  ? 'badge-gasto'
                                  : 'badge-retiro')
                              }
                            >
                              {fila.origen}
                            </span>
                          </td>
                          <td>{fila.medio_pago}</td>
                          <td>${formatearMoneda(fila.importe)}</td>
                        </tr>
                        {filaExpandida === idx && (
                          <tr>
                            <td colSpan="6" style={{ backgroundColor: '#FFF8F5', padding: '12px 20px' }}>
                              <DetalleOrigen registros={obtenerDetalle(fila)} origen={fila.origen} />
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {filasAbiertas.length > 0 && (
              <div className="costo-total">
                {(() => {
                  const totalIngresos = filasAbiertas
                    .filter((f) => f.origen === 'Ingreso')
                    .reduce((acc, f) => acc + f.importe, 0)
                  const totalGastos = filasAbiertas
                    .filter((f) => f.origen === 'Gasto')
                    .reduce((acc, f) => acc + f.importe, 0)
                  const totalRetiros = filasAbiertas
                    .filter((f) => f.origen === 'Retiro')
                    .reduce((acc, f) => acc + f.importe, 0)
                  const totalGeneral = totalIngresos - totalGastos - totalRetiros

                  return (
                    <>
                      💰 Ingresos: <strong>${formatearMoneda(totalIngresos)}</strong>
                      &nbsp;&nbsp;|&nbsp;&nbsp;
                      Gastos: <strong>${formatearMoneda(totalGastos)}</strong>
                      &nbsp;&nbsp;|&nbsp;&nbsp;
                      Retiros: <strong>${formatearMoneda(totalRetiros)}</strong>
                      &nbsp;&nbsp;|&nbsp;&nbsp;
                      Total general:{' '}
                      <strong style={{ color: totalGeneral >= 0 ? '#2D6A35' : '#C0392B' }}>
                        ${formatearMoneda(totalGeneral)}
                      </strong>
                    </>
                  )
                })()}
              </div>
            )}

            <div className="campo-acciones" style={{ marginTop: '16px' }}>
              <button
                className="btn-primario"
                disabled={periodosSeleccionados.length === 0 || cerrandoPeriodo}
                onClick={handleCerrarPeriodo}
              >
                {cerrandoPeriodo ? 'Cerrando...' : 'Cerrar Período'}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="subseccion">
        <h3>Períodos cerrados</h3>

        {!cargando && periodosCerrados.length === 0 && (
          <p className="aviso-ok">Todavía no hay períodos cerrados.</p>
        )}

        {!cargando && periodosCerrados.length > 0 && (
          <div className="tabla-wrapper">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Período</th>
                  <th>Medio de pago</th>
                  <th>Saldo anterior</th>
                  <th>Ingresos</th>
                  <th>Gastos</th>
                  <th>Retiros</th>
                  <th>Resultado</th>
                  <th>Fecha cierre</th>
                </tr>
              </thead>
              <tbody>
                {periodosCerrados.map((r) => {
                  const saldoAnterior =
                    parseFloat(r.importe_resultado) -
                    parseFloat(r.importe_ingresos) +
                    parseFloat(r.importe_gastos) +
                    parseFloat(r.importe_retiro)

                  const fechaPeriodo = new Date(r.periodo + 'T00:00:00')
                  fechaPeriodo.setMonth(fechaPeriodo.getMonth() - 1)
                  const periodoAnteriorStr = `${fechaPeriodo.getFullYear()}-${String(fechaPeriodo.getMonth() + 1).padStart(2, '0')}`

                  return (
                    <tr key={r.id_resultado}>
                      <td>{formatearPeriodo(r.periodo.slice(0, 7))}</td>
                      <td>{r.medios_pagos?.descripcion || r.id_medio_pago}</td>
                      <td>
                        ${formatearMoneda(saldoAnterior)}
                        <span style={{ display: 'block', fontSize: '11px', color: '#A68E89' }}>
                          ({formatearPeriodo(periodoAnteriorStr)})
                        </span>
                      </td>
                      <td>${formatearMoneda(r.importe_ingresos)}</td>
                      <td>${formatearMoneda(r.importe_gastos)}</td>
                      <td>${formatearMoneda(r.importe_retiro)}</td>
                      <td style={{ fontWeight: 600, color: r.importe_resultado >= 0 ? '#2D6A35' : '#C0392B' }}>
                        ${formatearMoneda(r.importe_resultado)}
                      </td>
                      <td>{new Date(r.fecha_cierre).toLocaleDateString('es-AR')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// SUBCOMPONENTE: Detalle de los registros individuales de una fila agrupada
// ============================================================
function DetalleOrigen({ registros, origen }) {
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

  if (registros.length === 0) {
    return <p style={{ fontSize: '13px', color: '#8A6A66' }}>Sin registros para mostrar.</p>
  }

  if (origen === 'Gasto') {
    return (
      <div className="tabla-wrapper">
        <table className="tabla" style={{ fontSize: '13px' }}>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Concepto</th>
              <th>Proveedor</th>
              <th>Observaciones</th>
              <th>Importe</th>
            </tr>
          </thead>
          <tbody>
            {registros.map((r, i) => (
              <tr key={i}>
                <td>{formatearFecha(r.fecha)}</td>
                <td>{r.conceptos?.descripcion || '—'}</td>
                <td>{r.id_proveedor != null ? r.proveedores?.descripcion || '—' : '—'}</td>
                <td>{r.observaciones || '—'}</td>
                <td>${formatearMoneda(r.importe)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (origen === 'Ingreso') {
    return <DetalleIngresoPorConcepto registros={registros} />
  }

  return (
    <div className="tabla-wrapper">
      <table className="tabla" style={{ fontSize: '13px' }}>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Destino</th>
            <th>Importe</th>
          </tr>
        </thead>
        <tbody>
          {registros.map((r, i) => (
            <tr key={i}>
              <td>{formatearFecha(r.fecha)}</td>
              <td>{r.observaciones || '—'}</td>
              <td>${formatearMoneda(r.importe)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================
// SUBCOMPONENTE: Detalle de Ingresos agrupados por Concepto (Nivel 2)
// ============================================================
function DetalleIngresoPorConcepto({ registros }) {
  const [conceptoExpandido, setConceptoExpandido] = useState(null)

  function formatearMoneda(valor) {
    if (valor === null || valor === undefined || isNaN(valor)) return '0,00'
    return new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(valor)
  }

  const agrupadoPorConcepto = {}
  registros.forEach((r) => {
    const concepto = r.conceptos?.descripcion || 'Sin concepto'
    if (!agrupadoPorConcepto[concepto]) {
      agrupadoPorConcepto[concepto] = { concepto, importe: 0, registros: [] }
    }
    agrupadoPorConcepto[concepto].importe += parseFloat(r.importe)
    agrupadoPorConcepto[concepto].registros.push(r)
  })

  const filasConcepto = Object.values(agrupadoPorConcepto)

  return (
    <div className="nivel-2-wrapper">
      <div className="tabla-wrapper">
        <table className="nivel-2-tabla">
          <thead>
            <tr>
              <th style={{ width: '20px' }}></th>
              <th>Concepto</th>
              <th style={{ textAlign: 'right' }}>Importe</th>
            </tr>
          </thead>
          <tbody>
            {filasConcepto.map((fc, idx) => (
              <>
                <tr key={idx}>
                  <td>
                    <button
                      className="btn-link"
                      onClick={() => setConceptoExpandido(conceptoExpandido === idx ? null : idx)}
                      style={{ fontSize: '18px', color: '#D85A30', fontWeight: 700 }}
                    >
                      {conceptoExpandido === idx ? '▾' : '▸'}
                    </button>
                  </td>
                  <td>{fc.concepto}</td>
                  <td style={{ textAlign: 'right' }}>${formatearMoneda(fc.importe)}</td>
                </tr>
                {conceptoExpandido === idx && (
                  <tr>
                    <td colSpan="3" style={{ padding: 0, border: 'none' }}>
                      <div className="nivel-3-wrapper">
                        {fc.concepto === 'Pedidos' ? (
                          <DetallePedidosDeIngresos registros={fc.registros} />
                        ) : (
                          <DetalleIngresoSimple registros={fc.registros} />
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ============================================================
// SUBCOMPONENTE: Detalle simple de ingresos (Aportes, Consultoría, etc.)
// ============================================================
function DetalleIngresoSimple({ registros }) {
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

  return (
    <div className="tabla-wrapper">
      <table className="nivel-3-tabla">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Observaciones</th>
            <th style={{ textAlign: 'right' }}>Importe</th>
          </tr>
        </thead>
        <tbody>
          {registros.map((r, i) => (
            <tr key={i}>
              <td>{formatearFecha(r.fecha)}</td>
              <td>{r.observaciones || '—'}</td>
              <td style={{ textAlign: 'right' }}>${formatearMoneda(r.importe)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================
// SUBCOMPONENTE: Detalle de Pedidos dentro de Ingresos (Nivel 3)
// ============================================================
function DetallePedidosDeIngresos({ registros }) {
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

  return (
    <div className="tabla-wrapper">
      <table className="nivel-3-tabla">
        <thead>
          <tr>
            <th>ID Pedido</th>
            <th>Fecha pedido</th>
            <th>Fecha entrega</th>
            <th>Cliente</th>
            <th style={{ textAlign: 'right' }}>Importe</th>
          </tr>
        </thead>
        <tbody>
          {registros.map((r, i) => (
            <tr key={i}>
              <td>#{r.id_pedido}</td>
              <td>{formatearFecha(r.pedidos?.fecha_pedido)}</td>
              <td>{formatearFecha(r.pedidos?.fecha_entrega)}</td>
              <td>{r.pedidos?.descripcion || '—'}</td>
              <td style={{ textAlign: 'right' }}>${formatearMoneda(r.importe)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default Resultados