import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

// ============================================================
// PDF de fichas tecnicas de recetas (ingredientes + costos)
// Reutiliza la MISMA logica de costo vigente que Recetas.jsx:
//   precio_unitario = costo.precio / cantidad_extraida(costo.presentacion)
//   subtotal_ingrediente = precio_unitario * detalle_receta.cantidad
// Si un ingrediente no tiene costo vigente hoy, se marca
// "Sin costo cargado" y el total de esa receta queda incompleto.
// ============================================================

function extraerCantidadPresentacion(presentacion) {
  if (!presentacion) return null
  const match = presentacion.match(/[\d.,]+/)
  if (!match) return null
  return parseFloat(match[0].replace(',', '.'))
}

function formatearFecha(fecha) {
  if (!fecha) return ''
  const [anio, mes, dia] = fecha.slice(0, 10).split('-')
  return `${dia}/${mes}/${anio}`
}

function formatearMoneda(n) {
  return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

// ------------------------------------------------------------
// Trae, para el listado de seleccion: id, descripcion, rinde,
// vigencia, y el producto asociado (si tiene alguno).
// ------------------------------------------------------------
export async function obtenerRecetasParaSeleccion(supabase) {
  const [{ data: recetas, error: errRecetas }, { data: productos, error: errProductos }] = await Promise.all([
    supabase
      .from('recetas')
      .select('id_receta, descripcion, cantidad_producto_final, fecha_inicio, fecha_fin, rendimientos(descripcion, cantidad_unidades)')
      .order('descripcion'),
    supabase.from('productos').select('id_receta, descripcion'),
  ])

  if (errRecetas) throw new Error('No se pudieron cargar las recetas: ' + errRecetas.message)

  const nombreProductoPorReceta = {}
  ;(productos || []).forEach((p) => {
    if (p.id_receta != null && !nombreProductoPorReceta[p.id_receta]) {
      nombreProductoPorReceta[p.id_receta] = p.descripcion
    }
  })

  return (recetas || [])
    .map((r) => ({
      ...r,
      productoAsociado: nombreProductoPorReceta[r.id_receta] || null,
      sinProducto: !nombreProductoPorReceta[r.id_receta],
    }))
    .sort((a, b) => a.descripcion.localeCompare(b.descripcion, 'es'))
}

// ------------------------------------------------------------
// Arma el detalle completo (ingredientes + costos) de una receta,
// igual que hace Recetas.jsx al abrir el detalle.
// ------------------------------------------------------------
async function armarDetalleReceta(supabase, receta) {
  const hoy = new Date().toISOString().slice(0, 10)

  const { data: detalle, error } = await supabase
    .from('detalle_receta')
    .select('*, materias_primas(descripcion)')
    .eq('id_receta', receta.id_receta)
    .order('secuencia', { ascending: true })

  if (error) throw new Error('Error al cargar el detalle de "' + receta.descripcion + '": ' + error.message)

  const ingredientes = await Promise.all(
    (detalle || []).map(async (ing) => {
      const { data: costos } = await supabase
        .from('costos_materia_prima')
        .select('*')
        .eq('id_materia_prima', ing.id_materia_prima)
        .lte('fecha_inicio', hoy)
        .gte('fecha_fin', hoy)
        .order('fecha_inicio', { ascending: false })
        .limit(1)

      const costo = costos && costos.length > 0 ? costos[0] : null
      let costoUnitario = null
      let subtotal = null

      if (costo) {
        const cantidadPresentacion = extraerCantidadPresentacion(costo.presentacion)
        if (cantidadPresentacion && cantidadPresentacion > 0) {
          costoUnitario = parseFloat(costo.precio) / cantidadPresentacion
          subtotal = costoUnitario * parseFloat(ing.cantidad)
        }
      }

      return {
        nombre: ing.materias_primas?.descripcion || 'Materia prima',
        cantidad: ing.cantidad,
        unidad: ing.unidad_medida,
        costoUnitario,
        subtotal,
        sinCosto: subtotal === null,
      }
    })
  )

  const algunSinCosto = ingredientes.some((i) => i.sinCosto)
  const total = algunSinCosto ? null : ingredientes.reduce((a, i) => a + (i.subtotal || 0), 0)

  return { ingredientes, total, algunSinCosto }
}

// ------------------------------------------------------------
// Genera el PDF con una o varias recetas. Si entra mas de una
// en la misma hoja, van separadas por una linea punteada; si no
// entra, pasa a la hoja siguiente (con su propia cabecera).
// ------------------------------------------------------------
export async function generarPdfRecetas(supabase, recetasSeleccionadas) {
  if (!recetasSeleccionadas || recetasSeleccionadas.length === 0) {
    throw new Error('No hay recetas seleccionadas.')
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const anchoPagina = 210
  const altoPagina = 297
  const margenIzq = 16
  const margenDer = 16
  const anchoUtil = anchoPagina - margenIzq - margenDer
  const margenInferior = 18

  function dibujarCabecera() {
    // banda terracota (idéntica a la de la lista de precios)
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
    doc.text('Fichas técnicas de recetas', anchoPagina - margenDer, 11, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(255, 228, 219)
    doc.text('Generado el ' + formatearFecha(new Date().toISOString()) + ' · Uso interno', anchoPagina - margenDer, 15.5, { align: 'right' })

    return 44
  }

  let y = dibujarCabecera()
  let primeraEnHoja = true

  for (let idx = 0; idx < recetasSeleccionadas.length; idx++) {
    const receta = recetasSeleccionadas[idx]
    const { ingredientes, total, algunSinCosto } = await armarDetalleReceta(supabase, receta)

    // alto estimado de esta receta, para decidir si entra en la hoja actual
    const altoEstimado = 26 + ingredientes.length * 7 + 24
    if (!primeraEnHoja && y + altoEstimado > altoPagina - margenInferior) {
      doc.addPage()
      y = dibujarCabecera()
      primeraEnHoja = true
    }

    if (!primeraEnHoja) {
      doc.setDrawColor(240, 218, 211)
      doc.setLineWidth(0.3)
      doc.setLineDashPattern([1.2, 1.2], 0)
      doc.line(margenIzq, y, anchoPagina - margenDer, y)
      doc.setLineDashPattern([], 0)
      y += 8
    }

    // Titulo + rinde
    doc.setFont('times', 'bold')
    doc.setFontSize(15)
    doc.setTextColor(74, 44, 42)
    doc.text(receta.descripcion, margenIzq, y)

    const rendimientosReceta = (receta.rendimientos && receta.rendimientos.length > 0)
      ? receta.rendimientos
      : (receta.cantidad_producto_final ? [{ descripcion: `${receta.cantidad_producto_final} unidad(es)`, cantidad_unidades: receta.cantidad_producto_final }] : [])

    const rindeTexto = rendimientosReceta.length > 0
      ? 'Rinde: ' + rendimientosReceta.map((r) => r.descripcion).join(' · ')
      : 'Rinde —'
    doc.setFontSize(8.5)
    doc.setTextColor(212, 98, 74)
    doc.text(rindeTexto, anchoPagina - margenDer, y, { align: 'right' })
    y += 6

    // Meta: vigencia
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(138, 106, 102)
    const vigenciaFin = receta.fecha_fin && receta.fecha_fin.slice(0, 10) === '3000-12-31'
      ? 'Indefinida'
      : formatearFecha(receta.fecha_fin)
    doc.text('Vigente desde ' + formatearFecha(receta.fecha_inicio) + ' hasta ' + vigenciaFin, margenIzq, y)
    if (receta.productoAsociado) {
      doc.setTextColor(138, 106, 102)
      doc.text('Producto asociado: ' + receta.productoAsociado, anchoPagina - margenDer, y, { align: 'right' })
    }
    y += 5

    // Tabla de ingredientes
    const filas = ingredientes.map((i) => [
      i.nombre,
      String(i.cantidad),
      i.unidad || '',
      i.sinCosto ? 'Sin costo cargado' : ('$' + formatearMoneda(i.costoUnitario)),
      i.sinCosto ? '—' : ('$' + formatearMoneda(i.subtotal)),
    ])

    autoTable(doc, {
      startY: y,
      head: [['Ingrediente', 'Cantidad', 'Unidad', 'Costo unitario', 'Subtotal']],
      body: filas,
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2.2, textColor: [74, 44, 42] },
      headStyles: { fillColor: [74, 44, 42], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: [253, 248, 246] },
      columnStyles: {
        1: { halign: 'right', cellWidth: 22 },
        2: { cellWidth: 24 },
        3: { halign: 'right', cellWidth: 34 },
        4: { halign: 'right', cellWidth: 30 },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && (data.column.index === 3 || data.column.index === 4)) {
          const fila = ingredientes[data.row.index]
          if (fila && fila.sinCosto) {
            data.cell.styles.textColor = [200, 35, 35]
            data.cell.styles.fontStyle = 'bold'
          }
        }
      },
      theme: 'grid',
      margin: { left: margenIzq, right: margenDer },
    })

    y = doc.lastAutoTable.finalY + 5

    // Totales, como una cajita alineada a la derecha (igual que el mockup)
    const cajaAncho = 78
    const cajaX = anchoPagina - margenDer - cajaAncho
    const rendsConCosto = (!algunSinCosto && total > 0)
      ? rendimientosReceta.filter((r) => parseFloat(r.cantidad_unidades) > 0)
      : []
    const cajaAlto = algunSinCosto ? 14 : (rendsConCosto.length > 0 ? 11.5 + rendsConCosto.length * 4.5 : 10)

    doc.setFillColor(255, 245, 242)
    doc.setDrawColor(232, 118, 92)
    doc.setLineWidth(0.4)
    doc.roundedRect(cajaX, y, cajaAncho, cajaAlto, 2, 2, 'FD')

    if (algunSinCosto) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.setTextColor(200, 35, 35)
      doc.text('Costo total: incompleto', cajaX + cajaAncho / 2, y + 6, { align: 'center' })
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.5)
      doc.text('(falta el costo de algún ingrediente)', cajaX + cajaAncho / 2, y + 10.5, { align: 'center' })
    } else {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(138, 106, 102)
      doc.text('Costo total de la receta', cajaX + 4, y + 5.5)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9.5)
      doc.setTextColor(212, 98, 74)
      doc.text('$' + formatearMoneda(total), cajaX + cajaAncho - 4, y + 5.5, { align: 'right' })

      if (rendsConCosto.length > 0) {
        doc.setDrawColor(240, 218, 211)
        doc.setLineWidth(0.2)
        doc.line(cajaX + 4, y + 8.5, cajaX + cajaAncho - 4, y + 8.5)

        let yLinea = y + 13
        for (const rend of rendsConCosto) {
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(7)
          doc.setTextColor(138, 106, 102)
          doc.text(rend.descripcion, cajaX + 4, yLinea)
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(8)
          doc.setTextColor(91, 33, 145)
          doc.text(
            '$' + formatearMoneda(total / parseFloat(rend.cantidad_unidades)) + ' c/u',
            cajaX + cajaAncho - 4,
            yLinea,
            { align: 'right' }
          )
          yLinea += 4.5
        }
      }
    }

    y += cajaAlto + 6

    primeraEnHoja = false
  }

  // pie de pagina en todas las hojas
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

  const nombreArchivo = recetasSeleccionadas.length === 1
    ? `Receta_${recetasSeleccionadas[0].descripcion.replace(/[^a-zA-Z0-9]+/g, '_')}.pdf`
    : `Recetas_${new Date().toISOString().slice(0, 10)}.pdf`

  const esMobile = typeof window !== 'undefined' && window.innerWidth <= 768
  if (esMobile) {
    window.open(doc.output('bloburl'), '_blank')
  } else {
    doc.save(nombreArchivo)
  }
}
