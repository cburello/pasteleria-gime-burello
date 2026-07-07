import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const BUCKET = 'catalogo'

if (!url || !key) {
  console.error('Faltan credenciales en el archivo .env')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

function marcaDeTiempo() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
}

async function listarRecursivo(prefijo = '') {
  const { data, error } = await supabase.storage.from(BUCKET).list(prefijo, { limit: 1000 })
  if (error) throw new Error(error.message)
  let archivos = []
  for (const item of data) {
    const ruta = prefijo ? `${prefijo}/${item.name}` : item.name
    if (item.id === null) {
      archivos = archivos.concat(await listarRecursivo(ruta))
    } else {
      archivos.push(ruta)
    }
  }
  return archivos
}

async function main() {
  console.log(`Respaldando imágenes del bucket "${BUCKET}"...`)
  const archivos = await listarRecursivo()
  console.log(`Archivos encontrados: ${archivos.length}`)

  const carpeta = join('backups-storage', marcaDeTiempo())

  for (const ruta of archivos) {
    const { data, error } = await supabase.storage.from(BUCKET).download(ruta)
    if (error) {
      console.error(`  ⚠️  no se pudo bajar ${ruta}: ${error.message}`)
      continue
    }
    const buffer = Buffer.from(await data.arrayBuffer())
    const destino = join(carpeta, ruta)
    mkdirSync(dirname(destino), { recursive: true })
    writeFileSync(destino, buffer)
    console.log(`  guardado: ${ruta}`)
  }

  console.log(`\n✅ Imágenes respaldadas en: ${carpeta}`)
}

main().catch((e) => {
  console.error('\n❌ El backup de imágenes FALLÓ:', e.message)
  process.exit(1)
})
