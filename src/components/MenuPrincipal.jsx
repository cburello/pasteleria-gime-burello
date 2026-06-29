import { useState, useRef, useEffect } from 'react'

function MenuPrincipal({ paginaActual, onCambiarPagina }) {
  const [menuAbierto, setMenuAbierto] = useState(null) // 'catalogo' | 'ventas' | 'finanzas' | null
  const menuRef = useRef(null)

  const grupos = [
    {
      id: 'catalogo',
      label: 'Catálogo',
      items: [
        { id: 'materiasPrimas', label: 'Materias Primas' },
        { id: 'recetas', label: 'Recetas' },
        { id: 'productos', label: 'Productos' },
        { id: 'combos', label: 'Combos' },
      ],
    },
    {
      id: 'ventas',
      label: 'Ventas',
      items: [
        { id: 'clientes', label: 'Clientes' },
        { id: 'pedidos', label: 'Pedidos' },
        { id: 'informes', label: 'Informes' },
      ],
    },
{
      id: 'finanzas',
      label: 'Finanzas',
      items: [
        { id: 'proveedores', label: 'Proveedores' },
        { id: 'gastos', label: 'Gastos' },
        { id: 'ingresos', label: 'Ingresos' },
        { id: 'retiros', label: 'Retiros' },
        { id: 'resultados', label: 'Resultados' },                
      ],
    },  ]

  // Cierra el menú abierto si se hace clic fuera
  useEffect(() => {
    function manejarClicFuera(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuAbierto(null)
      }
    }
    document.addEventListener('mousedown', manejarClicFuera)
    return () => document.removeEventListener('mousedown', manejarClicFuera)
  }, [])

  function toggleMenu(id) {
    setMenuAbierto(menuAbierto === id ? null : id)
  }

  function seleccionarItem(id) {
    onCambiarPagina(id)
    setMenuAbierto(null)
  }

  // Determina si algún item de un grupo es la página actual (para resaltar el grupo)
  function grupoActivo(grupo) {
    return grupo.items.some((item) => item.id === paginaActual)
  }

  return (
    <nav className="app-nav" ref={menuRef}>
      <button
        className={paginaActual === 'inicio' ? 'nav-btn active' : 'nav-btn'}
        onClick={() => seleccionarItem('inicio')}
      >
        Inicio
      </button>

      {grupos.map((grupo) => (
        <div key={grupo.id} className="nav-grupo">
          <button
            className={grupoActivo(grupo) || menuAbierto === grupo.id ? 'nav-btn active' : 'nav-btn'}
            onClick={() => toggleMenu(grupo.id)}
          >
            {grupo.label} <span className="nav-flecha">▾</span>
          </button>

          {menuAbierto === grupo.id && (
            <div className="nav-dropdown">
              {grupo.items.map((item) => (
                <div
                  key={item.id}
                  className={paginaActual === item.id ? 'nav-dropdown-item activo' : 'nav-dropdown-item'}
                  onClick={() => seleccionarItem(item.id)}
                >
                  {item.label}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </nav>
  )
}

export default MenuPrincipal