import { useState, useEffect } from 'react'
import logo from './assets/logo.jpeg'
import './App.css'
import { supabase } from './lib/supabase'
import { useNotificaciones } from './hooks/useNotificaciones'
import { soportaBiometria, hayCredencialRegistrada, registrarCredencial } from './lib/biometria'
import Login from './components/Login'
import PantallaBloqueo from './components/PantallaBloqueo'
import Dashboard from './components/Dashboard'
import MateriasPrimas from './components/MateriasPrimas'
import Recetas from './components/Recetas'
import Productos from './components/Productos'
import Combos from './components/Combos'
import Clientes from './components/Clientes'
import Pedidos from './components/Pedidos'
import Informes from './components/Informes'
import CambiarPassword from './components/CambiarPassword'
import Proveedores from './components/Proveedores'
import Gastos from './components/Gastos'
import MenuPrincipal from './components/MenuPrincipal'
import Ingresos from './components/Ingresos'
import Retiros from './components/Retiros'
import Resultados from './components/Resultados'
import PreciosMantenimiento from './components/PreciosMantenimiento'
import AnalisisPrecios from './components/AnalisisPrecios'
import Secciones from './components/Secciones'
import PedidosWeb from './components/PedidosWeb'
import CaratulaWeb from './components/CaratulaWeb'
import Presupuestos from './components/Presupuestos'

function useEsMobile() {
  const [esMobile, setEsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false
  )
  useEffect(() => {
    function handler() { setEsMobile(window.innerWidth <= 768) }
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return esMobile
}

function App() {
  const esMobile = useEsMobile()
  const { mostrarToast } = useNotificaciones()
const [sesion, setSesion] = useState(null)
  const [verificandoSesion, setVerificandoSesion] = useState(true)
  const [bloqueado, setBloqueado] = useState(false)
  const [paginaActual, setPaginaActual] = useState('inicio')
  const [idPedidoAbrir, setIdPedidoAbrir] = useState(null)
  const MINUTOS_INACTIVIDAD = Number(import.meta.env.VITE_MINUTOS_INACTIVIDAD) || 240 // default: 4 horas
  const TIEMPO_INACTIVIDAD_MS = MINUTOS_INACTIVIDAD * 60 * 1000
  const [mostrarCambiarPassword, setMostrarCambiarPassword] = useState(false)
  const [puedeActivarBiometria, setPuedeActivarBiometria] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSesion(data.session)
      setVerificandoSesion(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSesion(session)
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])
  // Bloqueo automático por inactividad (no cierra la sesión: solo tapa la pantalla)
  useEffect(() => {
    if (!sesion || bloqueado) return

    let temporizador

    function reiniciarTemporizador() {
      clearTimeout(temporizador)
      temporizador = setTimeout(() => {
        setBloqueado(true)
      }, TIEMPO_INACTIVIDAD_MS)
    }

    const eventos = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart']
    eventos.forEach((ev) => window.addEventListener(ev, reiniciarTemporizador))

    reiniciarTemporizador() // arranca el contador al iniciar sesión

    return () => {
      clearTimeout(temporizador)
      eventos.forEach((ev) => window.removeEventListener(ev, reiniciarTemporizador))
    }
  }, [sesion, bloqueado])

  // Verifica si este dispositivo puede ofrecer activar el desbloqueo biométrico
  useEffect(() => {
    if (!sesion) return
    let cancelado = false
    soportaBiometria().then((soporta) => {
      if (!cancelado) setPuedeActivarBiometria(soporta && !hayCredencialRegistrada())
    })
    return () => { cancelado = true }
  }, [sesion])

  async function cerrarSesion() {
    await supabase.auth.signOut()
    setSesion(null)
    setBloqueado(false)
  }

  async function activarBiometria() {
    try {
      await registrarCredencial(sesion.user.email)
      setPuedeActivarBiometria(false)
      mostrarToast('Desbloqueo con huella / Face ID activado en este dispositivo.')
    } catch (e) {
      mostrarToast('No se pudo activar: ' + e.message, 'error')
    }
  }

  function irAPedido(idPedido) {
    setIdPedidoAbrir(idPedido)
    setPaginaActual('pedidos')
  }

  if (verificandoSesion) {
    return (
      <div className="login-container">
        <p style={{ color: 'white' }}>Cargando...</p>
      </div>
    )
  }

  if (!sesion) {
    return <Login onLoginExitoso={(s) => setSesion(s)} />
  }

  if (bloqueado) {
    return (
      <PantallaBloqueo
        onDesbloquear={() => setBloqueado(false)}
        onCerrarSesion={cerrarSesion}
      />
    )
  }

  return (
    <div className="app-container">
<header className="app-header">
        <div className="app-header-marca">
          <img src={logo} alt="Gime Burello Pastelería" className="app-logo" />
          <h1>Gime Burello Pasteleria<span>Pastelería</span></h1>
        </div>
        <div className="header-acciones">
          {puedeActivarBiometria && (
            <button
              className="btn-activar-biometria"
              onClick={activarBiometria}
              title="Activar huella / Face ID"
            >
              {esMobile ? '🔓' : '🔓 Activar huella / Face ID'}
            </button>
          )}
          <button className="btn-cambiar-password" onClick={() => setMostrarCambiarPassword(true)}>
            🔑 Cambiar contraseña
          </button>
          <button className="btn-cerrar-sesion" onClick={cerrarSesion}>
            🚪 Cerrar sesión
          </button>
        </div>
      </header>

      {mostrarCambiarPassword && (
        <CambiarPassword onCerrar={() => setMostrarCambiarPassword(false)} />
      )}

<MenuPrincipal paginaActual={paginaActual} onCambiarPagina={setPaginaActual} />

      <main className="app-content">
        {paginaActual === 'inicio' && <Dashboard onAbrirPedido={irAPedido} />}
        {paginaActual === 'materiasPrimas' && <MateriasPrimas />}
        {paginaActual === 'recetas' && <Recetas />}
        {paginaActual === 'productos' && <Productos />}
        {paginaActual === 'combos' && <Combos />}
        {paginaActual === 'preciosMantenimiento' && <PreciosMantenimiento />}
        {paginaActual === 'analisisPrecios' && <AnalisisPrecios />}
        {paginaActual === 'secciones' && <Secciones />}
        {paginaActual === 'clientes' && <Clientes />}
        {paginaActual === 'pedidos' && (
          <Pedidos idPedidoAbrir={idPedidoAbrir} onPedidoAbierto={() => setIdPedidoAbrir(null)} />
        )}
		{paginaActual === 'informes' && <Informes />}
		{paginaActual === 'pedidosWeb' && <PedidosWeb />}
        {paginaActual === 'presupuestos' && <Presupuestos />}
        {paginaActual === 'caratulaWeb' && <CaratulaWeb />}
        {paginaActual === 'proveedores' && <Proveedores />}        
        {paginaActual === 'gastos' && <Gastos />}
{paginaActual === 'ingresos' && <Ingresos />}        
{paginaActual === 'retiros' && <Retiros />}
{paginaActual === 'resultados' && <Resultados />}
      </main>
    </div>
  )
}

export default App