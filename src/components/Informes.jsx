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

  function formatearMoneda(valor) {
    if (valor === null || valor === undefined || isNaN(valor)) return '0,00'
    return new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(valor)
  }

function formatearFecha(fecha) {
    if (!fecha) return ''
    // Si ya viene con información de hora (timestamp completo), la usamos directo.
    // Si es solo una fecha pura (AAAA-MM-DD), le agregamos hora local para evitar
    // el corrimiento de zona horaria al convertir a Date.
    const fechaStr = fecha.includes('T') ? fecha : fecha + 'T00:00:00'
    return new Date(fechaStr).toLocaleDateString('es-AR')
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
    </div>
  )
}

export default Informes