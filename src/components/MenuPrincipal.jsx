import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Detecta mobile igual que en Pedidos (768px)
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

function MenuPrincipal({ paginaActual, onCambiarPagina }) {
  const esMobile = useEsMobile()
  const [menuAbierto, setMenuAbierto] = useState(null)
  const menuRef = useRef(null)
  const [pendientesWeb, setPendientesWeb] = useState(0)

  // Contador de pedidos web pendientes (se refresca al navegar y cada 60s)
  useEffect(() => {
    let vivo = true
    async function contar() {
      const { count } = await supabase
        .from('pedido_web')
        .select('id_pedido_web', { count: 'exact', head: true })
        .eq('estado', 'pendiente')
      if (vivo) setPendientesWeb(count || 0)
    }
    contar()
    const t = setInterval(contar, 60000)
    return () => { vivo = false; clearInterval(t) }
  }, [paginaActual])

  const estiloBadge = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minWidth: '18px', height: '18px', padding: '0 5px', marginLeft: '6px',
    borderRadius: '9px', background: '#C0392B', color: '#fff',
    fontSize: '.7rem', fontWeight: 700, lineHeight: 1,
  }

  const grupos = [
    {
      id: 'catalogo',
      label: 'Catálogo',
      items: [
        { id: 'materiasPrimas', label: 'Materias Primas' },
        { id: 'recetas', label: 'Recetas' },
        { id: 'productos', label: 'Productos' },
        { id: 'combos', label: 'Combos' },
        { id: 'preciosMantenimiento', label: 'Mantenimiento de Precios' },
		{ id: 'secciones', label: 'Secciones web' },
        { id: 'caratulaWeb', label: 'Carátula y promo' },
      ],
    },
    {
      id: 'ventas',
      label: 'Ventas',
      items: [
        { id: 'clientes', label: 'Clientes' },
		{ id: 'pedidos', label: 'Pedidos' },
        { id: 'pedidosWeb', label: 'Pedidos web' },
        { id: 'presupuestos', label: 'Presupuestos' },
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
    },
  ]

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

  function grupoActivo(grupo) {
    return grupo.items.some((item) => item.id === paginaActual)
  }

  // ===== BARRA MOBILE FIJA ABAJO =====
  if (esMobile) {
    const itemsMobile = [
      { id: 'inicio',   label: 'Inicio',   icono: '🏠' },
      { id: 'pedidos',  label: 'Pedidos',  icono: '📦' },
      { id: 'presupuestos', label: 'Presup.', icono: '🧾' },
      { id: 'gastos',   label: 'Gastos',   icono: '💸' },
	  { id: 'ingresos', label: 'Ingresos', icono: '💰' },
      { id: 'pedidosWeb', label: 'Web', icono: '🛒' },
    ]

    return (
      <nav className="nav-mobile">
        {itemsMobile.map((item) => (
          <button
            key={item.id}
            className={`nav-mobile-item ${paginaActual === item.id ? 'activo' : ''}`}
            onClick={() => onCambiarPagina(item.id)}
          >
            <span className="nav-mobile-icono" style={{ position: 'relative', display: 'inline-block' }}>
              {item.icono}
              {item.id === 'pedidosWeb' && pendientesWeb > 0 && (
                <span style={{ ...estiloBadge, position: 'absolute', top: '-6px', right: '-10px', marginLeft: 0 }}>
                  {pendientesWeb}
                </span>
              )}
            </span>
            <span className="nav-mobile-label">{item.label}</span>
          </button>
        ))}
      </nav>
    )
  }

  // ===== MENÚ DESKTOP (sin cambios) =====
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
            {grupo.label}
            {grupo.id === 'ventas' && pendientesWeb > 0 && (
              <span style={estiloBadge}>{pendientesWeb}</span>
            )}{' '}
            <span className="nav-flecha">▾</span>
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
                  {item.id === 'pedidosWeb' && pendientesWeb > 0 && (
                    <span style={estiloBadge}>{pendientesWeb}</span>
                  )}
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
