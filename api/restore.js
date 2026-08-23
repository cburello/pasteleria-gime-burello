import { clienteAdmin, datosEntorno, verificarSesion } from './_lib/supabaseAdmin.js'

const BUCKET = 'backups'
const TAMANO_LOTE_INSERT = 500

// Orden de dependencias por clave foránea: los "padres" van antes que los
// "hijos". Se usa tal cual para insertar, y al revés para borrar, así nunca
// se viola una foreign key. Si se agrega una tabla nueva al esquema y no se
// suma acá, igual se procesa (al final, sin garantía de orden — ver
// ordenParaTablas).
const ORDEN_DEPENDENCIAS = [
  // Nivel 0: sin dependencias
  'medios_pagos',
  'materias_primas',
  'recetas',
  'clientes',
  'proveedores',
  'conceptos',
  'secciones',
  'caratula_imagenes',
  'promo_inicio',
  'pedido_web',
  // Nivel 1
  'rendimientos', // -> recetas
  'costos_materia_prima', // -> materias_primas
  'combos', // -> secciones
  'productos', // -> recetas, secciones, rendimientos
  'pedidos', // -> clientes
  'detalle_receta', // -> recetas, materias_primas
  // Nivel 2
  'precios', // -> productos
  'detalle_combo', // -> combos, productos
  'pagos', // -> pedidos
  'gastos', // -> conceptos, medios_pagos, proveedores
  'ingresos', // -> conceptos, medios_pagos, pedidos
  'resultados', // -> medios_pagos
  'retiros', // -> medios_pagos
  'saldos', // -> medios_pagos
  'presupuestos', // -> clientes, pedidos
  // Nivel 3
  'detalle_pedido', // -> pedidos, productos, combos
  'detalle_pedido_web', // -> pedido_web
  'detalle_presupuesto', // -> presupuestos, productos, combos
]

function ordenParaTablas(tablas) {
  const conocidas = ORDEN_DEPENDENCIAS.filter((t) => tablas.includes(t))
  const desconocidas = tablas.filter((t) => !ORDEN_DEPENDENCIAS.includes(t))
  return [...conocidas, ...desconocidas]
}

async function leerBackup(admin, archivo) {
  const { data, error } = await admin.storage.from(BUCKET).download(archivo)
  if (error) throw new Error(`No se pudo leer el archivo de backup "${archivo}": ${error.message}`)
  const texto = await data.text()
  const contenido = JSON.parse(texto)
  if (!contenido || typeof contenido.tablas !== 'object') {
    throw new Error('El archivo de backup no tiene el formato esperado.')
  }
  return contenido
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' })
    return
  }

  const entorno = datosEntorno()

  let admin
  try {
    admin = clienteAdmin(entorno)
  } catch (e) {
    res.status(500).json({ error: e.message })
    return
  }

  const chequeoSesion = await verificarSesion(admin, req, entorno)
  if (!chequeoSesion.ok) {
    res.status(401).json({ error: 'No autorizado: ' + chequeoSesion.motivo })
    return
  }

  // GET: solo mira qué tablas tiene un backup puntual, sin tocar nada.
  if (req.method === 'GET') {
    const archivoConsulta = req.query?.archivo
    if (!archivoConsulta || typeof archivoConsulta !== 'string') {
      res.status(400).json({ error: 'Falta indicar el archivo a inspeccionar.' })
      return
    }
    try {
      const contenido = await leerBackup(admin, archivoConsulta)
      const tablas = Object.entries(contenido.tablas).map(([tabla, filas]) => ({
        tabla,
        filas: Array.isArray(filas) ? filas.length : 0,
      }))
      res.status(200).json({ archivo: archivoConsulta, fecha: contenido.fecha, tablas })
    } catch (e) {
      res.status(400).json({ error: e.message })
    }
    return
  }

  const { archivo, tablas: tablasPedidas } = req.body || {}
  if (!archivo || typeof archivo !== 'string') {
    res.status(400).json({ error: 'Falta indicar el archivo de backup a restaurar.' })
    return
  }
  if (!tablasPedidas || (tablasPedidas !== 'todas' && !Array.isArray(tablasPedidas))) {
    res.status(400).json({ error: 'Falta indicar qué tablas restaurar.' })
    return
  }

  let contenido
  try {
    contenido = await leerBackup(admin, archivo)
  } catch (e) {
    res.status(400).json({ error: e.message })
    return
  }

  const tablasDisponibles = Object.keys(contenido.tablas)
  const tablasSolicitadas =
    tablasPedidas === 'todas' ? tablasDisponibles : tablasPedidas.filter((t) => tablasDisponibles.includes(t))

  if (tablasSolicitadas.length === 0) {
    res.status(400).json({ error: 'Ninguna de las tablas pedidas está presente en ese backup.' })
    return
  }

  const orden = ordenParaTablas(tablasSolicitadas)
  const completadas = []

  try {
    // Borrado: hijos antes que padres (orden inverso).
    for (const tabla of [...orden].reverse()) {
      const { error } = await admin.rpc('restaurar_vaciar_tabla', { p_tabla: tabla })
      if (error) throw new Error(`Al vaciar "${tabla}": ${error.message}`)
    }

    // Reinserción: padres antes que hijos (orden normal).
    for (const tabla of orden) {
      const filas = contenido.tablas[tabla] || []
      for (let i = 0; i < filas.length; i += TAMANO_LOTE_INSERT) {
        const lote = filas.slice(i, i + TAMANO_LOTE_INSERT)
        const { error } = await admin.from(tabla).insert(lote)
        if (error) throw new Error(`Al reinsertar en "${tabla}": ${error.message}`)
      }
      const { error: errorSecuencia } = await admin.rpc('restaurar_resincronizar_secuencias', { p_tabla: tabla })
      if (errorSecuencia) throw new Error(`Al resincronizar la secuencia de "${tabla}": ${errorSecuencia.message}`)
      completadas.push({ tabla, filas: filas.length })
    }

    await admin.from('backups_log').insert({
      estado: 'restore_ok',
      detalle: `Restaurado desde ${archivo}: ${completadas.map((c) => `${c.tabla} (${c.filas})`).join(', ')}. Usuario: ${chequeoSesion.usuario?.email || '—'}.`,
    })

    res.status(200).json({ ok: true, archivo, tablas: completadas })
  } catch (e) {
    try {
      await admin.from('backups_log').insert({
        estado: 'restore_error',
        detalle: `Restore desde ${archivo} interrumpido en "${orden[completadas.length] || '?'}": ${e.message}. Tablas ya restauradas: ${completadas.map((c) => c.tabla).join(', ') || '(ninguna)'}.`,
      })
    } catch {
      // si ni siquiera se pudo registrar el error, no hay mucho mas para hacer aca
    }
    res.status(500).json({
      error: e.message,
      tablasCompletadas: completadas.map((c) => c.tabla),
    })
  }
}
