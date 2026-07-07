import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el archivo .env')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })
const PAGINA = 1000

function marcaDeTiempo() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
}

async function listarTablas() {
  const { data, error } = await supabase.rpc('backup_list_tables')
  if (error) throw new Error('No se pudieron listar las tablas: ' + error.message)
  return data.map((r) => r.table_name)
}

async function bajarTabla(tabla) {
  let filas = []
  let desde = 0
  while (true) {
    const { data, error } = await supabase
      .from(tabla)
      .select('*')
      .range(desde, desde + PAGINA - 1)
    if (error) throw new Error(`Error leyendo ${tabla}: ${error.message}`)
    filas = filas.concat(data)
    if (data.length < PAGINA) break
    desde += PAGINA
  }
  return filas
}

async function main() {
  console.log('Iniciando backup...')
  const tablas = await listarTablas()
  console.log(`Tablas detectadas (${tablas.length}): ${tablas.join(', ')}`)

  const carpeta = join('backups', marcaDeTiempo())
  mkdirSync(carpeta, { recursive: true })

  const manifest = { fecha: new Date().toISOString(), tablas: {} }

  for (const tabla of tablas) {
    const filas = await bajarTabla(tabla)
    writeFileSync(join(carpeta, `${tabla}.json`), JSON.stringify(filas, null, 2), 'utf8')
    manifest.tablas[tabla] = filas.length
    console.log(`  ${tabla}: ${filas.length} filas`)
  }

  writeFileSync(join(carpeta, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
  console.log(`\n✅ Backup completo en: ${carpeta}`)
}

main().catch((e) => {
  console.error('\n❌ El backup FALLÓ:', e.message)
  process.exit(1)
})
