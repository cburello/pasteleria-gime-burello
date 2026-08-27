import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNotificaciones } from '../hooks/useNotificaciones'

// Paleta fija, ordenada alternando tonos cálidos/fríos: el color de cada
// cliente sale de un hash de su clave, así no cambia de un período a otro
// aunque cambie su posición en el ranking.
const PALETA = [
  '#E8765C', '#5B7FA6', '#C9A227', '#7C6FBA', '#5B8C5A',
  '#A65B8C', '#4A9A8F', '#D4954A', '#8A6A66', '#B25C5C',
]

// FNV-1a: a diferencia de un hash polinómico simple, distribuye bien claves
// cortas y parecidas (ids numéricos consecutivos como "1", "2", "3", ...),
// que con un hash más ingenuo tienden a caer en colores casi contiguos.
function hashClave(clave) {
  let h = 2166136261
  for (let i = 0; i < clave.length; i++) {
    h ^= clave.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h
}

function colorPara(clave) {
  return PALETA[hashClave(clave) % PALETA.length]
}

function primerDiaMes() {
  const hoy = new Date()
  return new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10)
}

function ultimoDiaMes() {
  const hoy = new Date()
  return new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).toISOString().slice(0, 10)
}

function sumarUnDia(fechaStr) {
  const f = new Date(fechaStr + 'T00:00:00')
  f.setDate(f.getDate() + 1)
  return f.toISOString().slice(0, 10)
}

const CIRCUNFERENCIA = 2 * Math.PI * 80

