import { createClient } from '@supabase/supabase-js'

const TAMANO_PAGINA = 1000
const BUCKET = 'backups'

function clienteAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const claveServicio = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !claveServicio) {
    throw new Error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en las variables de entorno del servidor.')
  }
  return createClient(url, claveServicio, { auth: { persistSession: false } })
}

async function verificarSesion(admin, req) {
  const encabezado = req.headers.authorization || ''
  const token = encabezado.startsWith('Bearer ') ? encabezado.slice(7) : null
  if (!token) return false
  const { data, error } = await admin.auth.getUser(token)
  return !error && !!data?.user
}

async function traerTablaCompleta(admin, tabla) {
  const filas = []
  let desde = 0
  while (true) {
    const { data, error } = await admin
      .from(tabla)
      .select('*')
      .range(desde, desde + TAMANO_PAGINA - 1)
    if (error) throw new Error(`Tabla "${tabla}": ${error.message}`)
    filas.push(...data)
    if (data.length < TAMANO_PAGINA) break
    desde += TAMANO_PAGINA
  }
  return filas
}

async function asegurarBucket(admin) {
  const { data: buckets } = await admin.storage.listBuckets()
  if (buckets?.some((b) => b.name === BUCKET)) return
  const { error } = await admin.storage.createBucket(BUCKET, { public: false })
  if (error && !String(error.message || '').toLowerCase().includes('already exists')) {
    throw new Error(`No se pudo crear el bucket de backups: ${error.message}`)
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' })
    return
  }

  let admin
  try {
    admin = clienteAdmin()
  } catch (e) {
    res.status(500).json({ error: e.message })
    return
  }

  const autorizado = await verificarSesion(admin, req)
  if (!autorizado) {
    res.status(401).json({ error: 'No autorizado' })
    return
  }

  try {
    const { data: tablasRaw, error: errorTablas } = await admin.rpc('listar_tablas_publicas')
    if (errorTablas) throw new Error(`No se pudo listar las tablas: ${errorTablas.message}`)
    const tablas = (tablasRaw || []).map((t) => t.tabla)

    await asegurarBucket(admin)

    const volcado = {}
    const conteoFilas = {}
    for (const tabla of tablas) {
      const filas = await traerTablaCompleta(admin, tabla)
      volcado[tabla] = filas
      conteoFilas[tabla] = filas.length
    }

    const fecha = new Date()
    const nombreArchivo = `${fecha.toISOString().replace(/[:.]/g, '-')}.json`
    const contenido = JSON.stringify({ fecha: fecha.toISOString(), tablas: volcado }, null, 2)

    const { error: errorSubida } = await admin.storage
      .from(BUCKET)
      .upload(nombreArchivo, contenido, { contentType: 'application/json', upsert: false })
    if (errorSubida) throw new Error(`No se pudo guardar el archivo de backup: ${errorSubida.message}`)

    const totalRegistros = Object.values(conteoFilas).reduce((a, b) => a + b, 0)

    const { error: errorLog } = await admin.from('backups_log').insert({
      estado: 'ok',
      conteo_filas: conteoFilas,
      detalle: `${tablas.length} tablas, ${totalRegistros} registros, archivo ${nombreArchivo}`,
    })
    if (errorLog) throw new Error(`Backup guardado, pero no se pudo registrar en backups_log: ${errorLog.message}`)

    res.status(200).json({
      ok: true,
      fecha: fecha.toISOString(),
      tablas: tablas.length,
      registros: totalRegistros,
      archivo: nombreArchivo,
    })
  } catch (e) {
    try {
      await admin.from('backups_log').insert({ estado: 'error', detalle: e.message })
    } catch {
      // si ni siquiera se pudo registrar el error, no hay mucho mas para hacer aca
    }
    res.status(500).json({ error: e.message })
  }
}
