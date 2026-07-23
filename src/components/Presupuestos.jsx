import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNotificaciones } from '../hooks/useNotificaciones'
import { generarPresupuestoPdf } from '../lib/presupuestoPdf'

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

function normalizar(texto) {
  return (texto || '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function formatearMoneda(valor) {
  if (valor === null || valor === undefined || isNaN(valor)) return '0,00'
  return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valor)
}

function formatearFecha(f) {
  if (!f) return ''
  const [a, m, d] = f.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

const ESTADO_LABEL = { borrador: 'Borrador', confirmado: 'Confirmado', descartado: 'Descartado' }
const ESTADO_COLOR = {
  borrador: { bg: '#FBEFD9', color: '#B26A00' },
  confirmado: { bg: '#E8F5E9', color: '#2E7D32' },
  descartado: { bg: '#FDECEA', color: '#C0392B' },
}

function BadgeEstado({ estado }) {
  const c = ESTADO_COLOR[estado] || ESTADO_COLOR.borrador
  return (
    <span style={{ fontSize: '.72rem', padding: '2px 10px', borderRadius: '20px', background: c.bg, color: c.color, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {ESTADO_LABEL[estado] || estado}
    </span>
  )
}

function Presupuestos() {
  const esMobile = useEsMobile()
  const [vista, setVista] = useState('lista')
  const [presupuestoActual, setPresupuestoActual] = useState(null)
  const [presupuestos, setPresupuestos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [textoBusqueda, setTextoBusqueda] = useState('')

  useEffect(() => { cargarPresupuestos() }, [])

  async function cargarPresupuestos() {
    setCargando(true)
    const { data } = await supabase
      .from('presupuestos')
      .select('*, clientes(descripcion, cliente_anonimo)')
      .order('id_presupuesto', { ascending: false })
    setPresupuestos(data || [])
    setCargando(false)
  }

  function nombreMostrar(p) {
    if (p.clientes?.cliente_anonimo === 'S') return p.descripcion || '— Cliente anónimo —'
    return p.clientes?.descripcion || p.descripcion || '—'
  }

  function abrirNuevo() {
    setPresupuestoActual(null)
    setVista('detalle')
  }
  function abrirExistente(p) {
    setPresupuestoActual(p)
    setVista('detalle')
  }
  function volver() {
    setVista('lista')
    cargarPresupuestos()
  }

  const filtrados = textoBusqueda.trim()
    ? presupuestos.filter((p) => normalizar(nombreMostrar(p)).includes(normalizar(textoBusqueda)))
    : presupuestos

  if (vista === 'detalle') {
    return <DetallePresupuesto presupuesto={presupuestoActual} esMobile={esMobile} onVolver={volver} />
  }

  return (
    <div className="modulo">
      <h2>Presupuestos</h2>

      {!esMobile && (
        <div className="acciones-superiores">
          <button className="btn-primario" onClick={abrirNuevo}>+ Nuevo presupuesto</button>
        </div>
      )}

      <div className="campo-buscador">
        <input
          type="text"
          placeholder="🔎 Buscar por cliente..."
          value={textoBusqueda}
          onChange={(e) => setTextoBusqueda(e.target.value)}
        />
      </div>

      {cargando && <p>Cargando...</p>}

      {!cargando && (
        <div className="tabla-wrapper">
          <table className="tabla">
            <thead>
              <tr>
                <th>N°</th>
                <th>Cliente</th>
                <th>Fecha</th>
                <th>Estado</th>
                <th>Total</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 && (
                <tr><td colSpan="6">Todavía no hay presupuestos.{!esMobile && ' Creá el primero desde "+ Nuevo presupuesto".'}</td></tr>
              )}
              {filtrados.map((p) => (
                <tr key={p.id_presupuesto}>
                  <td>{p.id_presupuesto}</td>
                  <td>{nombreMostrar(p)}</td>
                  <td>{formatearFecha(p.fecha_presupuesto)}</td>
                  <td><BadgeEstado estado={p.estado} /></td>
                  <td>${formatearMoneda(p.total_estimado)}</td>
                  <td>
                    <button className="btn-link" onClick={() => abrirExistente(p)}>
                      {esMobile ? 'Abrir' : 'Ver / Editar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ============================================================
// SUBCOMPONENTE: Detalle de presupuesto
// ============================================================
function DetallePresupuesto({ presupuesto, esMobile, onVolver }) {
  const { mostrarToast, confirmar } = useNotificaciones()

  const [idPresu, setIdPresu] = useState(presupuesto?.id_presupuesto || null)
  const [estado, setEstado] = useState(presupuesto?.estado || 'borrador')
  const [fechaPresupuesto, setFechaPresupuesto] = useState(presupuesto?.fecha_presupuesto || new Date().toISOString().slice(0, 10))
  const [fechaValidoHasta, setFechaValidoHasta] = useState(() => {
    if (presupuesto?.fecha_valido_hasta) return presupuesto.fecha_valido_hasta
    const enSieteDias = new Date()
    enSieteDias.setDate(enSieteDias.getDate() + 7)
    return enSieteDias.toISOString().slice(0, 10)
  })
  const bloqueado = estado !== 'borrador'

  // --- cabecera / cliente ---
  const [idCliente, setIdCliente] = useState(presupuesto?.id_cliente || null)
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null)
  const [textoBuscarCliente, setTextoBuscarCliente] = useState('')
  const [clientes, setClientes] = useState([])
  const [descripcion, setDescripcion] = useState(presupuesto?.descripcion || '')
  const [domicilio, setDomicilio] = useState(presupuesto?.domicilio || '')
  const [telefono, setTelefono] = useState(presupuesto?.telefono || '')
  const [observaciones, setObservaciones] = useState(presupuesto?.observaciones || '')
  const [guardandoCabecera, setGuardandoCabecera] = useState(false)

  // --- líneas ---
  const [lineas, setLineas] = useState([])
  const [cargandoLineas, setCargandoLineas] = useState(true)
  const [guardandoLineas, setGuardandoLineas] = useState(false)

  // --- búsqueda de producto/combo (desktop) ---
  const [tipoItem, setTipoItem] = useState('producto')
  const [productos, setProductos] = useState([])
  const [combos, setCombos] = useState([])
  const [textoBuscarItem, setTextoBuscarItem] = useState('')
  const [itemSeleccionado, setItemSeleccionado] = useState(null)
  const [cantidadItem, setCantidadItem] = useState('1')
  const [precioVentaItem, setPrecioVentaItem] = useState('')
  const [buscandoPrecio, setBuscandoPrecio] = useState(false)

  // --- conversión a pedido ---
  const [fechaEntregaConvertir, setFechaEntregaConvertir] = useState('')
  const [convirtiendo, setConvirtiendo] = useState(false)

  const esMayorista = clienteSeleccionado?.tipo_cliente === 'Mayorista'

  async function cargarLineas() {
    if (!idPresu) { setCargandoLineas(false); return }
    setCargandoLineas(true)
    const { data } = await supabase.from('detalle_presupuesto').select('*').eq('id_presupuesto', idPresu).order('secuencia')
    setLineas((data || []).map((l) => ({ ...l })))
    setCargandoLineas(false)
  }

  async function cargarClientes() {
    const { data } = await supabase.from('clientes').select('*')
    setClientes(data || [])
  }
  async function cargarProductos() {
    const { data } = await supabase.from('productos').select('*').order('descripcion')
    setProductos(data || [])
  }
  async function cargarCombos() {
    const { data } = await supabase.from('combos').select('*').order('descripcion')
    setCombos(data || [])
  }

  useEffect(() => {
    if (idCliente) {
      supabase.from('clientes').select('*').eq('id_cliente', idCliente).single()
        .then(({ data }) => { if (data) setClienteSeleccionado(data) })
    }
    cargarLineas()
    cargarProductos()
    cargarCombos()
    if (!esMobile) {
      cargarClientes()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function clienteEsAnonimo(c) { return c?.cliente_anonimo === 'S' }

  const clientesFiltrados = textoBuscarCliente.trim()
    ? clientes.filter((c) => {
        const texto = clienteEsAnonimo(c) ? 'cliente anonimo' : c.descripcion
        return normalizar(texto).includes(normalizar(textoBuscarCliente))
      })
    : []

  function seleccionarCliente(c) {
    setClienteSeleccionado(c)
    setIdCliente(c.id_cliente)
    if (clienteEsAnonimo(c)) {
      setTextoBuscarCliente('— Cliente anónimo —')
      setDescripcion(''); setDomicilio(''); setTelefono('')
    } else {
      setTextoBuscarCliente(c.descripcion)
      setDescripcion(c.descripcion); setDomicilio(c.domicilio || ''); setTelefono(c.telefono || '')
    }
  }

  async function obtenerOcrearClienteAnonimoGenerico() {
    const { data: existentes } = await supabase.from('clientes').select('*').eq('cliente_anonimo', 'S').limit(1)
    if (existentes && existentes.length > 0) return existentes[0].id_cliente
    const { data: nuevo, error } = await supabase
      .from('clientes')
      .insert({ cliente_anonimo: 'S', descripcion: null, domicilio: null, telefono: null, tipo_cliente: 'Minorista' })
      .select().single()
    if (error) { mostrarToast('Error al crear el cliente anónimo genérico: ' + error.message, 'error'); return null }
    return nuevo.id_cliente
  }

  async function guardarCabecera() {
    const sinClienteSeleccionado = !idCliente
    const esAnonimo = clienteEsAnonimo(clienteSeleccionado)
    if ((sinClienteSeleccionado || esAnonimo) && !descripcion.trim()) {
      mostrarToast('La descripción (nombre) es obligatoria cuando no hay un cliente identificado seleccionado', 'error')
      return
    }
    setGuardandoCabecera(true)

    let idClienteFinal = idCliente
    if (sinClienteSeleccionado) {
      idClienteFinal = await obtenerOcrearClienteAnonimoGenerico()
      if (!idClienteFinal) { setGuardandoCabecera(false); return }
    }

    if (!fechaPresupuesto || !fechaValidoHasta) {
      mostrarToast('Completá la fecha de emisión y la fecha de validez del presupuesto', 'error')
      setGuardandoCabecera(false)
      return
    }

    const registro = {
      id_cliente: idClienteFinal,
      descripcion: (sinClienteSeleccionado || esAnonimo) ? (descripcion.trim() || null) : clienteSeleccionado.descripcion,
      domicilio: (sinClienteSeleccionado || esAnonimo) ? (domicilio.trim() || null) : clienteSeleccionado.domicilio,
      telefono: (sinClienteSeleccionado || esAnonimo) ? (telefono.trim() || null) : clienteSeleccionado.telefono,
      observaciones: observaciones.trim() || null,
      fecha_presupuesto: fechaPresupuesto,
      fecha_valido_hasta: fechaValidoHasta,
    }

    if (idPresu) {
      const { error } = await supabase.from('presupuestos').update(registro).eq('id_presupuesto', idPresu)
      if (error) { mostrarToast('Error al guardar: ' + error.message, 'error'); setGuardandoCabecera(false); return }
      mostrarToast('Presupuesto actualizado')
    } else {
      const { data, error } = await supabase.from('presupuestos').insert(registro).select().single()
      if (error) { mostrarToast('Error al guardar: ' + error.message, 'error'); setGuardandoCabecera(false); return }
      setIdPresu(data.id_presupuesto)
      mostrarToast('Presupuesto guardado. Ya podés agregar productos o combos.')
    }
    setGuardandoCabecera(false)
  }

  async function obtenerPrecioVigenteProducto(idProducto) {
    const hoy = new Date().toISOString().slice(0, 10)
    const { data } = await supabase
      .from('precios').select('*')
      .eq('id_producto', idProducto)
      .lte('fecha_inicio', hoy).gte('fecha_fin', hoy)
      .order('fecha_inicio', { ascending: false }).limit(1)
    return data && data.length ? data[0] : null
  }

  async function seleccionarItem(item) {
    setItemSeleccionado(item)
    setTextoBuscarItem(item.descripcion)
    setBuscandoPrecio(true)
    setPrecioVentaItem('')

    if (tipoItem === 'producto') {
      const precioVigente = await obtenerPrecioVigenteProducto(item.id_producto)
      if (precioVigente) {
        const precioAplicar = esMayorista && precioVigente.precio_mayorista ? precioVigente.precio_mayorista : precioVigente.precio_venta
        setPrecioVentaItem(precioAplicar)
      }
    } else if (item.precio) {
      setPrecioVentaItem(item.precio)
    }
    setBuscandoPrecio(false)
  }

  function totalActual() {
    return lineas.reduce((a, l) => a + parseFloat(l.cantidad || 0) * parseFloat(l.precio_venta || 0), 0)
  }

  async function actualizarTotalEnBD(lineasActuales) {
    if (!idPresu) return
    const total = lineasActuales.reduce((a, l) => a + parseFloat(l.cantidad || 0) * parseFloat(l.precio_venta || 0), 0)
    await supabase.from('presupuestos').update({ total_estimado: total, actualizado_en: new Date().toISOString() }).eq('id_presupuesto', idPresu)
  }

  async function agregarLinea() {
    if (!idPresu) {
      mostrarToast('Primero guardá los datos generales del presupuesto', 'error')
      return
    }
    if (!itemSeleccionado || !cantidadItem || !precioVentaItem) {
      mostrarToast('Seleccioná un producto/combo, indicá la cantidad y verificá el precio', 'error')
      return
    }
    const siguienteSecuencia = lineas.length > 0 ? Math.max(...lineas.map((l) => l.secuencia)) + 1 : 1
    const registro = {
      id_presupuesto: idPresu,
      secuencia: siguienteSecuencia,
      tipo: tipoItem,
      id_producto: tipoItem === 'producto' ? itemSeleccionado.id_producto : null,
      id_combo: tipoItem === 'combo' ? itemSeleccionado.id_combo : null,
      descripcion: itemSeleccionado.descripcion,
      cantidad: parseFloat(cantidadItem),
      precio_venta: parseFloat(precioVentaItem),
    }
    const { data, error } = await supabase.from('detalle_presupuesto').insert(registro).select().single()
    if (error) {
      mostrarToast('Error al agregar la línea: ' + error.message, 'error')
      return
    }
    const nuevasLineas = [...lineas, data]
    setLineas(nuevasLineas)
    setItemSeleccionado(null); setTextoBuscarItem(''); setCantidadItem('1'); setPrecioVentaItem('')
    actualizarTotalEnBD(nuevasLineas)
  }

  async function quitarLinea(id) {
    const confirmado = await confirmar('¿Quitar esta línea del presupuesto?')
    if (!confirmado) return
    const { error } = await supabase.from('detalle_presupuesto').delete().eq('id_detalle_presupuesto', id)
    if (error) { mostrarToast('Error al quitar la línea: ' + error.message, 'error'); return }
    const nuevasLineas = lineas.filter((l) => l.id_detalle_presupuesto !== id)
    setLineas(nuevasLineas)
    actualizarTotalEnBD(nuevasLineas)
  }

  function cambiarCantidadLinea(i, valor) {
    setLineas((prev) => prev.map((l, idx) => (idx === i ? { ...l, cantidad: valor } : l)))
  }
  function cambiarPrecioLinea(i, valor) {
    setLineas((prev) => prev.map((l, idx) => (idx === i ? { ...l, precio_venta: valor } : l)))
  }

  async function guardarCambiosLineas() {
    setGuardandoLineas(true)
    for (const l of lineas) {
      const { error } = await supabase
        .from('detalle_presupuesto')
        .update({ cantidad: parseFloat(l.cantidad || 0), precio_venta: parseFloat(l.precio_venta || 0) })
        .eq('id_detalle_presupuesto', l.id_detalle_presupuesto)
      if (error) {
        mostrarToast('Error al guardar los cambios: ' + error.message, 'error')
        setGuardandoLineas(false)
        return
      }
    }
    await actualizarTotalEnBD(lineas)
    mostrarToast('Cambios guardados')
    setGuardandoLineas(false)
  }

  function nombreClienteParaPdf() {
    if (clienteSeleccionado && !clienteEsAnonimo(clienteSeleccionado)) return clienteSeleccionado.descripcion
    return descripcion || 'Consumidor final'
  }

  function generarPDF() {
    if (lineas.length === 0) {
      mostrarToast('Este presupuesto no tiene productos o combos cargados todavía.', 'error')
      return
    }
    generarPresupuestoPdf(
      {
        id_presupuesto: idPresu,
        nombreCliente: nombreClienteParaPdf(),
        domicilio: clienteSeleccionado && !clienteEsAnonimo(clienteSeleccionado) ? clienteSeleccionado.domicilio : domicilio,
        telefono: clienteSeleccionado && !clienteEsAnonimo(clienteSeleccionado) ? clienteSeleccionado.telefono : telefono,
        fecha_presupuesto: fechaPresupuesto,
        fecha_valido_hasta: fechaValidoHasta,
        observaciones,
      },
      lineas
    )
  }

  async function convertirEnPedido() {
    if (bloqueado) return
    if (lineas.length === 0) {
      mostrarToast('El presupuesto no tiene productos o combos cargados.', 'error')
      return
    }
    if (!fechaEntregaConvertir) {
      mostrarToast('Indicá la fecha de entrega para confirmar.', 'error')
      return
    }
    const confirmado = await confirmar('¿Confirmar este presupuesto y crear el pedido definitivo? Esta acción no se puede deshacer.')
    if (!confirmado) return

    setConvirtiendo(true)
    const { data, error } = await supabase.rpc('confirmar_presupuesto', {
      p_id_presupuesto: idPresu,
      p_fecha_entrega: fechaEntregaConvertir,
    })
    setConvirtiendo(false)

    if (error) {
      mostrarToast('No se pudo convertir el presupuesto: ' + error.message, 'error')
      return
    }
    setEstado('confirmado')
    mostrarToast('¡Listo! Se creó el pedido definitivo #' + data + ' a partir de este presupuesto.')
  }

  async function descartarPresupuesto() {
    if (bloqueado) return
    const confirmado = await confirmar('¿Descartar este presupuesto? Vas a poder seguir viéndolo, pero no se podrá convertir en pedido.')
    if (!confirmado) return
    const { error } = await supabase.from('presupuestos').update({ estado: 'descartado' }).eq('id_presupuesto', idPresu)
    if (error) { mostrarToast('Error al descartar: ' + error.message, 'error'); return }
    setEstado('descartado')
    mostrarToast('Presupuesto descartado')
  }

  const total = totalActual()
  const itemsBase = tipoItem === 'producto' ? productos : combos
  const itemsFiltrados = textoBuscarItem.trim()
    ? itemsBase.filter((it) => normalizar(it.descripcion).includes(normalizar(textoBuscarItem))).slice(0, 8)
    : []

  return (
    <div className="modulo">
      <button className="btn-volver" onClick={onVolver}>← Volver a Presupuestos</button>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>{idPresu ? `Presupuesto #${idPresu}` : 'Nuevo presupuesto'}</h2>
        <BadgeEstado estado={estado} />
      </div>

      {bloqueado && (
        <p className="ayuda-vigencia" style={{ marginTop: '10px' }}>
          {estado === 'confirmado'
            ? 'Este presupuesto ya se confirmó y generó un pedido. Podés seguir generando el PDF, pero no se puede modificar ni volver a convertir.'
            : 'Este presupuesto está descartado. Podés seguir viéndolo, pero no se puede modificar ni convertir en pedido.'}
        </p>
      )}

      {/* ===== CABECERA: solo editable en desktop, o si es la primera vez ===== */}
      {!esMobile && !bloqueado && (
        <div className="subseccion">
          <h3>Datos del cliente</h3>
          <div className="formulario formulario-costos">
            <div className="campo" style={{ flex: 2, position: 'relative' }}>
              <label>Cliente</label>
              <input
                type="text"
                placeholder="Buscar cliente (dejalo vacío para consumidor final)"
                value={textoBuscarCliente}
                onChange={(e) => { setTextoBuscarCliente(e.target.value); setClienteSeleccionado(null); setIdCliente(null) }}
              />
              {textoBuscarCliente && !clienteSeleccionado && clientesFiltrados.length > 0 && (
                <div className="dropdown-resultados">
                  {clientesFiltrados.map((c) => (
                    <div key={c.id_cliente} className="dropdown-item" onClick={() => seleccionarCliente(c)}>
                      {clienteEsAnonimo(c) ? '— Cliente anónimo —' : c.descripcion}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {(!clienteSeleccionado || clienteEsAnonimo(clienteSeleccionado)) && (
            <div className="formulario formulario-costos">
              <div className="campo" style={{ flex: 2 }}>
                <label>Nombre (obligatorio si no hay cliente identificado)</label>
                <input type="text" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
              </div>
              <div className="campo" style={{ flex: 2 }}>
                <label>Domicilio</label>
                <input type="text" value={domicilio} onChange={(e) => setDomicilio(e.target.value)} />
              </div>
              <div className="campo">
                <label>Teléfono</label>
                <input type="text" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
              </div>
            </div>
          )}

          <div className="formulario formulario-costos">
            <div className="campo">
              <label>Fecha de emisión</label>
              <input type="date" value={fechaPresupuesto} onChange={(e) => setFechaPresupuesto(e.target.value)} />
            </div>
            <div className="campo">
              <label>Válido hasta</label>
              <input type="date" value={fechaValidoHasta} onChange={(e) => setFechaValidoHasta(e.target.value)} />
            </div>
          </div>

          <div className="formulario formulario-costos">
            <div className="campo" style={{ flex: 3 }}>
              <label>Observaciones (opcional, aparecen en el PDF)</label>
              <input type="text" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
            </div>
            <div className="campo-acciones">
              <button className="btn-primario" onClick={guardarCabecera} disabled={guardandoCabecera}>
                {guardandoCabecera ? 'Guardando...' : idPresu ? 'Actualizar datos' : 'Guardar presupuesto'}
              </button>
            </div>
          </div>
        </div>
      )}

      {esMobile && (
        <div className="ayuda-vigencia" style={{ marginTop: '10px' }}>
          {clienteSeleccionado && !clienteEsAnonimo(clienteSeleccionado) ? clienteSeleccionado.descripcion : (descripcion || 'Consumidor final')}
          {(clienteSeleccionado?.domicilio || domicilio) && <> · 📍 {clienteSeleccionado?.domicilio || domicilio}</>}
          {(clienteSeleccionado?.telefono || telefono) && <> · 📞 {clienteSeleccionado?.telefono || telefono}</>}
          <br />
          Emitido el {formatearFecha(fechaPresupuesto)} · Válido hasta el {formatearFecha(fechaValidoHasta)}
        </div>
      )}

      {/* ===== AGREGAR PRODUCTO/COMBO: disponible en desktop y mobile una vez guardado el presupuesto ===== */}
      {idPresu && !bloqueado && (
        <div className="subseccion">
          <h3>Agregar producto o combo</h3>
          <div className="formulario formulario-costos">
            <div className="campo">
              <label>Tipo</label>
              <select value={tipoItem} onChange={(e) => { setTipoItem(e.target.value); setItemSeleccionado(null); setTextoBuscarItem('') }}>
                <option value="producto">Producto</option>
                <option value="combo">Combo</option>
              </select>
            </div>
            <div className="campo" style={{ flex: 2, position: 'relative' }}>
              <label>Buscar {tipoItem === 'producto' ? 'producto' : 'combo'}</label>
              <input
                type="text"
                value={textoBuscarItem}
                onChange={(e) => { setTextoBuscarItem(e.target.value); setItemSeleccionado(null) }}
              />
              {textoBuscarItem && !itemSeleccionado && itemsFiltrados.length > 0 && (
                <div className="dropdown-resultados">
                  {itemsFiltrados.map((it) => (
                    <div key={it.id_producto || it.id_combo} className="dropdown-item" onClick={() => seleccionarItem(it)}>
                      {it.descripcion}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="campo">
              <label>Cantidad</label>
              <input type="number" min="1" step="1" value={cantidadItem} onChange={(e) => setCantidadItem(e.target.value)} />
            </div>
            <div className="campo">
              <label>Precio venta</label>
              <input type="number" min="0" step="0.01" value={precioVentaItem} onChange={(e) => setPrecioVentaItem(e.target.value)} disabled={buscandoPrecio} />
            </div>
            <div className="campo-acciones">
              <button className="btn-primario" onClick={agregarLinea}>Agregar</button>
            </div>
          </div>
          {itemSeleccionado && !buscandoPrecio && (
            <p className="ayuda-vigencia">💡 Precio sugerido (vigente): ${formatearMoneda(precioVentaItem)}. Podés ajustarlo antes de agregar.</p>
          )}
        </div>
      )}

      {/* ===== LÍNEAS ===== */}
      <div className="subseccion">
        <h3>Ítems del presupuesto</h3>
        {cargandoLineas ? (
          <p>Cargando...</p>
        ) : lineas.length === 0 ? (
          <p style={{ color: '#8A6A66', fontSize: '.9rem' }}>
            {idPresu ? 'Todavía no agregaste productos o combos.' : 'Guardá primero los datos del presupuesto para poder agregar ítems.'}
          </p>
        ) : esMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {lineas.map((l, i) => {
              const sub = parseFloat(l.cantidad || 0) * parseFloat(l.precio_venta || 0)
              return (
                <div key={l.id_detalle_presupuesto} style={{ border: '1px solid #E6D2C6', borderRadius: '10px', padding: '10px', background: '#FFFCF9' }}>
                  <div style={{ fontSize: '.9rem', fontWeight: 600, marginBottom: '8px' }}>{l.descripcion}</div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '.7rem', color: '#8A6A66' }}>Cantidad</label>
                      <input type="number" min="1" value={l.cantidad} disabled={bloqueado} onChange={(e) => cambiarCantidadLinea(i, e.target.value)} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '.7rem', color: '#8A6A66' }}>Precio</label>
                      <input type="number" min="0" step="0.01" value={l.precio_venta} disabled={bloqueado} onChange={(e) => cambiarPrecioLinea(i, e.target.value)} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                    {!bloqueado ? (
                      <button className="btn-link btn-eliminar" onClick={() => quitarLinea(l.id_detalle_presupuesto)}>Quitar</button>
                    ) : <span />}
                    <div style={{ fontSize: '.85rem', fontWeight: 600, color: '#D4624A' }}>
                      ${formatearMoneda(sub)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="tabla-wrapper">
            <table className="tabla">
              <thead>
                <tr><th>Descripción</th><th>Cantidad</th><th>Precio</th><th>Subtotal</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                {lineas.map((l, i) => (
                  <tr key={l.id_detalle_presupuesto}>
                    <td>{l.descripcion}</td>
                    <td>
                      <input
                        type="number" min="1" value={l.cantidad} disabled={bloqueado}
                        style={{ width: '80px' }}
                        onChange={(e) => cambiarCantidadLinea(i, e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="number" min="0" step="0.01" value={l.precio_venta} disabled={bloqueado}
                        style={{ width: '110px' }}
                        onChange={(e) => cambiarPrecioLinea(i, e.target.value)}
                      />
                    </td>
                    <td>${formatearMoneda(parseFloat(l.cantidad) * parseFloat(l.precio_venta))}</td>
                    <td>
                      {!bloqueado && (
                        <button className="btn-link btn-eliminar" onClick={() => quitarLinea(l.id_detalle_presupuesto)}>Quitar</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!bloqueado && lineas.length > 0 && (
          <div style={{ marginTop: '10px' }}>
            <button className="btn-secundario" onClick={guardarCambiosLineas} disabled={guardandoLineas}>
              {guardandoLineas ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px', fontSize: '1.1rem', fontWeight: 600 }}>
          Total: ${formatearMoneda(total)}
        </div>
      </div>

      {/* ===== ACCIONES FINALES: PDF y convertir, en ambos (mobile y desktop) ===== */}
      <div className="subseccion">
        <div className="formulario formulario-costos">
          <button className="btn-secundario" onClick={generarPDF}>📄 Generar PDF</button>
          {!bloqueado && idPresu && (
            <button className="btn-secundario" onClick={descartarPresupuesto}>Descartar presupuesto</button>
          )}
        </div>

        {!bloqueado && idPresu && (
          <div className="formulario formulario-costos" style={{ marginTop: '10px' }}>
            <div className="campo">
              <label>Fecha de entrega (obligatoria para convertir en pedido)</label>
              <input type="date" value={fechaEntregaConvertir} onChange={(e) => setFechaEntregaConvertir(e.target.value)} />
            </div>
            <div className="campo-acciones">
              <button className="btn-primario" onClick={convertirEnPedido} disabled={convirtiendo}>
                {convirtiendo ? 'Convirtiendo...' : 'Convertir en pedido'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Presupuestos
