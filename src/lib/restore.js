import { supabase } from './supabase'

// Trae los backups que se pueden usar para restaurar (los que tienen archivo
// guardado en Storage). Los mas nuevos primero.
export async function listarBackupsDisponibles() {
  const { data, error } = await supabase
    .from('backups_log')
    .select('*')
    .eq('estado', 'ok')
    .not('archivo', 'is', null)
    .order('fecha', { ascending: false })
    .limit(20)
  if (error) throw error
  return data || []
}

// Vuelve a pedir la contraseña del usuario actual como confirmacion extra
// antes de una restauracion. No cambia la sesion activa: si la contraseña es
// correcta, Supabase simplemente reconfirma el login (misma sesion).
export async function reautenticar(password) {
  const { data: userData } = await supabase.auth.getUser()
  const email = userData?.user?.email
  if (!email) throw new Error('No se pudo determinar el usuario actual.')

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error('Contraseña incorrecta.')
}

// Mira qué tablas (y cuántas filas) tiene un backup puntual, sin restaurar
// nada — para poder armar la lista de checkboxes.
export async function inspeccionarBackup(archivo) {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) throw new Error('No hay sesión activa.')

  const respuesta = await fetch(`/api/restore?archivo=${encodeURIComponent(archivo)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const cuerpo = await respuesta.json().catch(() => ({}))
  if (!respuesta.ok) {
    throw new Error(cuerpo.error || `Error al leer el backup (${respuesta.status})`)
  }
  return cuerpo
}

// Dispara la restauracion en el servidor: borra y reinserta las tablas
// indicadas a partir del backup elegido. Devuelve { ok, archivo, tablas } o
// lanza un error con el mensaje para mostrar al usuario.
export async function dispararRestore({ archivo, tablas }) {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) throw new Error('No hay sesión activa.')

  const respuesta = await fetch('/api/restore', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ archivo, tablas }),
  })
  const cuerpo = await respuesta.json().catch(() => ({}))
  if (!respuesta.ok) {
    const error = new Error(cuerpo.error || `Error al restaurar (${respuesta.status})`)
    error.tablasCompletadas = cuerpo.tablasCompletadas || []
    throw error
  }
  return cuerpo
}
