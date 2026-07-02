import jsPDF from 'jspdf'
import { LOGO_BASE64 } from './logoBase64'

// Genera el PDF de lista de precios.
// filas: [{ descripcion, minorista: number|null, mayorista: number|null }]
// tipoLista: 'ambos' | 'minorista' | 'mayorista'
export function generarListaPreciosPdf(filas, tipoLista) {
  const doc = new jsPDF()

  const fmt = (v) =>
    new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)

  const hoy = new Date().toLocaleString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).slice(0, 10)
  const [a, m, d] = hoy.split('-')
  const hoyFmt = `${d}/${m}/${a}`

  const incluirMin = tipoLista === 'minorista' || tipoLista === 'ambos'
  const incluirMay = tipoLista === 'mayorista' || tipoLista === 'ambos'

  const anchoPagina = 210
  const margenIzq = 14
  const anchoTabla = anchoPagina - margenIzq * 2

  // ===== BANDA DE MARCA =====
  function dibujarBanda() {
    doc.setFillColor(232, 118, 92)
    doc.rect(0, 0, anchoPagina, 34, 'F')

    // círculo blanco + logo
    doc.setFillColor(255, 255, 255)
    doc.circle(margenIzq + 11, 17, 11.5, 'F')
    try {
      doc.addImage(LOGO_BASE64, 'JPEG', margenIzq + 1.5, 7.5, 19, 19)
    } catch { /* seguimos sin logo */ }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(19)
    doc.setTextColor(255, 255, 255)
    doc.text('Gime Burello', margenIzq + 27, 16)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(255, 232, 224)
    doc.text('P A S T E L E R Í A   A R T E S A N A L', margenIzq + 27, 23)
  }

  // ===== ENCABEZADO DE TABLA =====
  const xPrecio1 = incluirMin && incluirMay ? 136 : 168
  const xPrecio2 = 168

  function dibujarHeaderTabla(y) {
    doc.setFillColor(74, 44, 42)
    doc.roundedRect(margenIzq, y, anchoTabla, 8, 1.5, 1.5, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(255, 255, 255)
    doc.text('P R O D U C T O', margenIzq + 4, y + 5.3)
    if (incluirMin) {
      doc.text('MINORISTA', incluirMay ? xPrecio1 + 14 : xPrecio2 + 14, y + 5.3, { align: 'right' })
    }
    if (incluirMay) {
      doc.text('MAYORISTA', xPrecio2 + 14, y + 5.3, { align: 'right' })
    }
    return y + 12
  }

  // ===== PRIMERA PÁGINA =====
  dibujarBanda()

  let y = 46
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(74, 44, 42)
  const titulo = tipoLista === 'minorista'
    ? 'LISTA DE PRECIOS MINORISTA'
    : tipoLista === 'mayorista'
      ? 'LISTA DE PRECIOS MAYORISTA'
      : 'LISTA DE PRECIOS'
  doc.text(titulo, anchoPagina / 2, y, { align: 'center' })

  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(138, 106, 102)
  doc.text(`Vigente desde el ${hoyFmt}`, anchoPagina / 2, y, { align: 'center' })

  y += 5
  doc.setDrawColor(232, 118, 92)
  doc.setLineWidth(0.8)
  doc.line(anchoPagina / 2 - 15, y, anchoPagina / 2 + 15, y)

  y += 8
  y = dibujarHeaderTabla(y)

  // ===== FILAS =====
  const filasFiltradas = filas.filter((f) => {
    if (tipoLista === 'minorista') return f.minorista !== null
    if (tipoLista === 'mayorista') return f.mayorista !== null
    return f.minorista !== null || f.mayorista !== null
  })

  let paginaActual = 1

  filasFiltradas.forEach((f, idx) => {
    if (y > 272) {
      // pie de página
      doc.setFontSize(7.5)
      doc.setTextColor(166, 142, 137)
      doc.text(`Página ${paginaActual}`, anchoPagina - margenIzq, 288, { align: 'right' })
      doc.addPage()
      paginaActual++
      dibujarBanda()
      y = 46
      y = dibujarHeaderTabla(y)
    }

    // fondo alternado suave
    if (idx % 2 === 1) {
      doc.setFillColor(253, 248, 246)
      doc.rect(margenIzq, y - 4.5, anchoTabla, 7.5, 'F')
    }

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(74, 44, 42)
    doc.text(f.descripcion, margenIzq + 4, y)

    // puntos de guía
    const anchoNombre = doc.getTextWidth(f.descripcion)
    const xInicioPuntos = margenIzq + 6 + anchoNombre
    const xFinPuntos = (incluirMin && incluirMay ? xPrecio1 : xPrecio2) - 16
    if (xFinPuntos > xInicioPuntos + 4) {
      doc.setDrawColor(216, 196, 190)
      doc.setLineWidth(0.3)
      doc.setLineDashPattern([0.6, 1.4], 0)
      doc.line(xInicioPuntos, y - 0.8, xFinPuntos, y - 0.8)
      doc.setLineDashPattern([], 0)
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)

    if (incluirMin) {
      const xCol = incluirMay ? xPrecio1 : xPrecio2
      if (f.minorista !== null) {
        doc.setTextColor(74, 44, 42)
        doc.text(`$${fmt(f.minorista)}`, xCol + 14, y, { align: 'right' })
      } else {
        doc.setTextColor(200, 188, 184)
        doc.text('—', xCol + 14, y, { align: 'right' })
      }
    }

    if (incluirMay) {
      if (f.mayorista !== null) {
        doc.setTextColor(124, 58, 237)
        doc.text(`$${fmt(f.mayorista)}`, xPrecio2 + 14, y, { align: 'right' })
      } else {
        doc.setTextColor(200, 188, 184)
        doc.text('—', xPrecio2 + 14, y, { align: 'right' })
      }
    }

    y += 7.5
  })

  // ===== PIE FINAL =====
  y += 4
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7.5)
  doc.setTextColor(166, 142, 137)
  doc.text('Precios expresados en pesos argentinos, sujetos a modificación sin previo aviso.', margenIzq, Math.min(y, 288))
  doc.text(`Página ${paginaActual}`, anchoPagina - margenIzq, 288, { align: 'right' })

  const nombreArchivo = `Lista_Precios_${tipoLista}_${hoy}.pdf`
  if (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
    window.open(doc.output('bloburl'), '_blank')
  } else {
    doc.save(nombreArchivo)
  }
}

// Obtiene los precios vigentes desde la BD y genera el PDF (para uso desde mobile)
export async function generarListaPreciosDesdeBD(supabase, tipoLista) {
  const hoy = new Date().toLocaleString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).slice(0, 10)

  const { data: productos } = await supabase
    .from('productos')
    .select('id_producto, descripcion')
    .order('descripcion')

  const { data: precios } = await supabase
    .from('precios')
    .select('*')
    .lte('fecha_inicio', hoy)
    .gte('fecha_fin', hoy)

  const filas = (productos || []).map((p) => {
    const pr = (precios || []).find((x) => x.id_producto === p.id_producto)
    return {
      descripcion: p.descripcion,
      minorista: pr ? parseFloat(pr.precio_venta) : null,
      mayorista: pr?.precio_mayorista ? parseFloat(pr.precio_mayorista) : null,
    }
  })

  generarListaPreciosPdf(filas, tipoLista)
}
