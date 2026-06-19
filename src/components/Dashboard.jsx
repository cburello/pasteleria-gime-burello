import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function Dashboard({ onAbrirPedido }) {
  const [cargando, setCargando] = useState(true)
  const [proximosEntregar, setProximosEntregar] = useState([])
  const [conSaldoPendiente, setConSaldoPendiente] = useState([])
  const [resumenMes, setResumenMes] = useState({ cantidad: 0, totalFacturado: 0, totalCobrado: 0 })

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
    return new Date(fecha).toLocaleDateString('es-AR')
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

    // Traemos todos los pedidos relevantes en pocas consultas
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

    // Calculamos total y saldo de cada pedido
    const pedidosConTotales = pedidos.map((p) => {
      const lineasPedido = (detalles || []).filter((d) => d.id_pedido === p.id_pedido)
      const pagosPedido = (pagos || []).filter((pg) => pg.id_pedido === p.id_pedido)

      const total = lineasPedido.reduce((acc, l) => acc + parseFloat(l.precio_venta) * parseFloat(l.cantidad), 0)
      const pagado = pagosPedido.reduce((acc, pg) => acc + parseFloat(pg.importe), 0)
      const saldo = total - pagado

      return { ...p, total, pagado, saldo }
    })

    // Próximos a entregar: entre hoy y los próximos 7 días
    const proximos = pedidosConTotales.filter(
      (p) => p.fecha_entrega >= hoyStr && p.fecha_entrega <= en7diasStr
    )

    // Con saldo pendiente (cualquier fecha)
    const pendientes = pedidosConTotales.filter((p) => p.saldo > 0.01)

    // Resumen del mes en curso (por fecha de pedido)
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

    setCargando(false)
  }

  if (cargando) {
    return (
      <div className="modulo">
        <p>Cargando dashboard...</p>
      </div>
    )
  }

  return (
    <div className="modulo">
      <h2>Inicio</h2>

      {/* Resumen del mes */}
      <div className="subseccion">
        <h3>Resumen del mes en curso</h3>
        <div className="simulador-precio">
          <div className="simulador-item">
            <span>Pedidos del mes</span>
            <strong>{resumenMes.cantidad}</strong>
          </div>
          <div className="simulador-item">
            <span>Total facturado</span>
            <strong>${formatearMoneda(resumenMes.totalFacturado)}</strong>
          </div>
          <div className="simulador-item">
            <span>Total cobrado</span>
            <strong>${formatearMoneda(resumenMes.totalCobrado)}</strong>
          </div>
        </div>
      </div>

      {/* Próximos a entregar */}
      <div className="subseccion">
        <h3>Próximos a entregar (7 días)</h3>
        {proximosEntregar.length === 0 ? (
          <p className="aviso-ok">✅ No tenés entregas programadas para los próximos 7 días.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Fecha entrega</th>
                <th>Cliente</th>
                <th>Total</th>
                <th>Saldo</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {proximosEntregar.map((p) => (
                <tr key={p.id_pedido}>
                  <td>{formatearFecha(p.fecha_entrega)}</td>
                  <td>{nombreCliente(p)}</td>
                  <td>${formatearMoneda(p.total)}</td>
                  <td>${formatearMoneda(p.saldo)}</td>
                  <td>
                    <button className="btn-link" onClick={() => onAbrirPedido(p.id_pedido)}>
                      Ver pedido
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Con saldo pendiente */}
      <div className="subseccion">
        <h3>Pedidos con saldo pendiente</h3>
        {conSaldoPendiente.length === 0 ? (
          <p className="aviso-ok">✅ No hay pedidos con saldo pendiente.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Fecha pedido</th>
                <th>Cliente</th>
                <th>Total</th>
                <th>Saldo pendiente</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {conSaldoPendiente.map((p) => (
                <tr key={p.id_pedido}>
                  <td>{formatearFecha(p.fecha_pedido)}</td>
                  <td>{nombreCliente(p)}</td>
                  <td>${formatearMoneda(p.total)}</td>
                  <td style={{ color: '#C0392B', fontWeight: 600 }}>${formatearMoneda(p.saldo)}</td>
                  <td>
                    <button className="btn-link" onClick={() => onAbrirPedido(p.id_pedido)}>
                      Ver pedido
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default Dashboard