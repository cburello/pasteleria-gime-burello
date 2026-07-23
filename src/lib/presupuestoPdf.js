import jsPDF from 'jspdf'

const fmt = (v) =>
  new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)

function formatearFecha(f) {
  if (!f) return ''
  const [a, m, d] = f.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

// Genera el PDF de un presupuesto con el mismo estilo de marca que la lista de precios.
// presupuesto: { id_presupuesto, nombreCliente, domicilio, telefono, fecha_presupuesto, observaciones }
// lineas: [{ descripcion, cantidad, precio_venta }]
export function generarPresupuestoPdf(presupuesto, lineas) {
  const doc = new jsPDF()

  const anchoPagina = 210
  const margenIzq = 14
  const anchoTabla = anchoPagina - margenIzq * 2

  function dibujarBanda() {
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
  }

  const xCant = 132
  const xPrecio = 160
  const xSubtotal = 196

  function dibujarHeaderTabla(y) {
    doc.setFillColor(74, 44, 42)
    doc.roundedRect(margenIzq, y, anchoTabla, 8, 1.5, 1.5, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(255, 255, 255)
    doc.text('D E S C R I P C I Ó N', margenIzq + 4, y + 5.3)
    doc.text('CANT.', xCant, y + 5.3, { align: 'right' })
    doc.text('P. UNIT.', xPrecio, y + 5.3, { align: 'right' })
    doc.text('SUBTOTAL', xSubtotal, y + 5.3, { align: 'right' })
    return y + 12
  }

  dibujarBanda()

  let y = 46
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(74, 44, 42)
  doc.text('PRESUPUESTO', anchoPagina / 2, y, { align: 'center' })

  y += 6
  const hoy = new Date().toLocaleString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).slice(0, 10)
  const fechaEmision = presupuesto.fecha_presupuesto || hoy
  let fechaVigencia = presupuesto.fecha_valido_hasta
  if (!fechaVigencia) {
    const fv = new Date(fechaEmision + 'T00:00:00')
    fv.setDate(fv.getDate() + 7)
    fechaVigencia = fv.toISOString()
  }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(138, 106, 102)
  doc.text(
    `N° ${presupuesto.id_presupuesto || '—'}  ·  Emitido el ${formatearFecha(fechaEmision)}  ·  Válido hasta el ${formatearFecha(fechaVigencia)}`,
    anchoPagina / 2, y, { align: 'center' }
  )

  y += 5
  doc.setDrawColor(232, 118, 92)
  doc.setLineWidth(0.8)
  doc.line(anchoPagina / 2 - 15, y, anchoPagina / 2 + 15, y)

  // ===== datos del cliente =====
  y += 10
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(74, 44, 42)
  doc.text(presupuesto.nombreCliente || 'Consumidor final', margenIzq, y)

  const datosContacto = [presupuesto.domicilio, presupuesto.telefono].filter(Boolean).join('  ·  ')
  if (datosContacto) {
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(138, 106, 102)
    doc.text(datosContacto, margenIzq, y)
  }

  y += 8
  y = dibujarHeaderTabla(y)

  // ===== líneas =====
  let total = 0
  let paginaActual = 1

  lineas.forEach((l, idx) => {
    if (y > 260) {
      doc.setFontSize(7.5)
      doc.setTextColor(166, 142, 137)
      doc.text(`Página ${paginaActual}`, anchoPagina - margenIzq, 288, { align: 'right' })
      doc.addPage()
      paginaActual++
      dibujarBanda()
      y = 46
      y = dibujarHeaderTabla(y)
    }

    if (idx % 2 === 1) {
      doc.setFillColor(253, 248, 246)
      doc.rect(margenIzq, y - 4.5, anchoTabla, 7.5, 'F')
    }

    const subtotal = parseFloat(l.cantidad) * parseFloat(l.precio_venta)
    total += subtotal

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(74, 44, 42)
    const descripcionCorta = doc.splitTextToSize(l.descripcion, xCant - margenIzq - 10)[0]
    doc.text(descripcionCorta, margenIzq + 4, y)

    doc.text(String(l.cantidad), xCant, y, { align: 'right' })
    doc.text(`$${fmt(l.precio_venta)}`, xPrecio, y, { align: 'right' })
    doc.setFont('helvetica', 'bold')
    doc.text(`$${fmt(subtotal)}`, xSubtotal, y, { align: 'right' })

    y += 7.5
  })

  // ===== total =====
  y += 3
  doc.setDrawColor(216, 196, 190)
  doc.setLineWidth(0.3)
  doc.line(margenIzq, y, anchoPagina - margenIzq, y)

  y += 7
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(74, 44, 42)
  doc.text('TOTAL', xPrecio, y, { align: 'right' })
  doc.text(`$${fmt(total)}`, xSubtotal, y, { align: 'right' })

  // ===== observaciones =====
  if (presupuesto.observaciones) {
    y += 10
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9)
    doc.setTextColor(138, 106, 102)
    const obsLineas = doc.splitTextToSize(presupuesto.observaciones, anchoTabla)
    doc.text(obsLineas, margenIzq, Math.min(y, 280))
    y += obsLineas.length * 4.5
  }

  // ===== pie =====
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7.5)
  doc.setTextColor(166, 142, 137)
  doc.text('Sujeto a confirmación de disponibilidad.', margenIzq, Math.min(y + 8, 288))
  doc.text(`Página ${paginaActual}`, anchoPagina - margenIzq, 288, { align: 'right' })

  const nombreArchivo = `Presupuesto_${presupuesto.id_presupuesto || 'nuevo'}_${hoy}.pdf`
  if (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
    window.open(doc.output('bloburl'), '_blank')
  } else {
    doc.save(nombreArchivo)
  }
}
