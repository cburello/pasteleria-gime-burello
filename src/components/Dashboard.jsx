import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { generarListaPreciosDesdeBD } from '../lib/listaPreciosPdf'

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

function Dashboard({ onAbrirPedido }) {
  const esMobile = useEsMobile()
  const [cargando, setCargando] = useState(true)
  const [proximosEntregar, setProximosEntregar] = useState([])
  const [conSaldoPendiente, setConSaldoPendiente] = useState([])
  const [resumenMes, setResumenMes] = useState({ cantidad: 0, totalFacturado: 0, totalCobrado: 0 })
  const [tipoListaPdf, setTipoListaPdf] = useState('ambos')
  const [generandoPdf, setGenerandoPdf] = useState(false)
  const [sinCostoVigente, setSinCostoVigente] = useState([])

  useEffect(() => {
    cargarDashboard()
  }, [])

  function formatearMoneda(valor) {
    if (valor === null || valor === undefined || isNaN(valor)) return '0,00'
    return new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(valor)
  }

  function formatearFecha(fecha) {
    if (!fecha) return ''
    const [anio, mes, dia] = fecha.slice(0, 10).split('-')
    return `${dia}/${mes}/${anio}`
  }

  function nombreCliente(pedido) {
    if (pedido.clientes?.cliente_anonimo === 'S') return pedido.descripcion || '— Cliente anónimo —'
    return pedido.clientes?.descripcion || pedido.descripcion || '—'
  }

  async function cargarDashboard() {
    setCargando(true)

    const hoy = new Date()
    const hoyStr = hoy.toISOString().slice(0, 10)

    const en7dias = new Date(hoy)
    en7dias.setDate(en7dias.getDate() + 7)
    const en7diasStr = en7dias.toISOString().slice(0, 10)

    const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10)

    const { data: pedidos } = await supabase
      .from('pedidos')
      .select('*, clientes(descripcion, cliente_anonimo)')
      .order('fecha_entrega', { ascending: true })

    const { data: detalles } = await supabase.from('detalle_pedido').select('*')
    const { data: pagos } = await supabase.from('pagos').select('*')

    if (!pedidos) {
      setCargando(false)
      return
    }

    const pedidosConTotales = pedidos.map((p) => {
      const lineasPedido = (detalles || []).filter((d) => d.id_pedido === p.id_pedido)
      const pagosPedido = (pagos || []).filter((pg) => pg.id_pedido === p.id_pedido)

      const total = lineasPedido.reduce((acc, l) => acc + parseFloat(l.precio_venta) * parseFloat(l.cantidad), 0)
      const pagado = pagosPedido.reduce((acc, pg) => acc + parseFloat(pg.importe), 0)
      const saldo = total - pagado

      return { ...p, total, pagado, saldo }
    })

    const proximos = pedidosConTotales.filter(
      (p) => p.fecha_entrega >= hoyStr && p.fecha_entrega <= en7diasStr
    )

    const pendientes = pedidosConTotales.filter((p) => p.saldo > 0.01)

    const pedidosDelMes = pedidosConTotales.filter((p) => p.fecha_pedido >= primerDiaMes)
    const totalFacturadoMes = pedidosDelMes.reduce((acc, p) => acc + p.total, 0)
    const totalCobradoMes = pedidosDelMes.reduce((acc, p) => acc + p.pagado, 0)

    setProximosEntregar(proximos)
    setConSaldoPendiente(pendientes)
    setResumenMes({
      cantidad: pedidosDelMes.length,
      totalFacturado: totalFacturadoMes,
      totalCobrado: totalCobradoMes,
    })

    // Materias primas sin costo vigente a la fecha de hoy (hora Argentina)
    const hoyArg = new Date().toLocaleString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).slice(0, 10)
    const [{ data: materias }, { data: costos }] = await Promise.all([
      supabase.from('materias_primas').select('id_materia_prima, descripcion'),
      supabase.from('costos_materia_prima').select('id_materia_prima, fecha_inicio, fecha_fin'),
    ])
    const conVigente = new Set(
      (costos || [])
        .filter((c) => {
          const desde = (c.fecha_inicio || '').slice(0, 10)
          const hasta = (c.fecha_fin || '').slice(0, 10)
          return desde <= hoyArg && (!hasta || hoyArg <= hasta)
        })
        .map((c) => c.id_materia_prima)
    )
    setSinCostoVigente((materias || []).filter((m) => !conVigente.has(m.id_materia_prima)))

    setCargando(false)
  }

  async function generarListaPrecios() {
    setGenerandoPdf(true)
    try {
      await generarListaPreciosDesdeBD(supabase, tipoListaPdf)
    } catch (e) {
      alert('No se pudo generar la lista de precios: ' + e.message)
    }
    setGenerandoPdf(false)
  }

  function alertaSinCosto() {
    if (sinCostoVigente.length === 0) return null
    return (
      <div
        style={{
          background: '#FBEFD9',
          border: '1px solid #E3C77A',
          borderLeft: '4px solid #C9A227',
          borderRadius: '10px',
          padding: '12px 14px',
          marginBottom: '16px',
          color: '#6B5310',
          fontSize: '.88rem',
          lineHeight: 1.6,
        }}
      >
        <strong>⚠️ {sinCostoVigente.length} materia{sinCostoVigente.length > 1 ? 's' : ''} prima
        {sinCostoVigente.length > 1 ? 's' : ''} sin costo vigente.</strong> Los precios teóricos que la usen quedan mal calculados
        hasta que cargues un costo con vigencia a hoy.
        <div style={{ marginTop: '6px' }}>
          {sinCostoVigente.slice(0, 8).map((m) => m.descripcion).join(' · ')}
          {sinCostoVigente.length > 8 ? ` · y ${sinCostoVigente.length - 8} más` : ''}
        </div>
      </div>
    )
  }

  if (cargando) {
    return (
      <div className="modulo">
        <p>Cargando dashboard...</p>
      </div>
    )
  }

  // ===== VISTA MOBILE: tarjetas en vez de tablas =====
  if (esMobile) {
    return (
      <div className="pedidos-mobile">
        <div className="pedidos-mobile-header">
          <h2>Inicio</h2>
        </div>

        {alertaSinCosto()}

        <div className="mobile-resumen-card">
          <div className="nombre" style={{ marginBottom: '8px' }}>Resumen del mes</div>
          <div className="tarjeta-pedido-linea2" style={{ marginTop: 0 }}>
            <span className="tarjeta-pedido-total">Pedidos del mes</span>
            <span style={{ fontWeight: 600 }}>{resumenMes.cantidad}</span>
          </div>
          <div className="tarjeta-pedido-linea2">
            <span className="tarjeta-pedido-total">Total facturado</span>
            <span style={{ fontWeight: 600 }}>${formatearMoneda(resumenMes.totalFacturado)}</span>
          </div>
          <div className="tarjeta-pedido-linea2">
            <span className="tarjeta-pedido-total">Total cobrado</span>
            <span style={{ fontWeight: 600, color: '#2D6A35' }}>${formatearMoneda(resumenMes.totalCobrado)}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '10px', alignItems: 'center' }}>
          <select
            value={tipoListaPdf}
            onChange={(e) => setTipoListaPdf(e.target.value)}
            style={{ flex: 1, padding: '9px 10px', border: '1px solid #E8D5CF', borderRadius: '8px', fontSize: '13px', fontFamily: 'Poppins, sans-serif' }}
          >
            <option value="ambos">Ambos precios</option>
            <option value="minorista">Solo minorista</option>
            <option value="mayorista">Solo mayorista</option>
          </select>
          <button
            className="btn-secundario"
            style={{ whiteSpace: 'nowrap', padding: '9px 14px', fontSize: '13px' }}
            onClick={generarListaPrecios}
            disabled={generandoPdf}
          >
            {generandoPdf ? 'Generando...' : '📄 Lista de precios'}
          </button>
        </div>

        <h3 style={{ fontSize: '15px', margin: '20px 0 10px', color: '#4A2C2A' }}>
          Próximos a entregar (7 días)
        </h3>
        {proximosEntregar.length === 0 ? (
          <p className="aviso-ok">✅ No tenés entregas programadas para los próximos 7 días.</p>
        ) : (
          <div className="lista-tarjetas" style={{ paddingBottom: '10px' }}>
            {proximosEntregar.map((p) => (
              <div key={p.id_pedido} className="tarjeta-pedido" onClick={() => onAbrirPedido(p.id_pedido)}>
                <div className="tarjeta-pedido-linea1">
                  <span className="tarjeta-pedido-cliente">{nombreCliente(p)}</span>
                  <span className="tarjeta-pedido-id">#{p.id_pedido}</span>
                </div>
                <div className="tarjeta-pedido-fecha">Entrega: {formatearFecha(p.fecha_entrega)}</div>
                <div className="tarjeta-pedido-linea2">
                  <span className="tarjeta-pedido-total">Total ${formatearMoneda(p.total)}</span>
                  <span className={`tarjeta-pedido-estado ${p.saldo > 0.01 ? 'pendiente' : 'cobrado'}`}>
                    {p.saldo > 0.01 ? `Saldo $${formatearMoneda(p.saldo)}` : 'Cobrado'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        <h3 style={{ fontSize: '15px', margin: '20px 0 10px', color: '#4A2C2A' }}>
          Pedidos con saldo pendiente
        </h3>
        {conSaldoPendiente.length === 0 ? (
          <p className="aviso-ok">✅ No hay pedidos con saldo pendiente.</p>
        ) : (
          <div className="lista-tarjetas">
            {conSaldoPendiente.map((p) => (
              <div key={p.id_pedido} className="tarjeta-pedido" onClick={() => onAbrirPedido(p.id_pedido)}>
                <div className="tarjeta-pedido-linea1">
                  <span className="tarjeta-pedido-cliente">{nombreCliente(p)}</span>
                  <span className="tarjeta-pedido-id">#{p.id_pedido}</span>
                </div>
                <div className="tarjeta-pedido-fecha">Pedido: {formatearFecha(p.fecha_pedido)}</div>
                <div className="tarjeta-pedido-linea2">
                  <span className="tarjeta-pedido-total">Total ${formatearMoneda(p.total)}</span>
                  <span className="tarjeta-pedido-estado pendiente">
                    Saldo ${formatearMoneda(p.saldo)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ===== VISTA DESKTOP (rediseñada: totales centrados + filas con estado de pago) =====
  return (
    <div className="modulo">
      <h2>Inicio</h2>

      {alertaSinCosto()}

      <div className="subseccion">
        <h3 className="dashboard-subtitulo">Resumen del mes en curso</h3>
        <div className="dashboard-resumen-grid">
          <div className="dashboard-resumen-item">
            <span className="dashboard-resumen-label">Pedidos del mes</span>
            <span className="dashboard-resumen-valor">{resumenMes.cantidad}</span>
          </div>
          <div className="dashboard-resumen-item con-borde">
            <span className="dashboard-resumen-label">Total facturado</span>
            <span className="dashboard-resumen-valor">${formatearMoneda(resumenMes.totalFacturado)}</span>
          </div>
          <div className="dashboard-resumen-item">
            <span className="dashboard-resumen-label">Total cobrado</span>
            <span className="dashboard-resumen-valor cobrado">${formatearMoneda(resumenMes.totalCobrado)}</span>
          </div>
        </div>
      </div>

      <div className="subseccion">
        <h3 className="dashboard-subtitulo">Próximos a entregar (7 días)</h3>
        {proximosEntregar.length === 0 ? (
          <p className="aviso-ok">✅ No tenés entregas programadas para los próximos 7 días.</p>
        ) : (
          <div className="dashboard-filas">
            {proximosEntregar.map((p) => (
              <div key={p.id_pedido} className="dashboard-fila">
                <div className="dashboard-fila-principal">
                  <span className="dashboard-fila-fecha">{formatearFecha(p.fecha_entrega)}</span>
                  <span className="dashboard-fila-cliente">{nombreCliente(p)}</span>
                </div>
                <span className="dashboard-fila-monto">Total ${formatearMoneda(p.total)}</span>
                <span className={`dashboard-fila-monto ${p.saldo > 0.01 ? 'pendiente' : 'cobrado'}`}>
                  Saldo ${formatearMoneda(p.saldo)}
                </span>
                <span className={`tarjeta-pedido-estado ${p.saldo > 0.01 ? 'pendiente' : 'cobrado'}`}>
                  {p.saldo > 0.01 ? 'Pendiente' : 'Cobrado'}
                </span>
                <button className="btn-link" onClick={() => onAbrirPedido(p.id_pedido)}>
                  Ver pedido
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="subseccion">
        <h3 className="dashboard-subtitulo">Pedidos con saldo pendiente</h3>
        {conSaldoPendiente.length === 0 ? (
          <p className="aviso-ok">✅ No hay pedidos con saldo pendiente.</p>
        ) : (
          <div className="dashboard-filas">
            {conSaldoPendiente.map((p) => (
              <div key={p.id_pedido} className="dashboard-fila">
                <div className="dashboard-fila-principal">
                  <span className="dashboard-fila-fecha">{formatearFecha(p.fecha_pedido)}</span>
                  <span className="dashboard-fila-cliente">{nombreCliente(p)}</span>
                </div>
                <span className="dashboard-fila-monto">Total ${formatearMoneda(p.total)}</span>
                <span className="dashboard-fila-monto pendiente">Saldo ${formatearMoneda(p.saldo)}</span>
                <span className="tarjeta-pedido-estado pendiente">Pendiente</span>
                <button className="btn-link" onClick={() => onAbrirPedido(p.id_pedido)}>
                  Ver pedido
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Dashboard