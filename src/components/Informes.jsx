import { useState } from 'react'
import { supabase } from '../lib/supabase'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { LOGO_BASE64 } from '../lib/logoBase64'

function Informes() {
  // Primer día del mes en curso
  function primerDiaDelMes() {
    const hoy = new Date()
    const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
    return primerDia.toISOString().slice(0, 10)
  }

  function fechaHoy() {
    return new Date().toISOString().slice(0, 10)
  }

  const [fechaDesde, setFechaDesde] = useState(primerDiaDelMes())
  const [fechaHasta, setFechaHasta] = useState(fechaHoy())
  const [tipoInforme, setTipoInforme] = useState('detallado') // 'detallado' o 'totales'
  const [generando, setGenerando] = useState(false)
  const [ordenRanking, setOrdenRanking] = useState('cant') // 'cant' | 'fact'
  const [ranking, setRanking] = useState(null)             // null = todavia no consulto
  const [consultando, setConsultando] = useState(false)

  function formatearMoneda(valor) {
    if (valor === null || valor === undefined || isNaN(valor)) return '0,00'
    return new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(valor)
  }

function formatearFecha(fecha) {
    if (!fecha) return ''
    const [anio, mes, dia] = fecha.slice(0, 10).split('-')
    return `${dia}/${mes}/${anio}`
  }

  function nombreTipoPago(tipo) {
    return { PT: 'Pago Total', SE: 'Seña', PP: 'Pago Parcial' }[tipo] || tipo
  }

  // Trae todos los pedidos del rango con su detalle (para el total de venta) y sus pagos
  async function obtenerDatosInforme() {
    const { data: pedidos, error: errorPedidos } = await supabase
      .from('pedidos')
      .select('*, clientes(descripcion, cliente_anonimo)')
      .gte('fecha_pedido', fechaDesde)
      .lte('fecha_pedido', fechaHasta)
      .order('fecha_pedido', { ascending: true })

    if (errorPedidos) {
      alert('Error al obtener los pedidos: ' + errorPedidos.message)
      return null
    }

    if (!pedidos || pedidos.length === 0) {
      return []
    }

    const idsPedidos = pedidos.map((p) => p.id_pedido)

    const { data: detalles } = await supabase
      .from('detalle_pedido')
      .select('*')
      .in('id_pedido', idsPedidos)

    const { data: pagos } = await supabase
      .from('pagos')
      .select('*')
      .in('id_pedido', idsPedidos)
      .order('fecha_pago', { ascending: true })

    // Armamos un objeto por pedido con todos los datos calculados
    const resultado = pedidos.map((pedido) => {
      const lineasPedido = (detalles || []).filter((d) => d.id_pedido === pedido.id_pedido)
      const pagosPedido = (pagos || []).filter((p) => p.id_pedido === pedido.id_pedido)

      const totalVenta = lineasPedido.reduce(
        (acc, l) => acc + parseFloat(l.precio_venta) * parseFloat(l.cantidad),
        0
      )
      const totalPagado = pagosPedido.reduce((acc, p) => acc + parseFloat(p.importe), 0)
      const saldoPendiente = totalVenta - totalPagado

      const nombreCliente =
        pedido.clientes?.cliente_anonimo === 'S'
          ? pedido.descripcion || '— Cliente anónimo —'
          : pedido.clientes?.descripcion || pedido.descripcion || '—'

      const pagosResumen = pagosPedido
        .map((p) => `${p.medio_pago} $${formatearMoneda(p.importe)} (${formatearFecha(p.fecha_pago)})`)
        .join('; ')

      const estado = saldoPendiente <= 0.01 ? 'COBRADO TOTALMENTE' : 'CON PAGOS PENDIENTES'

      return {
        id_pedido: pedido.id_pedido,
        cliente: nombreCliente,
        fecha_pedido: pedido.fecha_pedido,
        precio_venta: totalVenta,
        pagos_resumen: pagosResumen || '— Sin pagos registrados —',
        saldo_pendiente: saldoPendiente,
        estado,
        pagosPedido, // para el agrupado por medio de pago
      }
    })

    return resultado
  }

async function generarInformeDetallado() {
    const datos = await obtenerDatosInforme()
    if (datos === null) return
    if (datos.length === 0) {
      alert('No se encontraron pedidos en el rango de fechas indicado.')
      return
    }

    const doc = new jsPDF({ orientation: 'landscape' })
    const margenIzq = 14
    let y = 16

    // Logo arriba a la izquierda
    doc.addImage(LOGO_BASE64, 'JPEG', margenIzq, 8, 16, 15)

    doc.setFont('courier', 'bold')
    doc.setFontSize(16)
    doc.text('Informe de Pedidos - Detallado', margenIzq + 22, y)
    y += 16

    doc.setFont('courier', 'normal')
    doc.setFontSize(10)
    doc.text(`Período: ${formatearFecha(fechaDesde)} al ${formatearFecha(fechaHasta)}`, margenIzq, y)
    y += 8

    const filas = datos.map((d) => [
      d.id_pedido,
      d.cliente,
      formatearFecha(d.fecha_pedido),
      `$${formatearMoneda(d.precio_venta)}`,
      d.pagos_resumen,
      `$${formatearMoneda(d.saldo_pendiente)}`,
      d.estado,
    ])

autoTable(doc, {
      startY: y,
      margin: { left: margenIzq, right: 14 },
      head: [['Pedido', 'Cliente', 'Fecha', 'Precio Venta', 'Pagos Recibidos', 'Saldo Pendiente', 'Estado']],
      body: filas,
      theme: 'grid',
      styles: {
        font: 'courier',
        fontSize: 8,
        cellPadding: 2,
        lineWidth: 0.2,
        lineColor: [180, 180, 180],
      },
      headStyles: {
        fillColor: [232, 118, 92],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 16, halign: 'center' },
        2: { cellWidth: 22, halign: 'center' },
        3: { cellWidth: 25, halign: 'right' },
        5: { cellWidth: 28, halign: 'right' },
        6: { cellWidth: 38 },
      },
    })

    // Numeración de páginas en todas las hojas del informe
    const totalPaginas = doc.internal.getNumberOfPages()
    for (let i = 1; i <= totalPaginas; i++) {
      doc.setPage(i)
      doc.setFontSize(9)
      doc.setFont('courier', 'normal')
      doc.text(`Página ${i}/${totalPaginas}`, 282, 200, { align: 'right' })
    }

    doc.save(`Informe_Detallado_${fechaDesde}_a_${fechaHasta}.pdf`)
  }

  async function generarInformeTotales() {
    const datos = await obtenerDatosInforme()
    if (datos === null) return
    if (datos.length === 0) {
      alert('No se encontraron pedidos en el rango de fechas indicado.')
      return
    }

    // Agrupamos pagos por medio de pago
    const totalesPorMedio = {}
    let totalPendienteGeneral = 0
    let totalVentasGeneral = 0

    datos.forEach((d) => {
      totalVentasGeneral += d.precio_venta
      totalPendienteGeneral += d.saldo_pendiente > 0 ? d.saldo_pendiente : 0

      d.pagosPedido.forEach((p) => {
        const medio = p.medio_pago
        if (!totalesPorMedio[medio]) totalesPorMedio[medio] = 0
        totalesPorMedio[medio] += parseFloat(p.importe)
      })
    })

    const doc = new jsPDF({ orientation: 'portrait' })
    const margenIzq = 20
    let y = 20

    doc.setFont('courier', 'bold')
    doc.setFontSize(16)
    doc.text('Informe de Pedidos - Totales', margenIzq, y)
    y += 8

    doc.setFont('courier', 'normal')
    doc.setFontSize(10)
    doc.text(`Período: ${formatearFecha(fechaDesde)} al ${formatearFecha(fechaHasta)}`, margenIzq, y)
    y += 10

    doc.setFont('courier', 'bold')
    doc.setFontSize(12)
    doc.text('Totales cobrados por medio de pago', margenIzq, y)
    y += 6

    const filasMedios = Object.entries(totalesPorMedio).map(([medio, total]) => [
      medio,
      `$${formatearMoneda(total)}`,
    ])

    if (filasMedios.length === 0) {
      filasMedios.push(['— Sin pagos registrados en el período —', ''])
    }

    autoTable(doc, {
      startY: y,
      margin: { left: margenIzq, right: 20 },
      head: [['Medio de pago', 'Total cobrado']],
      body: filasMedios,
      theme: 'grid',
      styles: {
        font: 'courier',
        fontSize: 10,
        cellPadding: 3,
        lineWidth: 0.2,
        lineColor: [180, 180, 180],
      },
      headStyles: {
        fillColor: [232, 118, 92],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        1: { halign: 'right' },
      },
    })

    const finalY = doc.lastAutoTable.finalY + 12

    doc.setFont('courier', 'bold')
    doc.setFontSize(12)
    doc.text('Resumen general', margenIzq, finalY)

    autoTable(doc, {
      startY: finalY + 4,
      margin: { left: margenIzq, right: 20 },
      body: [
        ['Total ventas del período', `$${formatearMoneda(totalVentasGeneral)}`],
        ['Total pendiente de cobro', `$${formatearMoneda(totalPendienteGeneral)}`],
      ],
      theme: 'grid',
      styles: {
        font: 'courier',
        fontSize: 11,
        cellPadding: 3,
        lineWidth: 0.2,
        lineColor: [180, 180, 180],
      },
      columnStyles: {
        0: { fontStyle: 'bold' },
        1: { halign: 'right' },
      },
    })

    doc.save(`Informe_Totales_${fechaDesde}_a_${fechaHasta}.pdf`)
  }

  // ===== MAS VENDIDOS =====
  async function obtenerRanking() {
    const { data: pedidos, error } = await supabase
      .from('pedidos')
      .select('id_pedido')
      .gte('fecha_pedido', fechaDesde)
      .lte('fecha_pedido', fechaHasta)

    if (error) {
      alert('Error al obtener los pedidos: ' + error.message)
      return null
    }
    if (!pedidos || pedidos.length === 0) return []

    const ids = pedidos.map((p) => p.id_pedido)

    const [{ data: detalles }, { data: productos }, { data: combos }] = await Promise.all([
      supabase.from('detalle_pedido').select('*').in('id_pedido', ids),
      supabase.from('productos').select('id_producto, descripcion'),
      supabase.from('combos').select('id_combo, descripcion'),
    ])

    const nombreProd = {}
    ;(productos || []).forEach((x) => { nombreProd[x.id_producto] = x.descripcion })
    const nombreCombo = {}
    ;(combos || []).forEach((x) => { nombreCombo[x.id_combo] = x.descripcion })

    const acum = {}
    ;(detalles || []).forEach((d) => {
      const esCombo = d.id_combo != null
      const clave = esCombo ? 'c' + d.id_combo : 'p' + d.id_producto
      const nombre = esCombo
        ? (nombreCombo[d.id_combo] || 'Combo ' + d.id_combo)
        : (nombreProd[d.id_producto] || 'Producto ' + d.id_producto)
      const cantidad = parseFloat(d.cantidad || 0)
      const facturacion = cantidad * parseFloat(d.precio_venta || 0)
      if (!acum[clave]) acum[clave] = { nombre, tipo: esCombo ? 'combo' : 'producto', cant: 0, fact: 0 }
      acum[clave].cant += cantidad
      acum[clave].fact += facturacion
    })

    return Object.values(acum)
  }

  function ordenar(lista) {
    return [...lista].sort((a, b) => (ordenRanking === 'cant' ? b.cant - a.cant : b.fact - a.fact))
  }

  async function handleConsultarRanking() {
    if (!fechaDesde || !fechaHasta) {
      alert('Completá ambas fechas.')
      return
    }
    if (fechaDesde > fechaHasta) {
      alert('La fecha desde no puede ser posterior a la fecha hasta.')
      return
    }
    setConsultando(true)
    const datos = await obtenerRanking()
    setConsultando(false)
    if (datos === null) return
    setRanking(datos)
  }

  async function generarPdfRanking() {
    if (!ranking || ranking.length === 0) {
      alert('Primero consultá el ranking.')
      return
    }
    const lista = ordenar(ranking)
    const doc = new jsPDF({ orientation: 'portrait' })
    const margenIzq = 14
    let y = 15

    doc.addImage(LOGO_BASE64, 'JPEG', margenIzq, 8, 16, 15)
    doc.setFont('courier', 'bold')
    doc.setFontSize(16)
    doc.text('Productos mas vendidos', margenIzq + 22, y + 3)
    doc.setFont('courier', 'normal')
    doc.setFontSize(10)
    y += 12
    doc.text(`Periodo: ${formatearFecha(fechaDesde)} al ${formatearFecha(fechaHasta)}`, margenIzq, y)
    y += 5
    doc.text(`Ordenado por: ${ordenRanking === 'cant' ? 'cantidad vendida' : 'facturacion'}`, margenIzq, y)
    y += 6

    const filas = lista.map((x, i) => [
      String(i + 1),
      x.nombre + (x.tipo === 'combo' ? ' (combo)' : ''),
      String(x.cant),
      formatearMoneda(x.fact),
    ])
    const totalCant = lista.reduce((a, x) => a + x.cant, 0)
    const totalFact = lista.reduce((a, x) => a + x.fact, 0)
    filas.push(['', 'TOTAL DEL PERIODO', String(totalCant), formatearMoneda(totalFact)])

    autoTable(doc, {
      startY: y,
      head: [['#', 'Producto / Combo', 'Cantidad', 'Facturacion']],
      body: filas,
      styles: { font: 'courier', fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [232, 118, 92], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 12 },
        2: { halign: 'right', cellWidth: 25 },
        3: { halign: 'right', cellWidth: 38 },
      },
      didParseCell: (data) => {
        if (data.row.index === filas.length - 1 && data.section === 'body') {
          data.cell.styles.fontStyle = 'bold'
        }
      },
      theme: 'grid',
      margin: { left: margenIzq, right: margenIzq },
    })

    const nombreArchivo = `Mas_Vendidos_${fechaDesde}_a_${fechaHasta}.pdf`
    const esMobile = window.innerWidth <= 768
    if (esMobile) {
      window.open(doc.output('bloburl'), '_blank')
    } else {
      doc.save(nombreArchivo)
    }
  }

  async function handleGenerar() {
    if (!fechaDesde || !fechaHasta) {
      alert('Indicá fecha desde y fecha hasta')
      return
    }
    if (new Date(fechaDesde) > new Date(fechaHasta)) {
      alert('La fecha desde no puede ser posterior a la fecha hasta')
      return
    }

    setGenerando(true)
    if (tipoInforme === 'detallado') {
      await generarInformeDetallado()
    } else {
      await generarInformeTotales()
    }
    setGenerando(false)
  }

  return (
    <div className="modulo">
      <h2>Informes</h2>

      <div className="subseccion">
        <h3>Generar informe de pedidos</h3>

        <div className="formulario formulario-costos">
          <div className="campo">
            <label>Fecha desde</label>
            <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
          </div>
          <div className="campo">
            <label>Fecha hasta</label>
            <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
          </div>
          <div className="campo">
            <label>Tipo de informe</label>
            <select value={tipoInforme} onChange={(e) => setTipoInforme(e.target.value)}>
              <option value="detallado">Detallado</option>
              <option value="totales">Totales</option>
            </select>
          </div>
          <div className="campo-acciones">
            <button className="btn-primario" onClick={handleGenerar} disabled={generando}>
              {generando ? 'Generando...' : '📄 Generar PDF'}
            </button>
          </div>
        </div>

        <p className="ayuda-vigencia">
          💡 El filtro de fechas se aplica sobre la <strong>fecha del pedido</strong>. El informe <strong>Detallado</strong> incluye
          una fila por pedido con sus pagos resumidos. El informe <strong>Totales</strong> agrupa los montos cobrados por medio de
          pago, más el total pendiente de cobro.
        </p>
      </div>

      <div className="subseccion">
        <h3>Productos mas vendidos</h3>

        <div className="formulario formulario-costos">
          <div className="campo">
            <label>Ordenar por</label>
            <select
              value={ordenRanking}
              onChange={(e) => setOrdenRanking(e.target.value)}
              style={{ background: '#fff', colorScheme: 'light' }}
            >
              <option value="cant">Cantidad vendida</option>
              <option value="fact">Facturacion ($)</option>
            </select>
          </div>
          <div className="campo-acciones">
            <button className="btn-primario" onClick={handleConsultarRanking} disabled={consultando}>
              {consultando ? 'Consultando...' : '🔎 Consultar'}
            </button>
          </div>
          {ranking && ranking.length > 0 && (
            <div className="campo-acciones">
              <button className="btn-secundario" onClick={generarPdfRanking}>📄 Exportar PDF</button>
            </div>
          )}
        </div>

        {ranking && ranking.length === 0 && (
          <p className="ayuda-vigencia">No se encontraron ventas en el rango de fechas indicado.</p>
        )}

        {ranking && ranking.length > 0 && (() => {
          const lista = ordenar(ranking)
          const max = Math.max(...lista.map((x) => (ordenRanking === 'cant' ? x.cant : x.fact))) || 1
          const totalCant = lista.reduce((a, x) => a + x.cant, 0)
          const totalFact = lista.reduce((a, x) => a + x.fact, 0)
          return (
            <table className="tabla">
              <thead>
                <tr>
                  <th style={{ width: '36px' }}>#</th>
                  <th>Producto / Combo</th>
                  <th style={{ textAlign: 'right' }}>Cantidad</th>
                  <th style={{ textAlign: 'right' }}>Facturacion</th>
                  <th style={{ width: '120px' }}></th>
                </tr>
              </thead>
              <tbody>
                {lista.map((x, i) => {
                  const val = ordenRanking === 'cant' ? x.cant : x.fact
                  const pct = Math.round((val / max) * 100)
                  return (
                    <tr key={x.tipo + x.nombre + i}>
                      <td style={{ color: '#8A6A66' }}>{i + 1}</td>
                      <td>
                        {x.nombre}
                        {x.tipo === 'combo' && (
                          <span style={{ fontSize: '.68rem', padding: '1px 7px', borderRadius: '20px', background: '#EDE7F6', color: '#7c5cbf', marginLeft: '6px' }}>
                            combo
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>{x.cant}</td>
                      <td style={{ textAlign: 'right' }}>{formatearMoneda(x.fact)}</td>
                      <td>
                        <div style={{ height: '6px', borderRadius: '3px', background: '#E8765C', opacity: 0.85, width: pct + '%' }} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td></td>
                  <td style={{ fontWeight: 600 }}>Total del periodo</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{totalCant}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatearMoneda(totalFact)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )
        })()}

        <p className="ayuda-vigencia">
          💡 Usa el mismo filtro de fechas de arriba (sobre la <strong>fecha del pedido</strong>). Los combos se muestran como
          una linea propia. Ordenar por <strong>cantidad</strong> te dice que sale mas; por <strong>facturacion</strong>, que te
          deja mas plata (no siempre coinciden).
        </p>
      </div>
    </div>
  )
}

export default Informes