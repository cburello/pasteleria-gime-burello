import jsPDF from 'jspdf'
import logoAsset from '../assets/logo.jpeg'
import poppinsRegularUrl from '../assets/fonts/Poppins-Regular.ttf?url'
import poppinsBoldUrl from '../assets/fonts/Poppins-Bold.ttf?url'
import poppinsItalicUrl from '../assets/fonts/Poppins-Italic.ttf?url'
import playfairBoldUrl from '../assets/fonts/PlayfairDisplay-Bold.ttf?url'

// ============================================================
// Utilidades de imagen (foto de producto + isotipo "Gime Burello")
// ============================================================

function cargarImagenElemento(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('No se pudo cargar la imagen: ' + url))
    img.src = url
  })
}

// Recorta/escala una imagen para llenar por completo un rectángulo destino
// (equivalente a "object-fit: cover"), y la devuelve como data URL JPEG.
function recortarCover(img, anchoDestinoPx, altoDestinoPx) {
  const canvas = document.createElement('canvas')
  canvas.width = anchoDestinoPx
  canvas.height = altoDestinoPx
  const ctx = canvas.getContext('2d')
  const escala = Math.max(anchoDestinoPx / img.width, altoDestinoPx / img.height)
  const anchoFuente = anchoDestinoPx / escala
  const altoFuente = altoDestinoPx / escala
  const xFuente = (img.width - anchoFuente) / 2
  const yFuente = (img.height - altoFuente) / 2
  ctx.drawImage(img, xFuente, yFuente, anchoFuente, altoFuente, 0, 0, anchoDestinoPx, altoDestinoPx)
  return canvas.toDataURL('image/jpeg', 0.85)
}

// Prepara un pool de fotos de producto ya recortadas, listas para usar con
// doc.addImage(). Se sortean y limitan de antemano porque no sabemos cuántas
// páginas va a tener la lista hasta que se termina de armar.
// Las fotos que fallan al cargar (borradas, sin conexión, etc.) se descartan
// en silencio: nunca rompen la generación del PDF.
export async function prepararFotosProductos(urls, anchoMm, altoMm, maxFotos = 25) {
  const DPI = 130
  const anchoPx = Math.round((anchoMm / 25.4) * DPI)
  const altoPx = Math.round((altoMm / 25.4) * DPI)

  const candidatos = [...new Set((urls || []).filter(Boolean))]
  for (let i = candidatos.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[candidatos[i], candidatos[j]] = [candidatos[j], candidatos[i]]
  }

  const resultados = []
  for (const url of candidatos.slice(0, maxFotos)) {
    try {
      const img = await cargarImagenElemento(url)
      resultados.push(recortarCover(img, anchoPx, altoPx))
    } catch {
      // se descarta silenciosamente
    }
  }
  return resultados
}

// Recorta del logo real (src/assets/logo.jpeg) solo el isotipo "Gime Burello"
// con su subrayado, sin "PASTELERIA" ni las flores del fondo. El original es
// texto crema sobre fondo terracota: se separa el trazo del fondo por
// luminancia y se recompone en color terracota sobre el crema de la lista
// (#f5f4e0), para que quede legible sobre el nuevo fondo de la página.
// Se calcula una sola vez y se cachea en memoria para el resto de la sesión.
let _logoWordmarkPromise = null
function obtenerLogoWordmark() {
  if (!_logoWordmarkPromise) {
    _logoWordmarkPromise = cargarImagenElemento(logoAsset).then((img) => {
      const sx = img.width * 0.095
      const sy = img.height * 0.315
      const sw = img.width * (0.895 - 0.095)
      const sh = img.height * (0.645 - 0.315)
      const destW = 900
      const destH = Math.round(sh * (destW / sw))
      const canvas = document.createElement('canvas')
      canvas.width = destW
      canvas.height = destH
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, destW, destH)

      const imageData = ctx.getImageData(0, 0, destW, destH)
      const data = imageData.data
      const bg = [245, 244, 224] // #f5f4e0
      const fg = [232, 118, 92] // terracota de marca
      const bajo = 190
      const alto = 215
      for (let i = 0; i < data.length; i += 4) {
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
        let alpha = (lum - bajo) / (alto - bajo)
        if (alpha < 0.12) alpha = 0
        if (alpha > 1) alpha = 1
        data[i] = bg[0] * (1 - alpha) + fg[0] * alpha
        data[i + 1] = bg[1] * (1 - alpha) + fg[1] * alpha
        data[i + 2] = bg[2] * (1 - alpha) + fg[2] * alpha
      }
      ctx.putImageData(imageData, 0, 0)

      return { dataUrl: canvas.toDataURL('image/jpeg', 0.92), ratio: destH / destW }
    })
  }
  return _logoWordmarkPromise
}

