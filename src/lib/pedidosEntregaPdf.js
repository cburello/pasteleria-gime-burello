import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

// ============================================================
// PDF de pedidos a entregar en un rango de fechas.
// Ordenado por fecha de entrega ascendente. El precio de venta y
// el monto pendiente de cobro se incluyen solo si se piden.
//
// pendiente = total del pedido - suma de pagos registrados
// (misma cuenta que muestra la lista de Pedidos en pantalla).
//
// Los íconos de estado son caracteres de ZapfDingbats (fuente estándar
// del PDF): '4' es la tilde y '8' la cruz. No se pueden usar emoji
// porque las fuentes estándar no los incluyen.
// ============================================================

const ICONO_PAGADO = '4'
const ICONO_DEBE = '8'

function formatearFecha(fecha) {
  if (!fecha) return ''
  const [anio, mes, dia] = fecha.slice(0, 10).split('-')
  return `${dia}/${mes}/${anio}`
}

function formatearMoneda(n) {
  if (n === null || n === undefined || isNaN(n)) return '—'
  return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function sumarUnDia(fechaStr) {
  const f = new Date(fechaStr + 'T00:00:00')
  f.setDate(f.getDate() + 1)
  return f.toISOString().slice(0, 10)
}

function nombreCliente(pedido) {
  if (pedido.clientes?.cliente_anonimo === 'S') return pedido.descripcion || 'Cliente anónimo'
  return pedido.clientes?.descripcion || pedido.descripcion || '—'
}

export async function generarPdfPedidosEntrega(supabase, { desde, hasta, incluirImportes }) {
  if (!desde || !hasta) throw new Error('Indicá el rango de fechas de entrega.')
  if (desde > hasta) throw new Error('La fecha "desde" no puede ser posterior a la fecha "hasta".')

  // fecha_entrega es timestamp: se toma hasta el final del día "hasta"
  const { data: pedidos, error } = await supabase
    .from('pedidos')
    .select('id_pedido, descripcion, telefono, fecha_pedido, fecha_entrega, clientes(descripcion, cliente_anonimo, telefono)')
    .gte('fecha_entrega', desde)
    .lt('fecha_entrega', sumarUnDia(hasta))
    .order('fecha_entrega', { ascending: true })

  if (error) throw new Error('No se pudieron cargar los pedidos: ' + error.message)
  if (!pedidos || pedidos.length === 0) {
    throw new Error('No hay pedidos con entrega entre ' + formatearFecha(desde) + ' y ' + formatearFecha(hasta) + '.')
  }

  const idsPedido = pedidos.map((p) => p.id_pedido)

  const [{ data: lineas }, { data: pagos }] = await Promise.all([
    supabase
      .from('detalle_pedido')
      .select('id_pedido, id_producto, id_combo, cantidad, precio_venta, productos(descripcion), combos(descripcion)')
      .in('id_pedido', idsPedido),
    supabase.from('pagos').select('id_pedido, importe').in('id_pedido', idsPedido),
  ])

  const filasPedido = pedidos.map((p) => {
    const suyas = (lineas || []).filter((l) => l.id_pedido === p.id_pedido)

    const detalle = suyas.length === 0
      ? '(sin productos cargados)'
      : suyas
          .map((l) => {
            const nombre = l.productos?.descripcion || l.combos?.descripcion || '—'
            return `${parseFloat(l.cantidad)} x ${nombre}${l.id_combo ? ' (combo)' : ''}`
          })
          .join('\n')

    const total = suyas.reduce((acc, l) => acc + parseFloat(l.precio_venta) * parseFloat(l.cantidad), 0)
    const pagado = (pagos || [])
      .filter((pg) => pg.id_pedido === p.id_pedido)
      .reduce((acc, pg) => acc + parseFloat(pg.importe), 0)

    return {
      pedido: p,
      cliente: nombreCliente(p),
      telefono: p.clientes?.telefono || p.telefono || '',
      detalle,
      total,
      pendiente: total - pagado,
    }
  })

  // ===== documento =====
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const anchoPagina = 210
  const altoPagina = 297
  const margenIzq = 14
  const margenDer = 14

  function dibujarCabecera() {
    doc.setFillColor(232, 118, 92)
    doc.rect(0, 0, anchoPagina, 34, 'F')
    doc.setFillColor(255, 232, 224)
    doc.rect(0, 34, anchoPagina, 0.8, 'F')

    doc.setFont('times', 'bolditalic')
    doc.setFontSize(22)
    doc.setTextColor(255, 255, 255)
    doc.text('Gime Burello', anchoPagina / 2, 17, { align: 'center' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(255, 226, 216)
    doc.text('P A S T E L E R Í A   A R T E S A N A L', anchoPagina / 2, 24.5, { align: 'center' })

    doc.setDrawColor(255, 226, 216)
    doc.setLineWidth(0.3)
    doc.line(anchoPagina / 2 - 46, 23.6, anchoPagina / 2 - 34, 23.6)
    doc.line(anchoPagina / 2 + 34, 23.6, anchoPagina / 2 + 46, 23.6)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(255, 255, 255)
    doc.text('Pedidos a entregar', anchoPagina - margenDer, 11, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(255, 228, 219)
    doc.text('Generado el ' + formatearFecha(new Date().toISOString()) + ' · Uso interno', anchoPagina - margenDer, 15.5, { align: 'right' })
  }

  dibujarCabecera()

  let y = 44
  doc.setFont('times', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(74, 44, 42)
  const rango = desde === hasta
    ? 'Entregas del ' + formatearFecha(desde)
    : 'Entregas del ' + formatearFecha(desde) + ' al ' + formatearFecha(hasta)
  doc.text(rango, margenIzq, y)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(138, 106, 102)
  doc.text(
    pedidos.length === 1 ? '1 pedido' : pedidos.length + ' pedidos',
    anchoPagina - margenDer,
    y,
    { align: 'right' }
  )
  y += 5

  // referencia de los íconos de estado de pago
  doc.setFont('zapfdingbats', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(45, 106, 53)
  doc.text(ICONO_PAGADO, margenIzq, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(138, 106, 102)
  doc.text('pagado', margenIzq + 4.5, y)

  doc.setFont('zapfdingbats', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(192, 57, 43)
  doc.text(ICONO_DEBE, margenIzq + 24, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(138, 106, 102)
  doc.text('con saldo pendiente', margenIzq + 28.5, y)
  y += 4

  const encabezados = ['', 'Pedido', 'Cliente', 'Productos / Combos', 'F. pedido', 'F. entrega']
  if (incluirImportes) encabezados.push('Precio venta', 'Pendiente')

  const cuerpo = filasPedido.map((f) => {
    const fila = [
      f.pendiente > 0.01 ? ICONO_DEBE : ICONO_PAGADO,
      '#' + f.pedido.id_pedido,
      f.telefono ? f.cliente + '\n' + f.telefono : f.cliente,
      f.detalle,
      formatearFecha(f.pedido.fecha_pedido),
      formatearFecha(f.pedido.fecha_entrega),
    ]
    if (incluirImportes) {
      fila.push('$' + formatearMoneda(f.total))
      fila.push('$' + formatearMoneda(f.pendiente))
    }
    return fila
  })

  // Los anchos fijos dejan a "Productos / Combos" el espacio restante.
  // Las fechas necesitan ~21mm para que dd/mm/aaaa no se parta en dos líneas.
  const anchoColumnas = incluirImportes
    ? {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 13 },
        2: { cellWidth: 34 },
        4: { cellWidth: 21, halign: 'center' },
        5: { cellWidth: 21, halign: 'center' },
        6: { cellWidth: 20, halign: 'right' },
        7: { cellWidth: 20, halign: 'right' },
      }
    : {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 16 },
        2: { cellWidth: 50 },
        4: { cellWidth: 24, halign: 'center' },
        5: { cellWidth: 24, halign: 'center' },
      }

  const COL_ICONO = 0
  const COL_CLIENTE = 2
  const COL_PENDIENTE = 7

  autoTable(doc, {
    startY: y,
    head: [encabezados],
    body: cuerpo,
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 2, textColor: [74, 44, 42], valign: 'middle' },
    headStyles: { fillColor: [74, 44, 42], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: [253, 248, 246] },
    columnStyles: anchoColumnas,
    theme: 'grid',
    margin: { left: margenIzq, right: margenDer, bottom: 18 },
    didParseCell: (data) => {
      const fila = filasPedido[data.row.index]

      // ícono de estado de pago: tilde verde / cruz roja (ZapfDingbats)
      if (data.section === 'body' && data.column.index === COL_ICONO && fila) {
        data.cell.styles.font = 'zapfdingbats'
        data.cell.styles.fontSize = 10
        data.cell.styles.textColor = fila.pendiente > 0.01 ? [192, 57, 43] : [45, 106, 53]
      }
      // el teléfono va debajo del nombre, un punto más chico
      if (data.section === 'body' && data.column.index === COL_CLIENTE) {
        data.cell.styles.fontSize = 7.5
      }
      // pendiente en rojo si queda saldo, verde si está saldado
      if (incluirImportes && data.section === 'body' && data.column.index === COL_PENDIENTE && fila) {
        data.cell.styles.textColor = fila.pendiente > 0.01 ? [192, 57, 43] : [45, 106, 53]
        data.cell.styles.fontStyle = 'bold'
      }
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        dibujarCabecera()
        data.settings.margin.top = 40
      }
    },
  })

  let yFinal = doc.lastAutoTable.finalY + 6

  if (incluirImportes) {
    const totalVenta = filasPedido.reduce((acc, f) => acc + f.total, 0)
    const totalPendiente = filasPedido.reduce((acc, f) => acc + f.pendiente, 0)

    const cajaAncho = 80
    const cajaX = anchoPagina - margenDer - cajaAncho

    if (yFinal + 22 > altoPagina - 18) {
      doc.addPage()
      dibujarCabecera()
      yFinal = 44
    }

    doc.setFillColor(255, 245, 242)
    doc.setDrawColor(232, 118, 92)
    doc.setLineWidth(0.4)
    doc.roundedRect(cajaX, yFinal, cajaAncho, 20, 2, 2, 'FD')

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(138, 106, 102)
    doc.text('Total precio de venta', cajaX + 4, yFinal + 6)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(212, 98, 74)
    doc.text('$' + formatearMoneda(totalVenta), cajaX + cajaAncho - 4, yFinal + 6, { align: 'right' })

    doc.setDrawColor(240, 218, 211)
    doc.setLineWidth(0.2)
    doc.line(cajaX + 4, yFinal + 9, cajaX + cajaAncho - 4, yFinal + 9)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(138, 106, 102)
    doc.text('Ya cobrado', cajaX + 4, yFinal + 13.5)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(45, 106, 53)
    doc.text('$' + formatearMoneda(totalVenta - totalPendiente), cajaX + cajaAncho - 4, yFinal + 13.5, { align: 'right' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(138, 106, 102)
    doc.text('Total pendiente', cajaX + 4, yFinal + 17.5)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(totalPendiente > 0.01 ? 192 : 45, totalPendiente > 0.01 ? 57 : 106, totalPendiente > 0.01 ? 43 : 53)
    doc.text('$' + formatearMoneda(totalPendiente), cajaX + cajaAncho - 4, yFinal + 17.5, { align: 'right' })
  }

  const totalPaginas = doc.internal.getNumberOfPages()
  for (let p = 1; p <= totalPaginas; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(7)
    doc.setTextColor(166, 142, 137)
    doc.text(
      'Gime Burello Pastelería · Documento de uso interno · Página ' + p + ' de ' + totalPaginas,
      anchoPagina / 2,
      altoPagina - 8,
      { align: 'center' }
    )
  }

  const nombreArchivo = desde === hasta
    ? `Entregas_${desde}.pdf`
    : `Entregas_${desde}_a_${hasta}.pdf`

  const esMobile = typeof window !== 'undefined' && window.innerWidth <= 768
  if (esMobile) {
    window.open(doc.output('bloburl'), '_blank')
  } else {
    doc.save(nombreArchivo)
  }
}
