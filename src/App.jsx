import { useState, useEffect } from 'react'
import logo from './assets/logo.jpeg'
import './App.css'
import { supabase } from './lib/supabase'
import Login from './components/Login'
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

function App() {
const [sesion, setSesion] = useState(null)
  const [verificandoSesion, setVerificandoSesion] = useState(true)
  const [paginaActual, setPaginaActual] = useState('inicio')
  const [idPedidoAbrir, setIdPedidoAbrir] = useState(null)
  const TIEMPO_INACTIVIDAD_MS = 4 * 60 * 60 * 1000 // 4 horas
  const [mostrarCambiarPassword, setMostrarCambiarPassword] = useState(false)

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
  // Cierre de sesión automático por inactividad
  useEffect(() => {
    if (!sesion) return

    let temporizador

    function reiniciarTemporizador() {
      clearTimeout(temporizador)
      temporizador = setTimeout(() => {
        supabase.auth.signOut()
        setSesion(null)
      }, TIEMPO_INACTIVIDAD_MS)
    }

    const eventos = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart']
    eventos.forEach((ev) => window.addEventListener(ev, reiniciarTemporizador))

    reiniciarTemporizador() // arranca el contador al iniciar sesión

    return () => {
      clearTimeout(temporizador)
      eventos.forEach((ev) => window.removeEventListener(ev, reiniciarTemporizador))
    }
  }, [sesion])

  async function cerrarSesion() {
    await supabase.auth.signOut()
    setSesion(null)
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

  return (
    <div className="app-container">
<header className="app-header">
        <div className="app-header-marca">
          <img src={logo} alt="Gime Burello Pastelería" className="app-logo" />
          <h1>Gime Burello <span>Pastelería</span></h1>
        </div>
        <div className="header-acciones">
          <button className="btn-cambiar-password" onClick={() => setMostrarCambiarPassword(true)}>
            🔑 Cambiar contraseña
          </button>
          <button className="btn-cerrar-sesion" onClick={cerrarSesion}>
            ⏻ Cerrar sesión
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
        {paginaActual === 'clientes' && <Clientes />}
        {paginaActual === 'pedidos' && (
          <Pedidos idPedidoAbrir={idPedidoAbrir} onPedidoAbierto={() => setIdPedidoAbrir(null)} />
        )}
        {paginaActual === 'informes' && <Informes />}
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