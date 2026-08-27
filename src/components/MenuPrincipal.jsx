import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import logo from '../assets/logo.jpeg'
import { useEsMobile } from '../hooks/useEsMobile'

const CLAVE_MENU_COLAPSADO = 'gb_menu_lateral_colapsado'
const ANCHO_CORTE_COLAPSO = 1100

const ICONOS_GRUPO = { catalogo: '🧁', ventas: '🛒', finanzas: '💰' }

const GRUPOS = [
  {
    id: 'catalogo',
    label: 'Catálogo',
    items: [
      { id: 'materiasPrimas', label: 'Materias Primas' },
      { id: 'recetas', label: 'Recetas' },
      { id: 'productos', label: 'Productos' },
      { id: 'combos', label: 'Combos' },
      { id: 'preciosMantenimiento', label: 'Mantenimiento de Precios' },
      { id: 'analisisPrecios', label: 'Análisis de Precios' },
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
      { id: 'historialClientes', label: 'Historial por cliente' },
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
      { id: 'backup', label: 'Backup' },
      { id: 'mantenimiento', label: 'Mantenimiento' },
    ],
  },
]

function idGrupoActivo(pagina) {
  return GRUPOS.find((g) => g.items.some((item) => item.id === pagina))?.id ?? null
}

function MenuPrincipal({
  paginaActual,
  onCambiarPagina,
  entornoPrueba,
  onCambiarPassword,
  onCerrarSesion,
  puedeActivarBiometria,
  onActivarBiometria,
  pantallaMovil,
  forzarEscritorio,
  onAlternarForzarEscritorio,
}) {
  const esMobile = useEsMobile()
  const [menuAbierto, setMenuAbierto] = useState(null) // flyout abierto por click, en modo colapsado
  const menuRef = useRef(null)
  const [pendientesWeb, setPendientesWeb] = useState(0)

  const [grupoAbierto, setGrupoAbierto] = useState(() => idGrupoActivo(paginaActual))
  // Rastrea la última paginaActual "vista", para poder reabrir el grupo
  // correcto cuando cambia sin usar un efecto (ver ajuste más abajo).
  const [paginaSincronizada, setPaginaSincronizada] = useState(paginaActual)

  const [colapsadoGuardado, setColapsadoGuardado] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem(CLAVE_MENU_COLAPSADO) === '1'
  )
  const [anchoAngosto, setAnchoAngosto] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= ANCHO_CORTE_COLAPSO
  )
  // Si la ventana es angosta y el usuario expande a mano, se respeta esa
  // elección solo por esta sesión (no se guarda en localStorage).
  const [expandidoEnSesion, setExpandidoEnSesion] = useState(false)
  const [anchoSincronizado, setAnchoSincronizado] = useState(anchoAngosto)

  // Ajustes derivados de props/estado que cambiaron desde el último render
  // (patrón recomendado por React para esto: setState durante el render,
  // nunca dentro de un efecto).
  if (paginaActual !== paginaSincronizada) {
    setPaginaSincronizada(paginaActual)
    const activo = idGrupoActivo(paginaActual)
    if (activo) setGrupoAbierto(activo)
  }
  if (anchoAngosto !== anchoSincronizado) {
    setAnchoSincronizado(anchoAngosto)
    if (!anchoAngosto) setExpandidoEnSesion(false)
  }

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

  useEffect(() => {
    function recalcularAncho() {
      setAnchoAngosto(window.innerWidth <= ANCHO_CORTE_COLAPSO)
    }
    window.addEventListener('resize', recalcularAncho)
    return () => window.removeEventListener('resize', recalcularAncho)
  }, [])

  const colapsado = colapsadoGuardado || (anchoAngosto && !expandidoEnSesion)

  function alternarColapso() {
    if (colapsado) {
      if (anchoAngosto && !colapsadoGuardado) {
        // Estaba colapsado automáticamente por ventana angosta: expandir
        // solo para esta sesión, sin persistir la preferencia.
        setExpandidoEnSesion(true)
      } else {
        setColapsadoGuardado(false)
        localStorage.setItem(CLAVE_MENU_COLAPSADO, '0')
      }
    } else {
      setColapsadoGuardado(true)
      setExpandidoEnSesion(false)
      localStorage.setItem(CLAVE_MENU_COLAPSADO, '1')
    }
  }

  useEffect(() => {
    function manejarClicFuera(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuAbierto(null)
      }
    }
    document.addEventListener('mousedown', manejarClicFuera)
    return () => document.removeEventListener('mousedown', manejarClicFuera)
  }, [])

  function toggleGrupo(id) {
    setGrupoAbierto(grupoAbierto === id ? null : id)
  }

  function alternarFlyout(id, e) {
    e.stopPropagation()
    setMenuAbierto(menuAbierto === id ? null : id)
  }

  function seleccionarItem(id) {
    onCambiarPagina(id)
    setMenuAbierto(null)
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

  // ===== MENÚ LATERAL DE ESCRITORIO =====
  return (
    <aside className={`menu-lateral${colapsado ? ' rail' : ''}`} ref={menuRef}>
      <div className="menu-lateral-marca">
        <img src={logo} alt="Gime Burello Pastelería" className="menu-lateral-logo" />
        <div className="menu-lateral-marca-texto">
          Gime Burello
          <span>Pastelería</span>
        </div>
      </div>

      <button
        className="menu-lateral-toggle"
        onClick={alternarColapso}
        title={colapsado ? 'Expandir menú' : 'Colapsar menú'}
      >
        {colapsado ? '»' : '«'}
      </button>

      <nav className="menu-lateral-nav">
        {colapsado ? (
          <>
            <div
              className={paginaActual === 'inicio' ? 'menu-lateral-icono activo' : 'menu-lateral-icono'}
              title="Inicio"
              onClick={() => seleccionarItem('inicio')}
            >
              🏠
            </div>

            {GRUPOS.map((grupo) => (
              <div
                key={grupo.id}
                className={`menu-lateral-icono${menuAbierto === grupo.id ? ' abierto' : ''}`}
                title={grupo.label}
                onClick={(e) => alternarFlyout(grupo.id, e)}
              >
                {ICONOS_GRUPO[grupo.id]}
                {grupo.id === 'ventas' && pendientesWeb > 0 && (
                  <span style={{ ...estiloBadge, position: 'absolute', top: '-4px', right: '-4px', marginLeft: 0 }}>
                    {pendientesWeb}
                  </span>
                )}

                <div className="menu-lateral-flyout">
                  <div className="menu-lateral-flyout-titulo">{grupo.label}</div>
                  {grupo.items.map((item) => (
                    <div
                      key={item.id}
                      className="menu-lateral-flyout-item"
                      onClick={() => seleccionarItem(item.id)}
                    >
                      {item.label}
                      {item.id === 'pedidosWeb' && pendientesWeb > 0 && (
                        <span style={estiloBadge}>{pendientesWeb}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        ) : (
          <>
            <div
              className={paginaActual === 'inicio' ? 'menu-lateral-item activo' : 'menu-lateral-item'}
              onClick={() => seleccionarItem('inicio')}
            >
              🏠 Inicio
            </div>

            {GRUPOS.map((grupo) => (
              <div key={grupo.id}>
                <button
                  className={`menu-lateral-grupo-titulo${grupoAbierto === grupo.id ? ' abierto' : ''}`}
                  onClick={() => toggleGrupo(grupo.id)}
                >
                  <span>
                    {grupo.label}
                    {grupo.id === 'ventas' && pendientesWeb > 0 && (
                      <span style={estiloBadge}>{pendientesWeb}</span>
                    )}
                  </span>
                  <span className="menu-lateral-flecha">▶</span>
                </button>

                {grupoAbierto === grupo.id && (
                  <div className="menu-lateral-sub">
                    {grupo.items.map((item) => (
                      <div
                        key={item.id}
                        className={paginaActual === item.id ? 'menu-lateral-item activo' : 'menu-lateral-item'}
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
          </>
        )}
      </nav>

      <div className="menu-lateral-cuenta">
        <span
          className={`menu-lateral-cuenta-env ${entornoPrueba ? 'prueba' : 'produccion'}`}
          title={entornoPrueba ? 'Estás conectado a la base de datos de PRUEBA (Pasteleria-Prueba)' : 'Estás conectado a la base de datos de PRODUCCIÓN'}
        >
          {entornoPrueba ? (colapsado ? '🧪' : '🧪 Prueba') : (colapsado ? '🟢' : '🟢 Producción')}
        </span>

        {pantallaMovil && (
          <button
            className="menu-lateral-cuenta-fila"
            onClick={onAlternarForzarEscritorio}
            title={forzarEscritorio ? 'Volver a la vista para celular' : 'Ver el sistema como en la computadora'}
          >
            {forzarEscritorio ? '📱' : '🖥️'}
            <span className="menu-lateral-cuenta-fila-texto">
              {forzarEscritorio ? 'Volver a vista móvil' : 'Ver como escritorio'}
            </span>
          </button>
        )}

        {puedeActivarBiometria && (
          <button className="menu-lateral-cuenta-fila" onClick={onActivarBiometria} title="Activar huella / Face ID">
            🔓 <span className="menu-lateral-cuenta-fila-texto">Activar huella / Face ID</span>
          </button>
        )}

        <button className="menu-lateral-cuenta-fila" onClick={onCambiarPassword} title="Cambiar contraseña">
          🔑 <span className="menu-lateral-cuenta-fila-texto">Cambiar contraseña</span>
        </button>

        <button className="menu-lateral-cuenta-fila" onClick={onCerrarSesion} title="Cerrar sesión">
          🚪 <span className="menu-lateral-cuenta-fila-texto">Cerrar sesión</span>
        </button>
      </div>
    </aside>
  )
}

export default MenuPrincipal