// ============================================================
// Tipografías de marca (Playfair Display + Poppins, las mismas que usa
// la app y el sitio web) embebidas en el PDF en vez de Helvetica/Times.
// ============================================================

function bufferABase64(buffer) {
  let binario = ''
  const bytes = new Uint8Array(buffer)
  const tamanioBloque = 0x8000
  for (let i = 0; i < bytes.length; i += tamanioBloque) {
    binario += String.fromCharCode.apply(null, bytes.subarray(i, i + tamanioBloque))
  }
  return btoa(binario)
}

async function cargarFuenteBase64(url) {
  const resp = await fetch(url)
  const buffer = await resp.arrayBuffer()
  return bufferABase64(buffer)
}

let _fuentesPromise = null
function obtenerFuentesBase64() {
  if (!_fuentesPromise) {
    _fuentesPromise = Promise.all([
      cargarFuenteBase64(poppinsRegularUrl),
      cargarFuenteBase64(poppinsBoldUrl),
      cargarFuenteBase64(poppinsItalicUrl),
      cargarFuenteBase64(playfairBoldUrl),
    ]).then(([regular, bold, italic, playfair]) => ({ regular, bold, italic, playfair }))
  }
  return _fuentesPromise
}

// Registra las fuentes en el documento (hay que hacerlo en cada instancia de
// jsPDF, pero el fetch + base64 de los archivos se cachea una sola vez).
async function registrarFuentesDeMarca(doc) {
  const f = await obtenerFuentesBase64()
  doc.addFileToVFS('Poppins-Regular.ttf', f.regular)
  doc.addFont('Poppins-Regular.ttf', 'Poppins', 'normal')
  doc.addFileToVFS('Poppins-Bold.ttf', f.bold)
  doc.addFont('Poppins-Bold.ttf', 'Poppins', 'bold')
  doc.addFileToVFS('Poppins-Italic.ttf', f.italic)
  doc.addFont('Poppins-Italic.ttf', 'Poppins', 'italic')
  doc.addFileToVFS('PlayfairDisplay-Bold.ttf', f.playfair)
  doc.addFont('PlayfairDisplay-Bold.ttf', 'PlayfairDisplay', 'bold')
}

// ============================================================
// Generación del PDF
// ============================================================

