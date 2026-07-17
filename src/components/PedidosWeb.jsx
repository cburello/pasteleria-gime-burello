import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNotificaciones } from '../hooks/useNotificaciones'

// Detecta mobile igual que en el resto de la app (768px)
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

const COL = {
  coral: '#E8765C', coralDark: '#D4624A', bg: '#FFF5F2', card: '#FFFFFF',
  text: '#4A2C2A', sec: '#8A6A66', line: '#F0DAD3',
  ok: '#2E7D32', okBg: '#E8F5E9', danger: '#C0392B', dangerBg: '#FDECEA',
  warn: '#B26A00', warnBg: '#FBEFD9',
}

const fmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })

function formatearFechaHora(f) {
  if (!f) return ''
  const d = new Date(f)
  return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function formatearFecha(f) {
  if (!f) return ''
  const [a, m, d] = f.slice(0, 10).split('-')
  return d + '/' + m + '/' + a
}

function PedidosWeb() {
  const { confirmar: confirmarDialogo } = useNotificaciones()
  const esMobile = useEsMobile()
  const [pedidos, setPedidos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [seleccionado, setSeleccionado] = useState(null)
  const [lineas, setLineas] = useState([])
  const [fechaEntrega, setFechaEntrega] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [mensaje, setMensaje] = useState(null)

  useEffect(() => { cargarPedidos() }, [])

  async function cargarPedidos() {
    setCargando(true)
    const { data, error } = await supabase
      .from('pedido_web')
      .select('*')
      .eq('estado', 'pendiente')
      .order('id_pedido_web', { ascending: false })
    if (error) {
      setMensaje({ tipo: 'error', texto: 'Error al cargar los pedidos web: ' + error.message })
    } else {
      setPedidos(data || [])
    }
    setCargando(false)
  }

  async function seleccionar(pedido) {
    setSeleccionado(pedido)
    setFechaEntrega(pedido.fecha_entrega || '')
    setMensaje(null)
    const { data } = await supabase
      .from('detalle_pedido_web')
      .select('*')
      .eq('id_pedido_web', pedido.id_pedido_web)
      .order('secuencia')
    setLineas((data || []).map((l) => ({ ...l })))
  }

  function cerrarDetalle() {
    setSeleccionado(null)
    setLineas([])
    setMensaje(null)
  }

  function cambiarCantidad(i, valor) {
    setLineas((prev) => prev.map((l, idx) => (idx === i ? { ...l, cantidad: valor } : l)))
  }
  function cambiarPrecio(i, valor) {
    setLineas((prev) => prev.map((l, idx) => (idx === i ? { ...l, precio_venta: valor } : l)))
  }

  function totalActual() {
    return lineas.reduce((a, l) => a + parseFloat(l.cantidad || 0) * parseFloat(l.precio_venta || 0), 0)
  }

  async function guardarCambios() {
    if (!seleccionado) return false
    setProcesando(true)
    for (const l of lineas) {
      const { error } = await supabase
        .from('detalle_pedido_web')
        .update({ cantidad: parseFloat(l.cantidad || 0), precio_venta: parseFloat(l.precio_venta || 0) })
        .eq('id_detalle_web', l.id_detalle_web)
      if (error) {
        setMensaje({ tipo: 'error', texto: 'Error al guardar: ' + error.message })
        setProcesando(false)
        return false
      }
    }
    await supabase
      .from('pedido_web')
      .update({ total_estimado: totalActual() })
      .eq('id_pedido_web', seleccionado.id_pedido_web)
    setProcesando(false)
    return true
  }

  async function handleGuardar() {
    const ok = await guardarCambios()
    if (ok) setMensaje({ tipo: 'ok', texto: 'Cambios guardados.' })
  }

  async function confirmar() {
    if (!seleccionado) return
    if (!fechaEntrega) {
      setMensaje({ tipo: 'error', texto: 'La fecha de entrega es obligatoria para confirmar.' })
      return
    }
    if (lineas.length === 0) {
      setMensaje({ tipo: 'error', texto: 'El pedido no tiene items.' })
      return
    }
    if (!(await confirmarDialogo('¿Confirmar este pedido y crear el pedido definitivo?'))) return

    setProcesando(true)
    const guardado = await guardarCambios()
    if (!guardado) { setProcesando(false); return }

    const { data, error } = await supabase.rpc('confirmar_pedido_web', {
      p_id_pedido_web: seleccionado.id_pedido_web,
      p_fecha_entrega: fechaEntrega,
    })
    setProcesando(false)

    if (error) {
      setMensaje({ tipo: 'error', texto: 'No se pudo confirmar: ' + error.message })
      return
    }
    setMensaje({ tipo: 'ok', texto: 'Pedido confirmado. Se creó el pedido definitivo #' + data + '.' })
    cerrarDetalle()
    cargarPedidos()
  }

  async function descartar() {
    if (!seleccionado) return
    if (!(await confirmarDialogo('¿Descartar este pedido web? No se creará ningún pedido.'))) return
    setProcesando(true)
    const { error } = await supabase
      .from('pedido_web')
      .update({ estado: 'descartado' })
      .eq('id_pedido_web', seleccionado.id_pedido_web)
    setProcesando(false)
    if (error) {
      setMensaje({ tipo: 'error', texto: 'Error al descartar: ' + error.message })
      return
    }
    setMensaje({ tipo: 'ok', texto: 'Pedido descartado.' })
    cerrarDetalle()
    cargarPedidos()
  }

  // ---------- estilos ----------
  const est = {
    wrap: { padding: esMobile ? '12px' : '20px', color: COL.text },
    titulo: { fontSize: '1.4rem', fontWeight: 600, margin: '0 0 4px', color: COL.text },
    sub: { fontSize: '.85rem', color: COL.sec, margin: '0 0 16px' },
    grid: esMobile
      ? { display: 'flex', flexDirection: 'column', gap: '14px' }
      : { display: 'grid', gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 1.1fr)', gap: '18px', alignItems: 'start' },
    listaItem: (activo) => ({
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
      border: `1px solid ${activo ? COL.coral : COL.line}`, borderRadius: '12px',
      padding: '10px 12px', background: COL.card, cursor: 'pointer',
      boxShadow: activo ? `0 0 0 1px ${COL.coral}` : 'none',
    }),
    panel: { background: COL.card, border: `1px solid ${COL.line}`, borderRadius: '14px', padding: esMobile ? '14px' : '16px 18px' },
    badge: (bg, color) => ({ fontSize: '.72rem', padding: '2px 10px', borderRadius: '20px', background: bg, color, fontWeight: 600 }),
    input: { width: '100%', padding: '7px 9px', border: `1px solid ${COL.line}`, borderRadius: '8px', background: COL.card, color: COL.text, colorScheme: 'light', fontFamily: 'inherit', fontSize: '.9rem', boxSizing: 'border-box' },
    btn: { padding: '9px 14px', borderRadius: '10px', border: `1px solid ${COL.line}`, background: COL.card, color: COL.text, cursor: 'pointer', fontSize: '.85rem', fontWeight: 600 },
    btnOk: { padding: '9px 14px', borderRadius: '10px', border: 'none', background: COL.ok, color: '#fff', cursor: 'pointer', fontSize: '.85rem', fontWeight: 600 },
    btnDanger: { padding: '9px 14px', borderRadius: '10px', border: `1px solid ${COL.danger}`, background: COL.card, color: COL.danger, cursor: 'pointer', fontSize: '.85rem', fontWeight: 600 },
  }

  function bannerMensaje() {
    if (!mensaje) return null
    const ok = mensaje.tipo === 'ok'
    return (
      <div style={{ padding: '10px 12px', borderRadius: '10px', marginBottom: '14px', fontSize: '.85rem', background: ok ? COL.okBg : COL.dangerBg, color: ok ? COL.ok : COL.danger, border: `1px solid ${ok ? COL.ok : COL.danger}22` }}>
        {mensaje.texto}
      </div>
    )
  }

  function renderLista() {
    if (pedidos.length === 0) {
      return <p style={{ color: COL.sec, fontSize: '.9rem' }}>No hay pedidos web pendientes.</p>
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {pedidos.map((p) => {
          const activo = seleccionado && seleccionado.id_pedido_web === p.id_pedido_web
          return (
            <div key={p.id_pedido_web} style={est.listaItem(activo)} onClick={() => seleccionar(p)}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '.9rem', fontWeight: 600, color: COL.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  #{p.id_pedido_web} · {p.nombre}
                </div>
                <div style={{ fontSize: '.75rem', color: COL.sec }}>{formatearFechaHora(p.creado_en)}</div>
              </div>
              <span style={{ fontSize: '.82rem', color: COL.coralDark, fontWeight: 600, whiteSpace: 'nowrap' }}>
                {fmt.format(p.total_estimado || 0)}
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  function renderLineaEditable(l, i) {
    const sub = parseFloat(l.cantidad || 0) * parseFloat(l.precio_venta || 0)
    if (esMobile) {
      return (
        <div key={l.id_detalle_web} style={{ border: `1px solid ${COL.line}`, borderRadius: '10px', padding: '10px', background: COL.bg }}>
          <div style={{ fontSize: '.9rem', fontWeight: 600, marginBottom: '8px' }}>
            {l.descripcion}{l.tipo === 'combo' ? ' (combo)' : ''}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '.7rem', color: COL.sec }}>Cantidad</label>
              <input type="number" min="1" value={l.cantidad} style={est.input} onChange={(e) => cambiarCantidad(i, e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '.7rem', color: COL.sec }}>Precio</label>
              <input type="number" min="0" step="100" value={l.precio_venta} style={est.input} onChange={(e) => cambiarPrecio(i, e.target.value)} />
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: '.85rem', color: COL.coralDark, fontWeight: 600, marginTop: '6px' }}>
            {fmt.format(sub)}
          </div>
        </div>
      )
    }
    return (
      <div key={l.id_detalle_web} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 70px 110px 100px', gap: '8px', alignItems: 'center', border: `1px solid ${COL.line}`, borderRadius: '10px', padding: '8px 10px' }}>
        <span style={{ fontSize: '.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {l.descripcion}{l.tipo === 'combo' ? ' (combo)' : ''}
        </span>
        <input type="number" min="1" value={l.cantidad} style={{ ...est.input, textAlign: 'center' }} onChange={(e) => cambiarCantidad(i, e.target.value)} />
        <input type="number" min="0" step="100" value={l.precio_venta} style={{ ...est.input, textAlign: 'right' }} onChange={(e) => cambiarPrecio(i, e.target.value)} />
        <span style={{ fontSize: '.88rem', textAlign: 'right', fontWeight: 600 }}>{fmt.format(sub)}</span>
      </div>
    )
  }

  function renderDetalle() {
    if (!seleccionado) {
      if (esMobile) return null
      return (
        <div style={est.panel}>
          <p style={{ color: COL.sec, fontSize: '.9rem', margin: 0 }}>Elegí un pedido de la lista para revisarlo.</p>
        </div>
      )
    }
    return (
      <div style={est.panel}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={{ fontSize: '1.05rem', fontWeight: 600 }}>Pedido #{seleccionado.id_pedido_web}</span>
          <span style={est.badge(COL.warnBg, COL.warn)}>pendiente</span>
        </div>

        <div style={{ fontSize: '.85rem', lineHeight: 1.7, marginBottom: '12px' }}>
          <div><span style={{ color: COL.sec }}>Cliente: </span>{seleccionado.nombre}</div>
          {seleccionado.telefono && <div><span style={{ color: COL.sec }}>Teléfono: </span>{seleccionado.telefono}</div>}
          {seleccionado.domicilio && <div><span style={{ color: COL.sec }}>Domicilio: </span>{seleccionado.domicilio}</div>}
          {seleccionado.fecha_entrega && <div><span style={{ color: COL.sec }}>Entrega deseada: </span>{formatearFecha(seleccionado.fecha_entrega)}</div>}
          {seleccionado.nota && <div><span style={{ color: COL.sec }}>Nota: </span>{seleccionado.nota}</div>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {lineas.map((l, i) => renderLineaEditable(l, i))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: `1px solid ${COL.line}`, marginTop: '12px', paddingTop: '10px' }}>
          <span style={{ fontSize: '.85rem', color: COL.sec }}>Total</span>
          <span style={{ fontSize: '1.3rem', fontWeight: 600 }}>{fmt.format(totalActual())}</span>
        </div>

        <div style={{ marginTop: '12px' }}>
          <label style={{ fontSize: '.72rem', letterSpacing: '.04em', textTransform: 'uppercase', color: COL.sec }}>
            Fecha de entrega (obligatoria para confirmar)
          </label>
          <input type="date" value={fechaEntrega} style={{ ...est.input, marginTop: '4px' }} onChange={(e) => setFechaEntrega(e.target.value)} />
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap' }}>
          <button style={{ ...est.btnOk, flex: 1, minWidth: '150px', opacity: procesando ? 0.6 : 1 }} disabled={procesando} onClick={confirmar}>
            {procesando ? 'Procesando…' : 'Confirmar pedido'}
          </button>
          <button style={{ ...est.btn, opacity: procesando ? 0.6 : 1 }} disabled={procesando} onClick={handleGuardar}>Guardar cambios</button>
          <button style={{ ...est.btnDanger, opacity: procesando ? 0.6 : 1 }} disabled={procesando} onClick={descartar}>Descartar</button>
          {esMobile && <button style={est.btn} onClick={cerrarDetalle}>Volver a la lista</button>}
        </div>
      </div>
    )
  }

  return (
    <div style={est.wrap}>
      <h2 style={est.titulo}>Pedidos web pendientes</h2>
      <p style={est.sub}>Pedidos que llegan desde la web. Revisá, ajustá y confirmá para crear el pedido definitivo.</p>

      {bannerMensaje()}

      {cargando ? (
        <p style={{ color: COL.sec }}>Cargando…</p>
      ) : (
        <div style={est.grid}>
          {(!esMobile || !seleccionado) && <div>{renderLista()}</div>}
          {renderDetalle()}
        </div>
      )}
    </div>
  )
}

export default PedidosWeb
