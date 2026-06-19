import { useState } from 'react'
import logo from './assets/logo.jpeg'
import './App.css'
import Dashboard from './components/Dashboard'
import MateriasPrimas from './components/MateriasPrimas'
import Recetas from './components/Recetas'
import Productos from './components/Productos'
import Combos from './components/Combos'
import Clientes from './components/Clientes'
import Pedidos from './components/Pedidos'
import Informes from './components/Informes'

function App() {
  const [paginaActual, setPaginaActual] = useState('inicio')
  const [idPedidoAbrir, setIdPedidoAbrir] = useState(null)

  const menuItems = [
    { id: 'inicio', label: 'Inicio' },
    { id: 'materiasPrimas', label: 'Materias Primas' },
    { id: 'recetas', label: 'Recetas' },
    { id: 'productos', label: 'Productos' },
    { id: 'combos', label: 'Combos' },
    { id: 'clientes', label: 'Clientes' },
    { id: 'pedidos', label: 'Pedidos' },
    { id: 'informes', label: 'Informes' },
  ]

  function irAPedido(idPedido) {
    setIdPedidoAbrir(idPedido)
    setPaginaActual('pedidos')
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <img src={logo} alt="Gime Burello Pastelería" className="app-logo" />
        <h1>Gime Burello <span>Pastelería</span></h1>
      </header>

      <nav className="app-nav">
        {menuItems.map((item) => (
          <button
            key={item.id}
            className={paginaActual === item.id ? 'nav-btn active' : 'nav-btn'}
            onClick={() => setPaginaActual(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

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
      </main>
    </div>
  )
}

export default App