function HistorialClientes() {
  const { mostrarToast } = useNotificaciones()
  const [fechaDesde, setFechaDesde] = useState(primerDiaMes())
  const [fechaHasta, setFechaHasta] = useState(ultimoDiaMes())
  const [cargando, setCargando] = useState(true)
  const [filas, setFilas] = useState([])
  const [hoverIdx, setHoverIdx] = useState(null)

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function formatearMoneda(valor) {
    if (valor === null || valor === undefined || isNaN(valor)) return '0,00'
    return new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(valor)
  }

  async function cargar() {
    setCargando(true)
    try {
      const { data: pedidos, error } = await supabase
        .from('pedidos')
        .select('id_pedido, id_cliente, descripcion, clientes(descripcion, cliente_anonimo)')
        .gte('fecha_entrega', fechaDesde)
        .lt('fecha_entrega', sumarUnDia(fechaHasta))

      if (error) throw error

      const idsPedidos = (pedidos || []).map((p) => p.id_pedido)

      const { data: detalles, error: errorDetalles } = await supabase
        .from('detalle_pedido')
        .select('id_pedido, cantidad, precio_venta')
        .in('id_pedido', idsPedidos.length > 0 ? idsPedidos : [-1])

      if (errorDetalles) throw errorDetalles

      const totalPorPedido = {}
      for (const d of detalles || []) {
        totalPorPedido[d.id_pedido] =
          (totalPorPedido[d.id_pedido] || 0) + parseFloat(d.precio_venta) * parseFloat(d.cantidad)
      }

      const grupos = {}
      for (const p of pedidos || []) {
        const esAnonimo = !p.clientes || p.clientes.cliente_anonimo === 'S'
        const clave = esAnonimo ? '__anonimos__' : String(p.id_cliente)
        const nombre = esAnonimo
          ? 'Clientes anónimos / no registrados'
          : p.clientes?.descripcion || p.descripcion || '—'

        if (!grupos[clave]) {
          grupos[clave] = { clave, nombre, cantidadPedidos: 0, monto: 0 }
        }
        grupos[clave].cantidadPedidos += 1
        grupos[clave].monto += totalPorPedido[p.id_pedido] || 0
      }

      setFilas(Object.values(grupos).sort((a, b) => b.monto - a.monto))
    } catch (e) {
      mostrarToast('Error al cargar el historial: ' + e.message, 'error')
    }
    setCargando(false)
  }

  const totalGeneral = filas.reduce((acc, f) => acc + f.monto, 0)
  const totalPedidos = filas.reduce((acc, f) => acc + f.cantidadPedidos, 0)

  let acumulado = 0
  let colorAnterior = null
  const porciones = filas.map((f) => {
    const pct = totalGeneral > 0 ? (f.monto / totalGeneral) * 100 : 0
    const dash = (pct / 100) * CIRCUNFERENCIA
    const dashoffset = -acumulado
    const midPct = totalGeneral > 0 ? (acumulado / CIRCUNFERENCIA) * 100 + pct / 2 : 0
    const angulo = ((-90 + midPct * 3.6) * Math.PI) / 180
    const x = (100 + 80 * Math.cos(angulo)) * 1.21
    const y = (100 + 80 * Math.sin(angulo)) * 1.21
    acumulado += dash

    // El color sale del hash de la clave (estable entre períodos), pero si
    // por casualidad coincide con el de la porción anterior (contigua en la
    // torta), se corre al siguiente color de la paleta para que se sigan
    // viendo como dos porciones distintas.
    let color = colorPara(f.clave)
    if (color === colorAnterior) {
      const idx = (PALETA.indexOf(color) + 1) % PALETA.length
      color = PALETA[idx]
    }
    colorAnterior = color

    return { ...f, pct, dasharray: `${dash} ${CIRCUNFERENCIA - dash}`, dashoffset, x, y, color }
  })

  const activo = hoverIdx !== null ? porciones[hoverIdx] : null

  return (
    <div className="modulo modulo-compacto">
      <div className="cabecera-lista">
        <h2>Historial de ventas por cliente</h2>
        <span className="contador">{filas.length} cliente{filas.length !== 1 ? 's' : ''}</span>
      </div>
      <p style={{ color: '#8A6A66', fontSize: 12.5, margin: '0 0 16px' }}>
        Agrupa el total facturado por cliente según la fecha de entrega de los pedidos. Los clientes anónimos
        o no registrados se agrupan en un solo bucket.
      </p>

      <div className="formulario formulario-costos" style={{ marginBottom: 16 }}>
        <div className="campo">
          <label>Entregas desde</label>
          <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
        </div>
        <div className="campo">
          <label>Hasta</label>
          <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
        </div>
        <div className="campo-acciones">
          <button className="btn-primario" onClick={cargar} disabled={cargando}>
            {cargando ? 'Cargando...' : 'Aplicar'}
          </button>
        </div>

        {!cargando && filas.length > 0 && (
          <div className="tarjeta-totales" style={{ margin: '0 0 0 auto', alignSelf: 'flex-start' }}>
            <div className="fila-total">
              <span>Pedidos en el período</span>
              <span>{totalPedidos}</span>
            </div>
            <div className="fila-total">
              <span>Clientes distintos</span>
              <span>{filas.length}</span>
            </div>
            <div className="divisor-horizontal"></div>
            <div className="fila-total total-fuerte destacado">
              <span>Total facturado</span>
              <span>${formatearMoneda(totalGeneral)}</span>
            </div>
          </div>
        )}
      </div>

      {cargando ? (
        <p>Cargando...</p>
      ) : filas.length === 0 ? (
        <p className="aviso-ok">✅ No hay pedidos con entrega en el período seleccionado.</p>
      ) : (
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ width: 300, flexShrink: 0 }}>
              <div style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#8A6A66', fontWeight: 600, marginBottom: 12 }}>
                Distribución del período
              </div>
              <div style={{ fontSize: 11, color: '#A68E89', marginBottom: 10 }}>
                Pasá el mouse sobre una porción para ver el cliente.
              </div>

              <div style={{ position: 'relative', width: 242, height: 242, margin: '0 auto' }} onMouseLeave={() => setHoverIdx(null)}>
                <svg width="242" height="242" viewBox="0 0 200 200">
                  <g transform="rotate(-90 100 100)">
                    {porciones.map((p, i) => (
                      <circle
                        key={p.clave}
                        cx="100" cy="100" r="80" fill="none"
                        stroke={p.color} strokeWidth="32"
                        strokeDasharray={p.dasharray}
                        strokeDashoffset={p.dashoffset}
                        style={{ cursor: 'pointer', transition: 'opacity .1s ease', opacity: hoverIdx === null || hoverIdx === i ? 1 : 0.55 }}
                        onMouseEnter={() => setHoverIdx(i)}
                      />
                    ))}
                  </g>
                  <text x="100" y="96" textAnchor="middle" fontFamily="'Playfair Display', serif" fontSize="15" fontWeight="700" fill="#4A2C2A">
                    ${formatearMoneda(totalGeneral)}
                  </text>
                  <text x="100" y="114" textAnchor="middle" fontFamily="'Poppins', sans-serif" fontSize="9.5" fill="#8A6A66">
                    total período
                  </text>
                </svg>

                {activo && (
                  <div
                    style={{
                      position: 'absolute', left: activo.x, top: activo.y, transform: 'translate(-50%, -115%)',
                      background: '#4A2C2A', color: '#FFF8F5', padding: '6px 10px', borderRadius: 7,
                      fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', boxShadow: '0 4px 14px rgba(74,44,42,0.25)',
                      pointerEvents: 'none',
                    }}
                  >
                    {activo.nombre}
                    <div style={{ fontWeight: 500, fontSize: 11, color: '#FFD9CC' }}>
                      ${formatearMoneda(activo.monto)} · {activo.pct.toFixed(1).replace('.', ',')}%
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 320 }}>
              <div style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#8A6A66', fontWeight: 600, marginBottom: 12 }}>
                Ranking por monto
              </div>
              <div className="tabla-wrapper">
                <table className="tabla tabla-compacta">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th style={{ textAlign: 'right' }}>Pedidos</th>
                      <th style={{ textAlign: 'right' }}>Monto total</th>
                      <th style={{ textAlign: 'right' }}>% del total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porciones.map((f) => (
                      <tr key={f.clave}>
                        <td style={{ fontStyle: f.clave === '__anonimos__' ? 'italic' : 'normal' }}>
                          <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: f.color, marginRight: 8, verticalAlign: 'middle' }}></span>
                          {f.nombre}
                        </td>
                        <td style={{ textAlign: 'right' }}>{f.cantidadPedidos}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>${formatearMoneda(f.monto)}</td>
                        <td style={{ textAlign: 'right', color: '#8A6A66' }}>{f.pct.toFixed(1).replace('.', ',')}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
      )}
    </div>
  )
}

export default HistorialClientes
