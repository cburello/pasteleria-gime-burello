import { createClient } from '@supabase/supabase-js'

export function datosEntorno() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const claveServicio = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  return { url, claveServicio }
}

// Descripcion segura (sin exponer el secreto) de que esta llegando al
// servidor, para poder diagnosticar sin adivinar: el proyecto (parte de la
// URL, no es secreto) y la forma de la clave (prefijo + longitud).
export function diagnosticoEntorno({ url, claveServicio }) {
  const proyecto = url.replace(/^https?:\/\//, '').split('.')[0] || '(vacío)'
  const clave = claveServicio
    ? `${claveServicio.slice(0, 6)}…(${claveServicio.length} caracteres)`
    : '(vacía)'
  return `proyecto=${proyecto || '(no se pudo leer)'}, clave=${clave}`
}

export function clienteAdmin({ url, claveServicio }) {
  if (!url || !claveServicio) {
    throw new Error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en las variables de entorno del servidor.')
  }
  return createClient(url, claveServicio, { auth: { persistSession: false } })
}

export async function verificarSesion(admin, req, entorno) {
  const encabezado = req.headers.authorization || ''
  const token = encabezado.startsWith('Bearer ') ? encabezado.slice(7) : null
  if (!token) return { ok: false, motivo: 'La app no envió el token de sesión.' }
  const { data, error } = await admin.auth.getUser(token)
  if (error) return { ok: false, motivo: `${error.message} [${diagnosticoEntorno(entorno)}]` }
  if (!data?.user) return { ok: false, motivo: 'El token es válido pero no corresponde a ningún usuario.' }
  return { ok: true, usuario: data.user }
}
