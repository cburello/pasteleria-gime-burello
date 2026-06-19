import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function Combos() {
  const [combos, setCombos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const [vista, setVista] = useState('lista')
  const [comboActual, setComboActual] = useState(null)

  const [textoBusqueda, setTextoBusqueda] = useState('')

  useEffect(() => {
    cargarCombos()
  }, [])

  function normalizar(texto) {
    return texto
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  }

  function formatearMoneda(valor) {
    if (valor === null || valor === undefined || isNaN(valor)) return '—'
    return new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(valor)
  }

  function formatearFecha(fecha) {
    if (!fecha) return ''
    return new Date(fecha).toLocaleDateString('es-AR')
  }

  async function cargarCombos() {
    setCargando(true)
    setError(null)
    const { data, error } = await supabase
      .from('combos')
      .select('*')
      .order('id_combo', { ascending: false })

    if (error) {
      setError('Error al cargar los combos: ' + error.message)
    } else {
      setCombos(data)
    }
    setCargando(false)
  }

  function iniciarNuevo() {
    setComboActual({
      id_combo: null,
      descripcion: '',
      precio: '',
      fecha_inicio: new Date().toISOString().slice(0, 10),
      fecha_fin: '3000-12-31',
    })
    setVista('detalle')
  }

  function abrirCombo(combo) {
    setComboActual({ ...combo })
    setVista('detalle')
  }

  async function eliminarCombo(id) {
    const confirmar = window.confirm('¿Seguro que querés eliminar este combo? También se eliminará su detalle de productos.')
    if (!confirmar) return

    const { error: errorDetalle } = await supabase.from('detalle_combo').delete().eq('id_combo', id)
    if (errorDetalle) {
      alert('Error al eliminar el detalle del combo: ' + errorDetalle.message)
      return
    }

    const { error } = await supabase.from('combos').delete().eq('id_combo', id)

    if (error) {
      alert('No se pudo eliminar el combo. Puede estar usado en algún pedido.\n\nDetalle: ' + error.message)
    } else {
      cargarCombos()
    }
  }

  const combosFiltrados = textoBusqueda.trim()
    ? combos.filter((c) => normalizar(c.descripcion).includes(normalizar(textoBusqueda)))
    : combos

  if (vista === 'detalle') {
    return (
      <DetalleCombo
        combo={comboActual}
        onVolver={() => {
          setVista('lista')
          cargarCombos()
        }}
      />
    )
  }

  return (
    <div className="modulo">
      <h2>Combos</h2>

      <div className="acciones-superiores">
        <button className="btn-primario" onClick={iniciarNuevo}>
          + Nuevo Combo
        </button>
      </div>

      <div className="campo-buscador">
        <input
          type="text"
          placeholder="🔎 Buscar combo..."
          value={textoBusqueda}
          onChange={(e) => setTextoBusqueda(e.target.value)}
        />
      </div>

      {cargando && <p>Cargando...</p>}
      {error && <p className="mensaje-error">{error}</p>}

      {!cargando && !error && (
        <table className="tabla">
          <thead>
            <tr>
              <th>ID</th>
              <th>Descripción</th>
              <th>Precio</th>
              <th>Vigencia</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {combosFiltrados.length === 0 && (
              <tr>
                <td colSpan="5">No hay combos registrados.</td>
              </tr>
            )}
            {combosFiltrados.map((c) => (
              <tr key={c.id_combo}>
                <td>{c.id_combo}</td>
                <td>{c.descripcion}</td>
                <td>${formatearMoneda(c.precio)}</td>
                <td>
                  {formatearFecha(c.fecha_inicio)} —{' '}
                  {c.fecha_fin?.slice(0, 10) === '3000-12-31' ? 'Indefinida' : formatearFecha(c.fecha_fin)}
                </td>
                <td>
                  <button className="btn-link" onClick={() => abrirCombo(c)}>
                    Ver / Editar
                  </button>
                  <button className="btn-link btn-eliminar" onClick={() => eliminarCombo(c.id_combo)}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ============================================================
// SUBCOMPONENTE: Detalle de combo (cabecera + productos incluidos)
// ============================================================
function DetalleCombo({ combo, onVolver }) {
  const [descripcion, setDescripcion] = useState(combo.descripcion)
  const [precio, setPrecio] = useState(combo.precio || '')
  const [fechaInicio, setFechaInicio] = useState(combo.fecha_inicio?.slice(0, 10) || '')
  const [fechaFin, setFechaFin] = useState(combo.fecha_fin?.slice(0, 10) || '3000-12-31')
  const [guardando, setGuardando] = useState(false)

  const [combosExistentes, setCombosExistentes] = useState([])

  const [productosCombo, setProductosCombo] = useState([]) // detalle_combo enriquecido con datos de producto
  const [cargandoProductos, setCargandoProductos] = useState(true)

  const [productosDisponibles, setProductosDisponibles] = useState([])
  const [textoBuscarProducto, setTextoBuscarProducto] = useState('')
  const [productoParaAgregar, setProductoParaAgregar] = useState(null)
  const [cantidadProducto, setCantidadProducto] = useState('1')

  useEffect(() => {
    cargarCombosExistentes()
    cargarProductosDisponibles()
    if (combo.id_combo) {
      cargarProductosDelCombo()
    } else {
      setCargandoProductos(false)
    }
  }, [])

  function normalizar(texto) {
    return texto
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  }

  function formatearMoneda(valor) {
    if (valor === null || valor === undefined || isNaN(valor)) return '—'
    return new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(valor)
  }

  async function cargarCombosExistentes() {
    const { data } = await supabase.from('combos').select('*')
    setCombosExistentes(data || [])
  }

  async function cargarProductosDisponibles() {
    const { data } = await supabase.from('productos').select('*').order('descripcion')
    setProductosDisponibles(data || [])
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

  // Costo total de una receta (suma de ingredientes x costo vigente)
  async function calcularCostoReceta(idReceta) {
    const { data: detalle, error } = await supabase
      .from('detalle_receta')
      .select('*')
      .eq('id_receta', idReceta)

    if (error || !detalle) return null

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
    return total
  }

  // Precio de venta vigente hoy de un producto
  async function obtenerPrecioVigente(idProducto) {
    const hoy = new Date().toISOString().slice(0, 10)
    const { data, error } = await supabase
      .from('precios')
      .select('*')
      .eq('id_producto', idProducto)
      .lte('fecha_inicio', hoy)
      .gte('fecha_fin', hoy)
      .order('fecha_inicio', { ascending: false })
      .limit(1)

    if (error || !data || data.length === 0) return null
    return data[0]
  }

  // Trae todos los datos económicos de un producto: costo receta, precio teórico, precio venta
  async function obtenerDatosEconomicos(producto) {
    const costoReceta = producto.id_receta ? await calcularCostoReceta(producto.id_receta) : null
    const precioVigente = await obtenerPrecioVigente(producto.id_producto)

    let recetaInfo = null
    if (producto.id_receta) {
      const { data } = await supabase
        .from('recetas')
        .select('cantidad_producto_final')
        .eq('id_receta', producto.id_receta)
        .single()
      recetaInfo = data
    }

    const costoPorUnidad =
      costoReceta !== null && recetaInfo?.cantidad_producto_final
        ? costoReceta / recetaInfo.cantidad_producto_final
        : null

    const precioTeorico =
      costoPorUnidad !== null ? costoPorUnidad * parseFloat(producto.coeficiente_ganancia || 0) : null

    return {
      costo_receta: costoPorUnidad,
      precio_teorico: precioTeorico,
      precio_venta: precioVigente ? parseFloat(precioVigente.precio_venta) : null,
    }
  }

  async function cargarProductosDelCombo() {
    setCargandoProductos(true)
    const { data, error } = await supabase
      .from('detalle_combo')
      .select('*, productos(id_producto, descripcion, id_receta, coeficiente_ganancia)')
      .eq('id_combo', combo.id_combo)

    if (!error && data) {
      const enriquecido = await Promise.all(
        data.map(async (item) => {
          const datosEconomicos = await obtenerDatosEconomicos(item.productos)
          return { ...item, ...datosEconomicos }
        })
      )
      setProductosCombo(enriquecido)
    }
    setCargandoProductos(false)
  }

  const productosFiltrados = textoBuscarProducto.trim()
    ? productosDisponibles.filter((p) => normalizar(p.descripcion).includes(normalizar(textoBuscarProducto)))
    : []

  function seleccionarProducto(producto) {
    setProductoParaAgregar(producto)
    setTextoBuscarProducto(producto.descripcion)
  }

  async function agregarProducto() {
    if (!combo.id_combo) {
      alert('Primero guardá los datos generales del combo antes de agregar productos')
      return
    }
    if (!productoParaAgregar || !cantidadProducto) {
      alert('Seleccioná un producto e indicá la cantidad')
      return
    }

    const yaExiste = productosCombo.find((p) => p.id_producto === productoParaAgregar.id_producto)
    if (yaExiste) {
      alert('Ese producto ya está agregado al combo. Eliminalo primero si querés cambiar la cantidad.')
      return
    }

    const { error } = await supabase.from('detalle_combo').insert({
      id_combo: combo.id_combo,
      id_producto: productoParaAgregar.id_producto,
      cantidad: parseFloat(cantidadProducto),
    })

    if (error) {
      alert('Error al agregar producto: ' + error.message)
    } else {
      setProductoParaAgregar(null)
      setTextoBuscarProducto('')
      setCantidadProducto('1')
      cargarProductosDelCombo()
    }
  }

  async function quitarProducto(idProducto) {
    const confirmar = window.confirm('¿Quitar este producto del combo?')
    if (!confirmar) return

    const { error } = await supabase
      .from('detalle_combo')
      .delete()
      .eq('id_combo', combo.id_combo)
      .eq('id_producto', idProducto)

    if (error) {
      alert('Error al quitar el producto: ' + error.message)
    } else {
      cargarProductosDelCombo()
    }
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

  // Suma de precio_venta x cantidad de todos los productos del combo (sugerencia)
  const precioSugerido = productosCombo.reduce((acc, p) => {
    const precioUnitario = p.precio_venta || 0
    return acc + precioUnitario * parseFloat(p.cantidad || 1)
  }, 0)

  function usarPrecioSugerido() {
    setPrecio(precioSugerido.toFixed(2))
  }

  async function guardarCombo() {
    if (!descripcion.trim() || !fechaInicio || !precio) {
      alert('Descripción, fecha de inicio y precio son obligatorios')
      return null
    }

    const finEfectivo = fechaFin || '3000-12-31'

    if (new Date(fechaInicio) > new Date(finEfectivo)) {
      alert('La fecha de inicio no puede ser posterior a la fecha de fin')
      return null
    }

    const mismaDescripcion = combosExistentes.filter(
      (c) => normalizar(c.descripcion) === normalizar(descripcion) && c.id_combo !== combo.id_combo
    )

    const conflictivos = mismaDescripcion.filter((c) =>
      haySuperposicion(fechaInicio, finEfectivo, c.fecha_inicio, c.fecha_fin)
    )

    const ajustables = []
    const noAjustables = []
    for (const c of conflictivos) {
      if (new Date(c.fecha_inicio).getTime() < new Date(fechaInicio).getTime()) {
        ajustables.push(c)
      } else {
        noAjustables.push(c)
      }
    }

    if (noAjustables.length > 0) {
      alert('Hay un conflicto de vigencia con otra versión de este combo que no se puede resolver automáticamente. Revisá las fechas.')
      return null
    }

    setGuardando(true)

    for (const c of ajustables) {
      await supabase
        .from('combos')
        .update({ fecha_fin: restarUnDia(fechaInicio) })
        .eq('id_combo', c.id_combo)
    }

    const registro = {
      descripcion,
      precio: parseFloat(precio),
      fecha_inicio: fechaInicio,
      fecha_fin: finEfectivo,
    }

    let idResultante = combo.id_combo

    if (combo.id_combo) {
      const { error } = await supabase.from('combos').update(registro).eq('id_combo', combo.id_combo)
      if (error) {
        alert('Error al guardar: ' + error.message)
        setGuardando(false)
        return null
      }
    } else {
      const { data, error } = await supabase.from('combos').insert(registro).select().single()
      if (error) {
        alert('Error al guardar: ' + error.message)
        setGuardando(false)
        return null
      }
      idResultante = data.id_combo
    }

    setGuardando(false)
    return idResultante
  }

  async function handleGuardarCombo() {
    const id = await guardarCombo()
    if (id) {
      alert('Combo guardado correctamente')
      if (!combo.id_combo) {
        combo.id_combo = id
        window.location.reload()
      }
    }
  }

  return (
    <div className="modulo">
      <button className="btn-volver" onClick={onVolver}>
        ← Volver a Combos
      </button>

      <h2>{combo.id_combo ? 'Editar Combo' : 'Nuevo Combo'}</h2>

      {/* Datos generales */}
      <div className="subseccion">
        <h3>Datos generales</h3>
        <div className="formulario formulario-costos">
          <div className="campo" style={{ flex: 2 }}>
            <label>Descripción</label>
            <input
              type="text"
              placeholder="Ej: Caja Día del Padre"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </div>
          <div className="campo">
            <label>Fecha inicio</label>
            <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
          </div>
          <div className="campo">
            <label>Fecha fin</label>
            <input
              type="date"
              value={fechaFin === '3000-12-31' ? '' : fechaFin}
              placeholder="Indefinida"
              onChange={(e) => setFechaFin(e.target.value || '3000-12-31')}
            />
          </div>
          <div className="campo">
            <label>Precio del combo</label>
            <input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
            />
          </div>
          <div className="campo-acciones">
            {combo.id_combo && (
              <button className="btn-secundario" type="button" onClick={usarPrecioSugerido}>
                Usar precio sugerido (${formatearMoneda(precioSugerido)})
              </button>
            )}
            <button className="btn-primario" onClick={handleGuardarCombo} disabled={guardando}>
              {guardando ? 'Guardando...' : 'Guardar combo'}
            </button>
          </div>
        </div>
      </div>

      {/* Productos del combo */}
      {combo.id_combo && (
        <div className="subseccion">
          <h3>Productos incluidos</h3>

          <div className="formulario">
            <div style={{ position: 'relative', flex: 2 }}>
              <input
                type="text"
                placeholder="🔎 Buscar producto..."
                value={textoBuscarProducto}
                onChange={(e) => {
                  setTextoBuscarProducto(e.target.value)
                  setProductoParaAgregar(null)
                }}
              />
              {textoBuscarProducto && !productoParaAgregar && productosFiltrados.length > 0 && (
                <div className="dropdown-resultados">
                  {productosFiltrados.map((p) => (
                    <div key={p.id_producto} className="dropdown-item" onClick={() => seleccionarProducto(p)}>
                      {p.descripcion}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <input
              type="number"
              step="1"
              placeholder="Cantidad"
              value={cantidadProducto}
              onChange={(e) => setCantidadProducto(e.target.value)}
              style={{ maxWidth: '120px' }}
            />
            <button className="btn-primario" onClick={agregarProducto}>
              + Agregar
            </button>
          </div>

          {cargandoProductos && <p>Cargando productos del combo...</p>}

          {!cargandoProductos && (
            <table className="tabla">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Cantidad</th>
                  <th>Costo receta (u.)</th>
                  <th>Precio teórico</th>
                  <th>Precio venta</th>
                  <th>Subtotal</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {productosCombo.length === 0 && (
                  <tr>
                    <td colSpan="7">Todavía no agregaste productos a este combo.</td>
                  </tr>
                )}
                {productosCombo.map((pc) => (
                  <tr key={pc.id_producto}>
                    <td>{pc.productos?.descripcion}</td>
                    <td>{pc.cantidad}</td>
                    <td>${formatearMoneda(pc.costo_receta)}</td>
                    <td>${formatearMoneda(pc.precio_teorico)}</td>
                    <td>${formatearMoneda(pc.precio_venta)}</td>
                    <td>${formatearMoneda((pc.precio_venta || 0) * parseFloat(pc.cantidad))}</td>
                    <td>
                      <button className="btn-link btn-eliminar" onClick={() => quitarProducto(pc.id_producto)}>
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="costo-total">
            💰 Suma de precios de venta (sugerencia): <strong>${formatearMoneda(precioSugerido)}</strong>
            &nbsp;|&nbsp; Precio actual del combo: <strong>${formatearMoneda(parseFloat(precio) || 0)}</strong>
          </div>
        </div>
      )}
    </div>
  )
}

export default Combos