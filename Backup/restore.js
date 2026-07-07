import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Faltan credenciales en el archivo .env')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

// Elige la carpeta a restaurar: la que pases como argumento, o la más reciente.
function elegirCarpeta() {
  const arg = process.argv[2]
  if (arg) return arg
  const base = 'backups'
  if (!existsSync(base)) throw new Error('No existe la carpeta backups/')
  const dirs = readdirSync(base)
    .filter((d) => /^\d{4}-\d{2}-\d{2}_/.test(d))
    .sort()
  if (dirs.length === 0) throw new Error('No hay backups para restaurar')
  return join(base, dirs[dirs.length - 1])
}

async function main() {
  const carpeta = elegirCarpeta()
  console.log(`Restaurando desde: ${carpeta}`)

  const manifestPath = join(carpeta, 'manifest.json')
  if (!existsSync(manifestPath)) throw new Error('No se encontró manifest.json en esa carpeta')

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const tablas = Object.keys(manifest.tablas)
  console.log(`Se van a restaurar ${tablas.length} tablas (upsert: sobreescribe por ID).`)

  // Multi-pasada: respeta dependencias entre tablas (foreign keys).
  const pendientes = new Set(tablas)
  let progreso = true
  let ultimoError = ''

  while (pendientes.size > 0 && progreso) {
    progreso = false
    for (const tabla of Array.from(pendientes)) {
      const filas = JSON.parse(readFileSync(join(carpeta, `${tabla}.json`), 'utf8'))

      if (filas.length === 0) {
        pendientes.delete(tabla)
        progreso = true
        console.log(`  ${tabla}: vacía`)
        continue
      }

      const clave = Object.keys(filas[0])[0]
      filas.sort((a, b) => (a[clave] > b[clave] ? 1 : a[clave] < b[clave] ? -1 : 0))

      const { error } = await supabase.from(tabla).upsert(filas)
      if (error) {
        ultimoError = `${tabla}: ${error.message}`
        continue
      }
      pendientes.delete(tabla)
      progreso = true
      console.log(`  ${tabla}: ${filas.length} filas restauradas`)
    }
  }

  if (pendientes.size > 0) {
    console.error(`\n❌ No se pudieron restaurar: ${Array.from(pendientes).join(', ')}`)
    console.error(`   Último error: ${ultimoError}`)
    console.error('   Puede ser por foreign keys o por columnas "generated always". Revisá el PASO 4.1.')
    process.exit(1)
  }

  const { error: errSeq } = await supabase.rpc('backup_resync_sequences')
  if (errSeq) {
    console.warn('\n⚠️  No se pudieron resincronizar las secuencias:', errSeq.message)
    console.warn('   (Corré la función backup_resync_sequences del PASO 0 en Supabase.)')
  } else {
    console.log('\n🔧 Secuencias de IDs resincronizadas.')
  }

  console.log('\n✅ Restauración completa.')
}

main().catch((e) => {
  console.error('\n❌ El restore FALLÓ:', e.message)
  process.exit(1)
})
