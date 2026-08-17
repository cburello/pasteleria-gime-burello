import { useState, useEffect, useCallback } from 'react'

const CLAVE_FORZAR_ESCRITORIO = 'gb_forzar_escritorio'
const EVENTO_CAMBIO = 'gb-forzar-escritorio-cambio'
const ANCHO_CORTE = 768

function leerForzado() {
  return typeof window !== 'undefined' && localStorage.getItem(CLAVE_FORZAR_ESCRITORIO) === '1'
}

function pantallaAngosta() {
  return typeof window !== 'undefined' && window.innerWidth <= ANCHO_CORTE
}

// Estado efectivo a usar para elegir qué renderizar (tablas vs. tarjetas, menú
// desplegable vs. barra inferior, etc). Tiene en cuenta el ancho real de la
// pantalla y si el usuario forzó "ver como escritorio" desde el header.
export function useEsMobile() {
  const [esMobile, setEsMobile] = useState(() => pantallaAngosta() && !leerForzado())

  useEffect(() => {
    function recalcular() {
      setEsMobile(pantallaAngosta() && !leerForzado())
    }
    window.addEventListener('resize', recalcular)
    window.addEventListener(EVENTO_CAMBIO, recalcular)
    return () => {
      window.removeEventListener('resize', recalcular)
      window.removeEventListener(EVENTO_CAMBIO, recalcular)
    }
  }, [])

  return esMobile
}

// Ancho real de la pantalla, sin importar si se forzó el modo escritorio.
// Sirve solo para decidir si mostrar el botón de alternar en el header
// (no tiene sentido ofrecerlo si ya estás en una pantalla grande).
export function usePantallaMovil() {
  const [chica, setChica] = useState(pantallaAngosta)

  useEffect(() => {
    function handler() { setChica(pantallaAngosta()) }
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  return chica
}

// [forzado, alternar] para el botón "Ver como escritorio" / "Volver a vista móvil".
// Se guarda en este dispositivo (localStorage), así que queda activado aunque
// se cierre y vuelva a abrir la app, hasta que se apague a mano.
export function useForzarEscritorio() {
  const [forzado, setForzado] = useState(leerForzado)

  useEffect(() => {
    function recalcular() { setForzado(leerForzado()) }
    window.addEventListener(EVENTO_CAMBIO, recalcular)
    return () => window.removeEventListener(EVENTO_CAMBIO, recalcular)
  }, [])

  const alternar = useCallback(() => {
    if (leerForzado()) {
      localStorage.removeItem(CLAVE_FORZAR_ESCRITORIO)
    } else {
      localStorage.setItem(CLAVE_FORZAR_ESCRITORIO, '1')
    }
    window.dispatchEvent(new Event(EVENTO_CAMBIO))
  }, [])

  return [forzado, alternar]
}
