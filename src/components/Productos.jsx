import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function Productos() {
  const [productos, setProductos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const [vista, setVista] = useState('lista')
  const [productoActual, setProductoActual] = useState(null)

  const [textoBusqueda, setTextoBusqueda] = useState('')

  useEffect(() => {
    cargarProductos()
  }, [])

  function normalizar(texto) {
    return texto
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  }

  async function cargarProductos() {
    setCargando(true)
    setError(null)
    const { data, error } = await supabase
      .from('productos')
      .select('*, recetas(descripcion, cantidad_producto_final)')
      .order('id_producto', { ascending: false })

    if (error) {
      setError('Error al cargar los productos: ' + error.message)
    } else {
      setProductos(data)
    }
    setCargando(false)
  }

  function iniciarNuevo() {
    setProductoActual({
      id_producto: null,
      id_receta: null,
      descripcion: '',
      coeficiente_ganancia: 1.3,
    })
    setVista('detalle')
  }

  function abrirProducto(producto) {
    setProductoActual({ ...producto })
    setVista('detalle')
  }

  async function eliminarProducto(id) {
    const confirmar = window.confirm('¿Seguro que querés eliminar este producto? También se eliminará su historial de precios.')
    if (!confirmar) return

    const { error: errorPrecios } = await supabase.from('precios').delete().eq('id_producto', id)
    if (errorPrecios) {
      alert('Error al eliminar precios del producto: ' + errorPrecios.message)
      return
    }

    const { error } = await supabase.from('productos').delete().eq('id_producto', id)

    if (error) {
      alert('No se pudo eliminar el producto. Puede estar usado en algún combo o pedido.\n\nDetalle: ' + error.message)
    } else {
      cargarProductos()
    }
  }

  const productosFiltrados = textoBusqueda.trim()
    ? productos.filter((p) => normalizar(p.descripcion).includes(normalizar(textoBusqueda)))
    : productos

  if (vista === 'detalle') {
    return (
      <DetalleProducto
        producto={productoActual}
        onVolver={() => {
          setVista('lista')
          cargarProductos()
        }}
      />
    )
  }

  return (
    <div className="modulo">
      <h2>Productos</h2>

      <div className="acciones-superiores">
        <button className="btn-primario" onClick={iniciarNuevo}>
          + Nuevo Producto
        </button>
      </div>

      <div className="campo-buscador">
        <input
          type="text"
          placeholder="🔎 Buscar producto..."
          value={textoBusqueda}
          onChange={(e) => setTextoBusqueda(e.target.value)}
        />
      </div>

      {cargando && <p>Cargando...</p>}
      {error && <p className="mensaje-error">{error}</p>}

      {!cargando && !error && (
        <div className="tabla-wrapper">
          <table className="tabla">
            <thead>
              <tr>
                <th>ID</th>
                <th>Descripción</th>
                <th>Receta</th>
                <th>Coef. Ganancia</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {productosFiltrados.length === 0 && (
                <tr>
                  <td colSpan="5">No hay productos registrados.</td>
                </tr>
              )}
              {productosFiltrados.map((p) => (
                <tr key={p.id_producto}>
                  <td>{p.id_producto}</td>
                  <td>{p.descripcion}</td>
                  <td>{p.recetas?.descripcion || '—'}</td>
                  <td>{p.coeficiente_ganancia}</td>
                  <td>
                    <button className="btn-link" onClick={() => abrirProducto(p)}>
                      Ver / Editar
                    </button>
                    <button className="btn-link btn-eliminar" onClick={() => eliminarProducto(p.id_producto)}>
                      Eliminar
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
// SUBCOMPONENTE: Detalle de producto (cabecera + simulador + historial de precios)
// ============================================================
function DetalleProducto({ producto, onVolver }) {
  const [descripcion, setDescripcion] = useState(producto.descripcion)
  const [idReceta, setIdReceta] = useState(producto.id_receta)
  const [coeficiente, setCoeficiente] = useState(producto.coeficiente_ganancia)
  const [guardandoCabecera, setGuardandoCabecera] = useState(false)

  const [recetas, setRecetas] = useState([])
  const [textoBuscarReceta, setTextoBuscarReceta] = useState('')
  const [recetaSeleccionada, setRecetaSeleccionada] = useState(null)

  const [costoReceta, setCostoReceta] = useState(null)
  const [calculandoCosto, setCalculandoCosto] = useState(false)

  const [precios, setPrecios] = useState([])
  const [cargandoPrecios, setCargandoPrecios] = useState(true)

  const [fechaInicioPrecio, setFechaInicioPrecio] = useState(new Date().toISOString().slice(0, 10))
  const [fechaFinPrecio, setFechaFinPrecio] = useState('3000-12-31')
  const [precioVentaManual, setPrecioVentaManual] = useState('')
  const [guardandoPrecio, setGuardandoPrecio] = useState(false)
  const [editandoPrecioId, setEditandoPrecioId] = useState(null)

  useEffect(() => {
    cargarRecetas()
    if (producto.id_producto) {
      cargarPrecios()
    } else {
      setCargandoPrecios(false)
    }
  }, [])

  useEffect(() => {
    if (idReceta) {
      calcularCostoDeReceta(idReceta)
    }
  }, [idReceta])

  function normalizar(texto) {
    return texto
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  }

  function formatearFecha(fecha) {
    if (!fecha) return ''
    const fechaStr = fecha.includes('T') ? fecha : fecha + 'T00:00:00'
    return new Date(fechaStr).toLocaleDateString('es-AR')
  }

  function formatearMoneda(valor) {
    if (valor === null || valor === undefined || isNaN(valor)) return '—'
    return new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(valor)
  }

  async function cargarRecetas() {
    const { data } = await supabase.from('recetas').select('*').order('descripcion')
    setRecetas(data || [])

    if (producto.id_receta) {
      const recetaActual = (data || []).find((r) => r.id_receta === producto.id_receta)
      if (recetaActual) {
        setRecetaSeleccionada(recetaActual)
        setTextoBuscarReceta(recetaActual.descripcion)
      }
    }
  }

  function extraerCantidadPresentacion(presentacion) {
    const match = presentacion.match(/[\d.,]+/)
    if (!match) return null
    return parseFloat(match[0].replace(',', '.'))
  }

  async function obtenerCostoVigente(idMateriaPrima) {
    const hoy = new Date().toISOString().slice(0, 10)
    const { data, error } = await supabase
      .from('costos_materia_prima')
      .select('*')
      .eq('id_materia_prima', idMateriaPrima)
      .lte('fecha_inicio', hoy)
      .gte('fecha_fin', hoy)
      .order('fecha_inicio', { ascending: false })
      .limit(1)

    if (error || !data || data.length === 0) return null
    return data[0]
  }

  async function calcularCostoDeReceta(idRecetaCalculo) {
    setCalculandoCosto(true)

    const { data: detalle, error } = await supabase
      .from('detalle_receta')
      .select('*')
      .eq('id_receta', idRecetaCalculo)

    if (error || !detalle) {
      setCostoReceta(null)
      setCalculandoCosto(false)
      return
    }

    let total = 0
    for (const ing of detalle) {
      const costo = await obtenerCostoVigente(ing.id_materia_prima)
      if (costo) {
        const cantidadPresentacion = extraerCantidadPresentacion(costo.presentacion)
        if (cantidadPresentacion && cantidadPresentacion > 0) {
          const precioUnitario = parseFloat(costo.precio) / cantidadPresentacion
          total += precioUnitario * parseFloat(ing.cantidad)
        }
      }
    }

    setCostoReceta(total)
    setCalculandoCosto(false)
  }

  const recetasFiltradas = textoBuscarReceta.trim()
    ? recetas.filter((r) => normalizar(r.descripcion).includes(normalizar(textoBuscarReceta)))
    : []

  function seleccionarReceta(receta) {
    setRecetaSeleccionada(receta)
    setIdReceta(receta.id_receta)
    setTextoBuscarReceta(receta.descripcion)
  }

  const costoPorUnidad =
    costoReceta !== null && recetaSeleccionada?.cantidad_producto_final
      ? costoReceta / recetaSeleccionada.cantidad_producto_final
      : null

  const precioTeoricoSimulado =
    costoPorUnidad !== null ? costoPorUnidad * parseFloat(coeficiente || 0) : null

  async function guardarCabecera() {
    if (!descripcion.trim() || !idReceta || !coeficiente) {
      alert('Descripción, receta y coeficiente de ganancia son obligatorios')
      return null
    }

    setGuardandoCabecera(true)

    const registro = {
      descripcion,
      id_receta: idReceta,
      coeficiente_ganancia: parseFloat(coeficiente),
    }

    let idResultante = producto.id_producto

    if (producto.id_producto) {
      const { error } = await supabase.from('productos').update(registro).eq('id_producto', producto.id_producto)
      if (error) {
        alert('Error al guardar: ' + error.message)
        setGuardandoCabecera(false)
        return null
      }
    } else {
      const { data, error } = await supabase.from('productos').insert(registro).select().single()
      if (error) {
        alert('Error al guardar: ' + error.message)
        setGuardandoCabecera(false)
        return null
      }
      idResultante = data.id_producto
    }

    setGuardandoCabecera(false)
    return idResultante
  }

  async function handleGuardarCabecera() {
    const id = await guardarCabecera()
    if (id) {
      alert('Producto guardado correctamente')
      if (!producto.id_producto) {
        producto.id_producto = id
        window.location.reload()
      }
    }
  }

  async function cargarPrecios() {
    setCargandoPrecios(true)
    const { data, error } = await supabase
      .from('precios')
      .select('*')
      .eq('id_producto', producto.id_producto)
      .order('fecha_inicio', { ascending: false })

    if (!error) {
      setPrecios(data)
    }
    setCargandoPrecios(false)
  }

  function haySuperposicion(inicioA, finA, inicioB, finB) {
    const iA = new Date(inicioA).getTime()
    const fA = new Date(finA).getTime()
    const iB = new Date(inicioB).getTime()
    const fB = new Date(finB).getTime()
    return iA <= fB && fA >= iB
  }

  function restarUnDia(fechaStr) {
    const f = new Date(fechaStr + 'T00:00:00')
    f.setDate(f.getDate() - 1)
    return f.toISOString().slice(0, 10)
  }

  function iniciarNuevoPrecio() {
    setEditandoPrecioId(null)
    setFechaInicioPrecio(new Date().toISOString().slice(0, 10))
    setFechaFinPrecio('3000-12-31')
    setPrecioVentaManual(precioTeoricoSimulado !== null ? precioTeoricoSimulado.toFixed(2) : '')
  }

  function iniciarEdicionPrecio(p) {
    setEditandoPrecioId(p.id_precio)
    setFechaInicioPrecio(p.fecha_inicio?.slice(0, 10) || '')
    setFechaFinPrecio(p.fecha_fin?.slice(0, 10) || '3000-12-31')
    setPrecioVentaManual(p.precio_venta)
  }

  async function guardarPrecio() {
    if (!fechaInicioPrecio || !precioVentaManual) {
      alert('Fecha de inicio y precio de venta son obligatorios')
      return
    }

    const finEfectivo = fechaFinPrecio || '3000-12-31'

    if (new Date(fechaInicioPrecio) > new Date(finEfectivo)) {
      alert('La fecha de inicio no puede ser posterior a la fecha de fin')
      return
    }

    const conflictivos = precios.filter((p) => {
      if (editandoPrecioId && p.id_precio === editandoPrecioId) return false
      return haySuperposicion(fechaInicioPrecio, finEfectivo, p.fecha_inicio, p.fecha_fin)
    })

    const ajustables = []
    const noAjustables = []
    for (const p of conflictivos) {
      if (new Date(p.fecha_inicio).getTime() < new Date(fechaInicioPrecio).getTime()) {
        ajustables.push(p)
      } else {
        noAjustables.push(p)
      }
    }

    if (noAjustables.length > 0) {
      alert('Hay un conflicto de vigencia con otro precio que no se puede resolver automáticamente. Revisá las fechas.')
      return
    }

    setGuardandoPrecio(true)

    for (const p of ajustables) {
      await supabase
        .from('precios')
        .update({ fecha_fin: restarUnDia(fechaInicioPrecio) })
        .eq('id_precio', p.id_precio)
    }

    const registro = {
      id_producto: producto.id_producto,
      fecha_inicio: fechaInicioPrecio,
      fecha_fin: finEfectivo,
      precio_venta: parseFloat(precioVentaManual),
      precio_teorico: precioTeoricoSimulado !== null ? parseFloat(precioTeoricoSimulado.toFixed(2)) : null,
    }

    let resultado
    if (editandoPrecioId) {
      resultado = await supabase.from('precios').update(registro).eq('id_precio', editandoPrecioId)
    } else {
      resultado = await supabase.from('precios').insert(registro)
    }

    if (resultado.error) {
      alert('Error al guardar el precio: ' + resultado.error.message)
    } else {
      const avisoAjuste = ajustables.length > 0
        ? `\n\nSe actualizó automáticamente la vigencia de ${ajustables.length} precio(s) anterior(es).`
        : ''
      alert('Precio guardado correctamente.' + avisoAjuste)
      setEditandoPrecioId(null)
      setPrecioVentaManual('')
      cargarPrecios()
    }

    setGuardandoPrecio(false)
  }

  async function eliminarPrecio(id) {
    const confirmar = window.confirm('¿Seguro que querés eliminar este registro de precio?')
    if (!confirmar) return

    const { error } = await supabase.from('precios').delete().eq('id_precio', id)

    if (error) {
      alert('No se pudo eliminar: ' + error.message)
    } else {
      cargarPrecios()
    }
  }

  const hoy = new Date().toISOString().slice(0, 10)
  const precioVigenteHoy = precios.find(
    (p) => p.fecha_inicio <= hoy && p.fecha_fin >= hoy
  )

  const precioDesactualizado =
    precioVigenteHoy &&
    precioTeoricoSimulado !== null &&
    Math.abs(parseFloat(precioVigenteHoy.precio_venta) - precioTeoricoSimulado) > 0.5

  return (
    <div className="modulo">
      <button className="btn-volver" onClick={onVolver}>
        ← Volver a Productos
      </button>

      <h2>{producto.id_producto ? 'Editar Producto' : 'Nuevo Producto'}</h2>

      <div className="subseccion">
        <h3>Datos generales</h3>
        <div className="formulario formulario-costos">
          <div className="campo" style={{ flex: 2 }}>
            <label>Descripción</label>
            <input
              type="text"
              placeholder="Ej: Torta de Chocolate 1kg"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </div>

          <div className="campo" style={{ flex: 2, position: 'relative' }}>
            <label>Receta</label>
            <input
              type="text"
              placeholder="🔎 Buscar receta..."
              value={textoBuscarReceta}
              onChange={(e) => {
                setTextoBuscarReceta(e.target.value)
                setRecetaSeleccionada(null)
                setIdReceta(null)
              }}
            />
            {textoBuscarReceta && !recetaSeleccionada && recetasFiltradas.length > 0 && (
              <div className="dropdown-resultados">
                {recetasFiltradas.map((r) => (
                  <div key={r.id_receta} className="dropdown-item" onClick={() => seleccionarReceta(r)}>
                    {r.descripcion}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="campo">
            <label>Coeficiente de ganancia</label>
            <input
              type="number"
              step="0.01"
              placeholder="Ej: 1.30"
              value={coeficiente}
              onChange={(e) => setCoeficiente(e.target.value)}
            />
          </div>

          <div className="campo-acciones">
            <button className="btn-primario" onClick={handleGuardarCabecera} disabled={guardandoCabecera}>
              {guardandoCabecera ? 'Guardando...' : 'Guardar datos generales'}
            </button>
          </div>
        </div>
      </div>

      {idReceta && (
        <div className="subseccion">
          <h3>Simulador de precio</h3>

          {calculandoCosto && <p>Calculando costo de la receta...</p>}

          {!calculandoCosto && costoReceta !== null && (
            <div className="simulador-precio">
              <div className="simulador-item">
                <span>Costo total de receta</span>
                <strong>${formatearMoneda(costoReceta)}</strong>
              </div>
              <div className="simulador-item">
                <span>Costo por unidad de producto</span>
                <strong>${formatearMoneda(costoPorUnidad)}</strong>
              </div>
              <div className="simulador-item">
                <span>Coeficiente de ganancia</span>
                <strong>x{parseFloat(coeficiente || 0).toFixed(2)}</strong>
              </div>
              <div className="simulador-item simulador-resultado">
                <span>Precio teórico sugerido</span>
                <strong>${formatearMoneda(precioTeoricoSimulado)}</strong>
              </div>
            </div>
          )}

          {!calculandoCosto && costoReceta === null && (
            <p className="mensaje-error">No se pudo calcular el costo de esta receta (verificá que tenga ingredientes con costos vigentes).</p>
          )}
        </div>
      )}

      {producto.id_producto && (
        <div className="subseccion">
          <h3>Historial de precios</h3>

          {precioDesactualizado && (
            <div className="aviso-similar">
              ⚠️ El precio vigente (${formatearMoneda(precioVigenteHoy.precio_venta)}) está desactualizado respecto
              al precio teórico actual (${formatearMoneda(precioTeoricoSimulado)}). El costo de la receta puede haber cambiado.
            </div>
          )}

          <div className="formulario formulario-costos">
            <div className="campo">
              <label>Fecha inicio</label>
              <input
                type="date"
                value={fechaInicioPrecio}
                onChange={(e) => setFechaInicioPrecio(e.target.value)}
              />
            </div>
            <div className="campo">
              <label>Fecha fin</label>
              <input
                type="date"
                value={fechaFinPrecio === '3000-12-31' ? '' : fechaFinPrecio}
                placeholder="Indefinida"
                onChange={(e) => setFechaFinPrecio(e.target.value || '3000-12-31')}
              />
            </div>
            <div className="campo">
              <label>Precio de venta</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={precioVentaManual}
                onChange={(e) => setPrecioVentaManual(e.target.value)}
              />
            </div>
            <div className="campo-acciones">
              <button className="btn-secundario" type="button" onClick={iniciarNuevoPrecio}>
                Usar precio sugerido
              </button>
              <button className="btn-primario" onClick={guardarPrecio} disabled={guardandoPrecio}>
                {guardandoPrecio ? 'Guardando...' : editandoPrecioId ? 'Actualizar' : 'Agregar precio'}
              </button>
            </div>
          </div>

          {cargandoPrecios && <p>Cargando historial...</p>}

          {!cargandoPrecios && (
            <div className="tabla-wrapper">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Desde</th>
                    <th>Hasta</th>
                    <th>Precio venta</th>
                    <th>Precio teórico (al momento)</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {precios.length === 0 && (
                    <tr>
                      <td colSpan="5">No hay precios registrados.</td>
                    </tr>
                  )}
                  {precios.map((p) => (
                    <tr key={p.id_precio}>
                      <td>{formatearFecha(p.fecha_inicio)}</td>
                      <td>{p.fecha_fin?.slice(0, 10) === '3000-12-31' ? 'Indefinida' : formatearFecha(p.fecha_fin)}</td>
                      <td>${formatearMoneda(p.precio_venta)}</td>
                      <td>{p.precio_teorico ? `$${formatearMoneda(p.precio_teorico)}` : '—'}</td>
                      <td>
                        <button className="btn-link" onClick={() => iniciarEdicionPrecio(p)}>
                          Editar
                        </button>
                        <button className="btn-link btn-eliminar" onClick={() => eliminarPrecio(p.id_precio)}>
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default Productos
