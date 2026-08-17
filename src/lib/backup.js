import { supabase } from './supabase'

// Dispara un backup manual: llama a la funcion de servidor (api/backup.js),
// que exporta todas las tablas a un archivo en Storage y deja un registro en
// backups_log. Devuelve { ok, fecha, tablas, registros } o lanza un error
// con el mensaje para mostrar al usuario.
export async function dispararBackup() {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) throw new Error('No hay sesión activa.')

  const respuesta = await fetch('/api/backup', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  const cuerpo = await respuesta.json().catch(() => ({}))
  if (!respuesta.ok) {
    throw new Error(cuerpo.error || `Error al hacer el backup (${respuesta.status})`)
  }
  return cuerpo
}

// Trae el ultimo backup exitoso registrado, o null si nunca se hizo ninguno.
export async function ultimoBackup() {
  const { data, error } = await supabase
    .from('backups_log')
    .select('*')
    .eq('estado', 'ok')
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

// Compara el conteo de filas guardado en el ultimo backup contra el conteo
// actual de cada tabla. Devuelve la lista de tablas que cambiaron (alta o
// baja de registros) desde entonces. No detecta ediciones puras de filas
// existentes (por ejemplo, corregir un importe sin agregar ni borrar).
export async function tablasConCambios(ultimoBackupRegistrado) {
  const { data, error } = await supabase.rpc('contar_filas_por_tabla')
  if (error) throw error

  const conteoAnterior = ultimoBackupRegistrado?.conteo_filas || {}
  const cambios = []
  for (const fila of data || []) {
    const antes = conteoAnterior[fila.tabla] ?? 0
    const ahora = Number(fila.cantidad)
    if (ahora !== antes) {
      cambios.push({ tabla: fila.tabla, antes, ahora, diferencia: ahora - antes })
    }
  }
  return cambios
}
