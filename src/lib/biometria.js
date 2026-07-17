// Desbloqueo biométrico (huella / Face ID) del dispositivo.
// Esto NO reemplaza el login de Supabase: la credencial WebAuthn se usa
// únicamente como llave local para desbloquear una sesión que ya es válida.
// Nada de esto viaja a ningún servidor.

const CLAVE_CREDENCIAL = 'gimeBiometria.credentialId'

function bufferAleatorio(longitud = 32) {
  return crypto.getRandomValues(new Uint8Array(longitud))
}

function bufferABase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
}

function base64ABuffer(base64) {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

export async function soportaBiometria() {
  if (!window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) return false
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

export function hayCredencialRegistrada() {
  return !!localStorage.getItem(CLAVE_CREDENCIAL)
}

export async function registrarCredencial(email) {
  const credencial = await navigator.credentials.create({
    publicKey: {
      challenge: bufferAleatorio(),
      rp: { name: 'Gime Burello Pastelería' },
      user: {
        id: bufferAleatorio(16),
        name: email,
        displayName: email,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },   // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
      },
      timeout: 60000,
    },
  })

  if (!credencial) throw new Error('No se pudo crear la credencial')
  localStorage.setItem(CLAVE_CREDENCIAL, bufferABase64(credencial.rawId))
}

export async function desbloquearConBiometria() {
  const credentialId = localStorage.getItem(CLAVE_CREDENCIAL)
  if (!credentialId) return false

  const resultado = await navigator.credentials.get({
    publicKey: {
      challenge: bufferAleatorio(),
      allowCredentials: [{ id: base64ABuffer(credentialId), type: 'public-key' }],
      userVerification: 'required',
      timeout: 60000,
    },
  })

  return !!resultado
}

export function borrarCredencial() {
  localStorage.removeItem(CLAVE_CREDENCIAL)
}
