import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { generarListaPreciosDesdeBD } from '../lib/listaPreciosPdf'
import { useNotificaciones } from '../hooks/useNotificaciones'
import { useEsMobile } from '../hooks/useEsMobile'
import { ultimoBackup, tablasConCambios, dispararBackup } from '../lib/backup'

const VEINTICUATRO_HS_MS = 24 * 60 * 60 * 1000

function Dashboard({ onAbrirPedido }) {
  const { mostrarToast } = useNotificaciones()
  const esMobile = useEsMobile()
  const [cargando, setCargando] = useState(true)
  const [proximosEntregar, setProximosEntregar] = useState([])
  const [conSaldoPendiente, setConSaldoPendiente] = useState([])
  const [resumenMes, setResumenMes] = useState({ cantidad: 0, totalFacturado: 0, totalCobrado: 0 })
  const [tipoListaPdf, setTipoListaPdf] = useState('ambos')
  const [generandoPdf, setGenerandoPdf] = useState(false)
  const [sinCostoVigente, setSinCostoVigente] = useState([])
  const [estadoBackup, setEstadoBackup] = useState(null)
  const [haciendoBackup, setHaciendoBackup] = useState(false)

  useEffect(() => {
    cargarDashboard()
    cargarEstadoBackup()
  }, [])

  async function cargarEstadoBackup() {
    try {
      const ultimo = await ultimoBackup()
      const cambios = await tablasConCambios(ultimo)
      const pasaron24hs = !ultimo || (Date.now() - new Date(ultimo.fecha).getTime()) > VEINTICUATRO_HS_MS
      setEstadoBackup({
        ultimo,
        cambios,
        vencido: pasaron24hs && (!ultimo || cambios.length > 0),
      })
    } catch {
      // si falla el chequeo, no molestamos con un aviso: simplemente no se muestra el widget
      setEstadoBackup(null)
    }
  }

  async function hacerBackupDesdeInicio() {
    setHaciendoBackup(true)
    try {
      const resultado = await dispararBackup()
      mostrarToast(`Backup completo: ${resultado.tablas} tablas, ${resultado.registros} registros.`)
      cargarEstadoBackup()
    } catch (e) {
      mostrarToast('No se pudo hacer el backup: ' + e.message, 'error')
    } finally {
      setHaciendoBackup(false)
    }
  }

  function tiempoDesde(fechaIso) {
    const ms = Date.now() - new Date(fechaIso).getTime()
    const horas = Math.floor(ms / (60 * 60 * 1000))
    if (horas < 1) return 'hace menos de una hora'
    if (horas < 24) return `hace ${horas} hora${horas > 1 ? 's' : ''}`
    const dias = Math.floor(horas / 24)
    return `hace ${dias} día${dias > 1 ? 's' : ''}`
  }

  function filaAvisoBackup() {
    if (!estadoBackup || !estadoBackup.vencido) return null
    const { ultimo, cambios } = estadoBackup
    return (
      <div className="aviso-fila" key="backup">
        <span className="aviso-fila-icono">💾</span>
        <span className="aviso-fila-texto">
          <strong>{ultimo ? 'Hace más de 24hs que no hacés un backup' : 'Nunca hiciste un backup'}</strong>
          {ultimo
            ? ` — último ${tiempoDesde(ultimo.fecha)}, cambiaron ${cambios.length} tabla${cambios.length > 1 ? 's' : ''} desde entonces.`
            : ' — conviene hacer uno antes de seguir cargando datos.'}
        </span>
        <button className="aviso-fila-accion" onClick={hacerBackupDesdeInicio} disabled={haciendoBackup}>
          {haciendoBackup ? 'Haciendo backup...' : 'Hacer backup ahora'}
        </button>
      </div>
    )
  }

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
      mostrarToast('No se pudo generar la lista de precios: ' + e.message, 'error')
    }
    setGenerandoPdf(false)
  }

  function filaAvisoCostos() {
    if (sinCostoVigente.length === 0) return null
    return (
      <div className="aviso-fila" key="costos">
        <span className="aviso-fila-icono">⚠️</span>
        <span className="aviso-fila-texto">
          {sinCostoVigente.length} materia{sinCostoVigente.length > 1 ? 's' : ''} prima
          {sinCostoVigente.length > 1 ? 's' : ''} sin costo vigente
        </span>
      </div>
    )
  }

  function avisosDesktop() {
    const filaBackup = filaAvisoBackup()
    const filaCostos = filaAvisoCostos()
    if (!filaBackup && !filaCostos) return null
    return (
      <div className="avisos-compactos">
        {filaBackup}
        {filaCostos}
      </div>
    )
  }

  function avisosMobile() {
    const filaCostos = filaAvisoCostos()
    if (!filaCostos) return null
    return <div className="avisos-compactos">{filaCostos}</div>
  }

  function iniciales(nombre) {
    const limpio = (nombre || '').trim()
    if (!limpio) return '—'
    return limpio
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0])
      .join('')
      .toUpperCase()
  }

  function fechaHoyCorta() {
    const dias = ['dom.', 'lun.', 'mar.', 'mié.', 'jue.', 'vie.', 'sáb.']
    const hoy = new Date()
    const d = String(hoy.getDate()).padStart(2, '0')
    const m = String(hoy.getMonth() + 1).padStart(2, '0')
    return `${dias[hoy.getDay()]} ${d}/${m}/${hoy.getFullYear()}`
  }

  function filaPedidoOperativa(p, campoFecha) {
    const pendiente = p.saldo > 0.01
    return (
      <div
        key={p.id_pedido}
        className="fila-operativa"
        onClick={() => onAbrirPedido(p.id_pedido)}
      >
        <span className={`fila-operativa-dot ${pendiente ? 'pendiente' : 'cobrado'}`}></span>
        <span className="avatar-iniciales">{iniciales(nombreCliente(p))}</span>
        <div className="fila-operativa-info">
          <div className="fila-operativa-nombre">{nombreCliente(p)}</div>
          <div className="fila-operativa-sub">{formatearFecha(p[campoFecha])} · #{p.id_pedido}</div>
        </div>
        <div className="fila-operativa-montos">
          <div className="fila-operativa-total">${formatearMoneda(p.total)}</div>
          <div className={`fila-operativa-estado ${pendiente ? 'pendiente' : 'cobrado'}`}>
            {pendiente ? `Saldo $${formatearMoneda(p.saldo)}` : 'Cobrado'}
          </div>
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

        {avisosMobile()}

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
                <div className="tarjeta-pedido-linea1" style={{ alignItems: 'center' }}>
                  <span className="avatar-iniciales">{iniciales(nombreCliente(p))}</span>
                  <span className="tarjeta-pedido-cliente" style={{ flex: 1 }}>{nombreCliente(p)}</span>
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
                <div className="tarjeta-pedido-linea1" style={{ alignItems: 'center' }}>
                  <span className="avatar-iniciales">{iniciales(nombreCliente(p))}</span>
                  <span className="tarjeta-pedido-cliente" style={{ flex: 1 }}>{nombreCliente(p)}</span>
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

  // ===== VISTA DESKTOP (dirección operativa: tira de KPIs + listas en dos columnas) =====
  return (
    <div className="modulo">
      <div className="encabezado-modulo-compacto">
        <h2>Inicio</h2>
        <span className="fecha-hoy">{fechaHoyCorta()}</span>
      </div>

      {avisosDesktop()}

      <div className="kpi-tira">
        <div className="kpi-tira-item">
          <div className="kpi-tira-label">Pedidos del mes</div>
          <div className="kpi-tira-valor">{resumenMes.cantidad}</div>
        </div>
        <div className="kpi-tira-item">
          <div className="kpi-tira-label">Total facturado</div>
          <div className="kpi-tira-valor">${formatearMoneda(resumenMes.totalFacturado)}</div>
        </div>
        <div className="kpi-tira-item">
          <div className="kpi-tira-label">Total cobrado</div>
          <div className="kpi-tira-valor cobrado">${formatearMoneda(resumenMes.totalCobrado)}</div>
        </div>
      </div>

      <div className="dos-columnas">
        <div>
          <div className="subseccion-titulo-compacto">Próximos a entregar · 7 días</div>
          {proximosEntregar.length === 0 ? (
            <p className="aviso-ok">✅ No tenés entregas programadas para los próximos 7 días.</p>
          ) : (
            proximosEntregar.map((p) => filaPedidoOperativa(p, 'fecha_entrega'))
          )}
        </div>

        <div>
          <div className="subseccion-titulo-compacto">Pedidos con saldo pendiente</div>
          {conSaldoPendiente.length === 0 ? (
            <p className="aviso-ok">✅ No hay pedidos con saldo pendiente.</p>
          ) : (
            conSaldoPendiente.map((p) => filaPedidoOperativa(p, 'fecha_pedido'))
          )}
        </div>
      </div>
    </div>
  )
}

export default Dashboard