// Genera el PDF de lista de precios.
// filas: [{ descripcion, minorista: number|null, mayorista: number|null }]
// tipoLista: 'ambos' | 'minorista' | 'mayorista'
// fotos: data URLs ya recortadas (ver prepararFotosProductos). Si viene vacío
//        o no se pasa, se usa el diseño clásico a todo el ancho, sin fotos.
export async function generarListaPreciosPdf(filas, tipoLista, fotos = []) {
  const doc = new jsPDF()
  await registrarFuentesDeMarca(doc)

  const fmt = (v) =>
    new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)

  const hoy = new Date().toLocaleString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).slice(0, 10)
  const [a, m, d] = hoy.split('-')
  const hoyFmt = `${d}/${m}/${a}`

  const incluirMin = tipoLista === 'minorista' || tipoLista === 'ambos'
  const incluirMay = tipoLista === 'mayorista' || tipoLista === 'ambos'

  const anchoPagina = 210
  const altoPagina = 297
  const margenDer = 14

  const usaFotos = fotos.length > 0
  const anchoFotoPanel = usaFotos ? anchoPagina * 0.4 : 0
  const xContenido = usaFotos ? anchoFotoPanel + 10 : 14
  const anchoContenido = anchoPagina - xContenido - margenDer
  const xDerecha = xContenido + anchoContenido

  const logo = usaFotos ? await obtenerLogoWordmark() : null

  // ===== VIGENCIA (solo en modo 'ambos') =====
  const mostrarVigencia = tipoLista === 'ambos'
  const INDEFINIDA = '3000-12-31'

  // hoy y el limite: un precio con fecha_inicio ANTERIOR a este limite
  // lleva mas de un mes vigente -> se marca en rojo (candidato a revisar)
  const hoyDate = new Date(hoy + 'T00:00:00')
  const limiteMes = new Date(hoyDate)
  limiteMes.setMonth(limiteMes.getMonth() - 1)

  function fechaCorta(f) {
    if (!f) return ''
    const [a, m, d] = f.slice(0, 10).split('-')
    return `${d}/${m}/${a.slice(2)}`
  }

  function textoVigencia(f) {
    if (!f.fecha_inicio) return '—'
    const desde = fechaCorta(f.fecha_inicio)
    const fin = (f.fecha_fin || '').slice(0, 10)
    if (!fin || fin === INDEFINIDA) return desde
    return `${desde} a ${fechaCorta(fin)}`
  }

  function vigenciaVencida(f) {
    if (!f.fecha_inicio) return false
    return new Date(f.fecha_inicio.slice(0, 10) + 'T00:00:00') < limiteMes
  }

  function truncarTexto(texto, anchoMax) {
    if (doc.getTextWidth(texto) <= anchoMax) return texto
    let recortado = texto
    while (recortado.length > 1 && doc.getTextWidth(recortado + '…') > anchoMax) {
      recortado = recortado.slice(0, -1)
    }
    return recortado + '…'
  }

  // ===== COLUMNAS (proporcionales al ancho de contenido disponible) =====
  const FRAC_PRECIO_UNICO = 0.154
  const FRAC_PRECIO_DUAL = 0.33
  const FRAC_VIGENCIA = 0.549

  const xPrecio2 = xDerecha - anchoContenido * FRAC_PRECIO_UNICO
  const xPrecio1 = incluirMin && incluirMay ? xDerecha - anchoContenido * FRAC_PRECIO_DUAL : xPrecio2
  const xVigencia = xDerecha - anchoContenido * FRAC_VIGENCIA

  function dibujarHeaderTabla(y) {
    doc.setFillColor(74, 44, 42)
    doc.roundedRect(xContenido, y, anchoContenido, 8, 1.5, 1.5, 'F')
    doc.setFont('Poppins', 'bold')
    doc.setFontSize(usaFotos ? 7 : 8)
    doc.setTextColor(255, 255, 255)
    doc.text('Producto', xContenido + 4, y + 5.3)
    if (mostrarVigencia) {
      doc.text('Vigencia', xVigencia, y + 5.3)
    }
    if (incluirMin) {
      doc.text('Minorista', incluirMay ? xPrecio1 + 14 : xPrecio2 + 14, y + 5.3, { align: 'right' })
    }
    if (incluirMay) {
      doc.text('Mayorista', xPrecio2 + 14, y + 5.3, { align: 'right' })
    }
    return y + 12
  }

  // ===== ENCABEZADO DE MARCA: con foto (isotipo real) o clásico (banda) =====

  function dibujarBandaClasica() {
    doc.setFillColor(232, 118, 92)
    doc.rect(0, 0, anchoPagina, 34, 'F')
    doc.setFillColor(255, 232, 224)
    doc.rect(0, 34, anchoPagina, 0.8, 'F')
    doc.setFont('PlayfairDisplay', 'bold')
    doc.setFontSize(22)
    doc.setTextColor(255, 255, 255)
    doc.text('Gime Burello', anchoPagina / 2, 17, { align: 'center' })
    doc.setFont('Poppins', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(255, 226, 216)
    doc.text('P A S T E L E R Í A   A R T E S A N A L', anchoPagina / 2, 24.5, { align: 'center' })
    doc.setDrawColor(255, 226, 216)
    doc.setLineWidth(0.3)
    doc.line(anchoPagina / 2 - 46, 23.6, anchoPagina / 2 - 34, 23.6)
    doc.line(anchoPagina / 2 + 34, 23.6, anchoPagina / 2 + 46, 23.6)
  }

  const titulo = tipoLista === 'minorista'
    ? 'LISTA DE PRECIOS MINORISTA'
    : tipoLista === 'mayorista'
      ? 'LISTA DE PRECIOS MAYORISTA'
      : 'LISTA DE PRECIOS'

  // Título + vigencia + regla, centrados en el área de contenido (comparte
  // el mismo bloque tanto si hay foto como si es la primera página clásica).
  function dibujarTituloYVigencia(y) {
    doc.setFont('PlayfairDisplay', 'bold')
    doc.setFontSize(usaFotos ? 12 : 14)
    doc.setTextColor(74, 44, 42)
    doc.text(titulo, xContenido + anchoContenido / 2, y, { align: 'center' })

    y += 6
    doc.setFont('Poppins', 'normal')
    doc.setFontSize(usaFotos ? 7.5 : 9)
    doc.setTextColor(138, 106, 102)
    doc.text(`Vigente desde el ${hoyFmt}`, xContenido + anchoContenido / 2, y, { align: 'center' })

    y += 5
    doc.setDrawColor(232, 118, 92)
    doc.setLineWidth(0.8)
    doc.line(xContenido + anchoContenido / 2 - 15, y, xContenido + anchoContenido / 2 + 15, y)

    return y + 8
  }

  // Elige una foto distinta a la de la última página (si hay más de una) y
  // dibuja el panel izquierdo a página completa.
  let ultimaFotoUsada = null
  function dibujarPanelFoto() {
    const disponibles = fotos.length > 1 ? fotos.filter((f) => f !== ultimaFotoUsada) : fotos
    const foto = disponibles[Math.floor(Math.random() * disponibles.length)]
    ultimaFotoUsada = foto
    doc.addImage(foto, 'JPEG', 0, 0, anchoFotoPanel, altoPagina)
  }

  function dibujarEncabezadoConFoto() {
    dibujarPanelFoto()

    doc.setFillColor(245, 244, 224)
    doc.rect(anchoFotoPanel, 0, anchoPagina - anchoFotoPanel, altoPagina, 'F')

    let y = 20
    const logoAncho = 50
    const logoAlto = logoAncho * logo.ratio
    doc.addImage(logo.dataUrl, 'JPEG', xContenido + (anchoContenido - logoAncho) / 2, y, logoAncho, logoAlto)
    y += logoAlto + 6

    doc.setFont('Poppins', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(199, 137, 122)
    doc.text('P A S T E L E R Í A   A R T E S A N A L', xContenido + anchoContenido / 2, y, { align: 'center' })

    y += 8
    y = dibujarTituloYVigencia(y)
    return dibujarHeaderTabla(y)
  }

  function nuevaPagina(esPrimera) {
    if (!esPrimera) doc.addPage()
    if (usaFotos) return dibujarEncabezadoConFoto()

    dibujarBandaClasica()
    return dibujarHeaderTabla(dibujarTituloYVigencia(46))
  }

  // ===== PRIMERA PÁGINA =====
  let y = nuevaPagina(true)

  // ===== FILAS =====
  const filasFiltradas = filas.filter((f) => {
    if (tipoLista === 'minorista') return f.minorista !== null
    if (tipoLista === 'mayorista') return f.mayorista !== null
    return f.minorista !== null || f.mayorista !== null
  })

  let paginaActual = 1
  const limiteFila = usaFotos ? altoPagina - 25 : 272

  function dibujarPieDePagina() {
    doc.setFont('Poppins', 'italic')
    doc.setFontSize(usaFotos ? 6.5 : 7.5)
    doc.setTextColor(166, 142, 137)
    doc.text(
      'Precios sujetos a modificación sin previo aviso.',
      xContenido,
      altoPagina - 9,
      { maxWidth: anchoContenido }
    )
    doc.text(`Página ${paginaActual}`, xDerecha, altoPagina - 9, { align: 'right' })
  }

  filasFiltradas.forEach((f, idx) => {
    if (y > limiteFila) {
      dibujarPieDePagina()
      paginaActual++
      y = nuevaPagina(false)
    }

    if (idx % 2 === 1) {
      doc.setFillColor(253, 248, 246)
      doc.rect(xContenido, y - 4.5, anchoContenido, 7.5, 'F')
    }

    doc.setFont('Poppins', 'normal')
    doc.setFontSize(usaFotos ? 8.5 : 10)
    doc.setTextColor(74, 44, 42)
    const anchoNombreDisponible = (mostrarVigencia ? xVigencia : xPrecio1) - xContenido - 8
    const nombreMostrado = truncarTexto(f.descripcion, anchoNombreDisponible)
    doc.text(nombreMostrado, xContenido + 4, y)

    // puntos de guía
    const anchoNombre = doc.getTextWidth(nombreMostrado)
    const xInicioPuntos = xContenido + 6 + anchoNombre
    const xFinPuntos = mostrarVigencia ? xVigencia - 4 : (incluirMin && incluirMay ? xPrecio1 : xPrecio2) - 16
    if (xFinPuntos > xInicioPuntos + 4) {
      doc.setDrawColor(216, 196, 190)
      doc.setLineWidth(0.3)
      doc.setLineDashPattern([0.6, 1.4], 0)
      doc.line(xInicioPuntos, y - 0.8, xFinPuntos, y - 0.8)
      doc.setLineDashPattern([], 0)
    }

    // vigencia (solo en modo 'ambos')
    if (mostrarVigencia) {
      const vencida = vigenciaVencida(f)
      doc.setFont('Poppins', vencida ? 'bold' : 'normal')
      doc.setFontSize(usaFotos ? 6.5 : 7.5)
      if (vencida) doc.setTextColor(200, 35, 35)
      else doc.setTextColor(138, 106, 102)
      doc.text(textoVigencia(f), xVigencia, y)
    }

    doc.setFont('Poppins', 'normal')
    doc.setFontSize(usaFotos ? 8.5 : 10)

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
        doc.setTextColor(90, 102, 191)
        doc.text(`$${fmt(f.mayorista)}`, xPrecio2 + 14, y, { align: 'right' })
      } else {
        doc.setTextColor(200, 188, 184)
        doc.text('—', xPrecio2 + 14, y, { align: 'right' })
      }
    }

    y += 7.5
  })

  // ===== PIE FINAL =====
  doc.setFont('Poppins', 'italic')
  doc.setFontSize(usaFotos ? 6.5 : 7.5)
  doc.setTextColor(166, 142, 137)
  const yPieTexto = Math.min(y + 4, altoPagina - 13)
  doc.text('Precios expresados en pesos argentinos, sujetos a modificación sin previo aviso.', xContenido, yPieTexto, {
    maxWidth: anchoContenido,
  })
  if (mostrarVigencia) {
    doc.setTextColor(200, 35, 35)
    doc.text('En rojo: precios con más de un mes de vigencia (conviene revisarlos).', xContenido, Math.min(yPieTexto + 4, altoPagina - 9), {
      maxWidth: anchoContenido,
    })
    doc.setTextColor(166, 142, 137)
  }
  doc.text(`Página ${paginaActual}`, xDerecha, altoPagina - 9, { align: 'right' })

  const nombreArchivo = `Lista_Precios_${tipoLista}_${hoy}.pdf`
  if (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
    window.open(doc.output('bloburl'), '_blank')
  } else {
    doc.save(nombreArchivo)
  }
}

// Obtiene los precios vigentes desde la BD y genera el PDF (para uso desde mobile).
// conFoto: si es false, genera el PDF clásico a todo el ancho sin buscar fotos.
export async function generarListaPreciosDesdeBD(supabase, tipoLista, conFoto = true) {
  const hoy = new Date().toLocaleString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).slice(0, 10)

  const { data: productos } = await supabase
    .from('productos')
    .select('id_producto, descripcion, imagen_url')
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
      fecha_inicio: pr?.fecha_inicio || null,
      fecha_fin: pr?.fecha_fin || null,
    }
  })

  const anchoFotoPanel = 210 * 0.4
  const fotos = conFoto
    ? await prepararFotosProductos((productos || []).map((p) => p.imagen_url), anchoFotoPanel, 297)
    : []

  await generarListaPreciosPdf(filas, tipoLista, fotos)
}
