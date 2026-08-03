import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNotificaciones } from '../hooks/useNotificaciones'

function Combos() {
  const { mostrarToast, confirmar } = useNotificaciones()
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
const [anio, mes, dia] = fecha.slice(0, 10).split('-')
    return `${dia}/${mes}/${anio}`	
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
    const confirmado = await confirmar('¿Seguro que querés eliminar este combo? También se eliminará su detalle de productos.')
    if (!confirmado) return

    const { error: errorDetalle } = await supabase.from('detalle_combo').delete().eq('id_combo', id)
    if (errorDetalle) {
      mostrarToast('Error al eliminar el detalle del combo: ' + errorDetalle.message, 'error')
      return
    }

    const { error } = await supabase.from('combos').delete().eq('id_combo', id)

    if (error) {
      mostrarToast('No se pudo eliminar el combo. Puede estar usado en algún pedido.\n\nDetalle: ' + error.message, 'error')
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
    <div className="modulo modulo-compacto">
      <div className="cabecera-lista">
        <h2>Combos</h2>
        <span className="contador">{combosFiltrados.length}</span>
        <div className="buscador-inline">
          <input
            type="text"
            placeholder="🔎 Buscar combo..."
            value={textoBusqueda}
            onChange={(e) => setTextoBusqueda(e.target.value)}
          />
        </div>
        <button className="btn-primario" onClick={iniciarNuevo}>
          + Nuevo
        </button>
      </div>

      {cargando && <p>Cargando...</p>}
      {error && <p className="mensaje-error">{error}</p>}

      {!cargando && !error && (
        <div className="tabla-wrapper">
          <table className="tabla tabla-compacta">
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
                    <button className="icono-accion" title="Ver / Editar" onClick={() => abrirCombo(c)}>✏️</button>
                    <button className="icono-accion" title="Eliminar" onClick={() => eliminarCombo(c.id_combo)}>🗑️</button>
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
// SUBCOMPONENTE: Detalle de combo (cabecera + productos incluidos)
// ============================================================
function DetalleCombo({ combo, onVolver }) {
  const { mostrarToast, confirmar } = useNotificaciones()
  const [idCombo, setIdCombo] = useState(combo.id_combo)
  const [descripcion, setDescripcion] = useState(combo.descripcion)
  const [precio, setPrecio] = useState(combo.precio || '')
  const [fechaInicio, setFechaInicio] = useState(combo.fecha_inicio?.slice(0, 10) || '')
  const [fechaFin, setFechaFin] = useState(combo.fecha_fin?.slice(0, 10) || '3000-12-31')
  const [guardando, setGuardando] = useState(false)

  // Campos de publicación web
  const [idSeccion, setIdSeccion] = useState(combo.id_seccion || '')
  const [fraseVenta, setFraseVenta] = useState(combo.frase_venta || '')
  const [textoWeb, setTextoWeb] = useState(combo.texto_web || '')
  const [imagenUrl, setImagenUrl] = useState(combo.imagen_url || '')
  const [visibleWeb, setVisibleWeb] = useState(combo.visible_web || false)
  const [ordenWeb, setOrdenWeb] = useState(combo.orden_web ?? '')
  const [secciones, setSecciones] = useState([])
  const [subiendoImagen, setSubiendoImagen] = useState(false)

  const [combosExistentes, setCombosExistentes] = useState([])

  const [productosCombo, setProductosCombo] = useState([])
  const [cargandoProductos, setCargandoProductos] = useState(true)

  const [productosDisponibles, setProductosDisponibles] = useState([])
  const [textoBuscarProducto, setTextoBuscarProducto] = useState('')
  const [productoParaAgregar, setProductoParaAgregar] = useState(null)
  const [cantidadProducto, setCantidadProducto] = useState('1')
  const [pestana, setPestana] = useState('productos')

  useEffect(() => {
    cargarCombosExistentes()
    cargarProductosDisponibles()
    cargarSecciones()
  }, [])

  useEffect(() => {
    if (idCombo) {
      cargarProductosDelCombo()
    } else {
      setCargandoProductos(false)
    }
  }, [idCombo])

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

  async function cargarSecciones() {
    const { data } = await supabase
      .from('secciones')
      .select('id_seccion, nombre')
      .eq('nivel', 'rubro')
      .order('orden')
    setSecciones(data || [])
  }

  async function subirImagen(file) {
    if (!file) return
    if (!idCombo) {
      mostrarToast('Guardá primero el combo para poder subir la imagen.', 'error')
      return
    }
    setSubiendoImagen(true)
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const ruta = `combos/${idCombo}-${Date.now()}.${ext}`
    const { error } = await supabase.storage
      .from('catalogo')
      .upload(ruta, file, { upsert: true, contentType: file.type })
    if (error) {
      mostrarToast('Error al subir la imagen: ' + error.message, 'error')
      setSubiendoImagen(false)
      return
    }
    const { data } = supabase.storage.from('catalogo').getPublicUrl(ruta)
    setImagenUrl(data.publicUrl)
    setSubiendoImagen(false)
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

  async function obtenerDatosEconomicos(producto) {
    const costoReceta = producto.id_receta ? await calcularCostoReceta(producto.id_receta) : null
    const precioVigente = await obtenerPrecioVigente(producto.id_producto)

    // El rinde sale del rendimiento del producto; si es un producto viejo sin
    // rendimiento asignado, se usa el rinde histórico de la receta.
    let unidades = producto.rendimientos?.cantidad_unidades
      ? parseFloat(producto.rendimientos.cantidad_unidades)
      : null

    if (!unidades && producto.id_receta) {
      const { data } = await supabase
        .from('recetas')
        .select('cantidad_producto_final')
        .eq('id_receta', producto.id_receta)
        .single()
      unidades = data?.cantidad_producto_final ? parseFloat(data.cantidad_producto_final) : null
    }

    const costoPorUnidad = costoReceta !== null && unidades > 0 ? costoReceta / unidades : null

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
      .select('*, productos(id_producto, descripcion, id_receta, coeficiente_ganancia, id_rendimiento, recetas(descripcion), rendimientos(descripcion, cantidad_unidades))')
      .eq('id_combo', idCombo)

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
    if (!idCombo) {
      mostrarToast('Primero guardá los datos generales del combo antes de agregar productos', 'error')
      return
    }
    if (!productoParaAgregar || !cantidadProducto) {
      mostrarToast('Seleccioná un producto e indicá la cantidad', 'error')
      return
    }

    const yaExiste = productosCombo.find((p) => p.id_producto === productoParaAgregar.id_producto)
    if (yaExiste) {
      mostrarToast('Ese producto ya está agregado al combo. Eliminalo primero si querés cambiar la cantidad.', 'error')
      return
    }

    const { error } = await supabase.from('detalle_combo').insert({
      id_combo: idCombo,
      id_producto: productoParaAgregar.id_producto,
      cantidad: parseFloat(cantidadProducto),
    })

    if (error) {
      mostrarToast('Error al agregar producto: ' + error.message, 'error')
    } else {
      setProductoParaAgregar(null)
      setTextoBuscarProducto('')
      setCantidadProducto('1')
      cargarProductosDelCombo()
    }
  }

  async function quitarProducto(idProducto) {
    const confirmado = await confirmar('¿Quitar este producto del combo?')
    if (!confirmado) return

    const { error } = await supabase
      .from('detalle_combo')
      .delete()
      .eq('id_combo', idCombo)
      .eq('id_producto', idProducto)

    if (error) {
      mostrarToast('Error al quitar el producto: ' + error.message, 'error')
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

  const precioSugerido = productosCombo.reduce((acc, p) => {
    const precioUnitario = p.precio_venta || 0
    return acc + precioUnitario * parseFloat(p.cantidad || 1)
  }, 0)

  function usarPrecioSugerido() {
    setPrecio(precioSugerido.toFixed(2))
  }

  async function guardarCombo() {
    if (!descripcion.trim() || !fechaInicio || !precio) {
      mostrarToast('Descripción, fecha de inicio y precio son obligatorios', 'error')
      return null
    }

    const finEfectivo = fechaFin || '3000-12-31'

    if (new Date(fechaInicio) > new Date(finEfectivo)) {
      mostrarToast('La fecha de inicio no puede ser posterior a la fecha de fin', 'error')
      return null
    }

    const mismaDescripcion = combosExistentes.filter(
      (c) => normalizar(c.descripcion) === normalizar(descripcion) && c.id_combo !== idCombo
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
      mostrarToast('Hay un conflicto de vigencia con otra versión de este combo que no se puede resolver automáticamente. Revisá las fechas.', 'error')
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
      id_seccion: idSeccion || null,
      frase_venta: fraseVenta.trim() || null,
      texto_web: textoWeb.trim() || null,
      imagen_url: imagenUrl || null,
      visible_web: visibleWeb,
      orden_web: ordenWeb === '' || ordenWeb === null ? null : parseInt(ordenWeb),
    }

    let idResultante = idCombo

    if (idCombo) {
      const { error } = await supabase.from('combos').update(registro).eq('id_combo', idCombo)
      if (error) {
        mostrarToast('Error al guardar: ' + error.message, 'error')
        setGuardando(false)
        return null
      }
    } else {
      const { data, error } = await supabase.from('combos').insert(registro).select().single()
      if (error) {
        mostrarToast('Error al guardar: ' + error.message, 'error')
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
      mostrarToast('Combo guardado correctamente')
      if (!idCombo) {
        setIdCombo(id)
      }
    }
  }

  return (
    <div className="modulo modulo-compacto">
      <div className="detalle-cabecera-compacta">
        <button className="btn-volver" onClick={onVolver} style={{ marginBottom: 0 }}>← Volver a Combos</button>
        <h2>{idCombo ? (descripcion || 'Editar Combo') : 'Nuevo Combo'}</h2>
        {idCombo && <span className="id-badge">ID {idCombo}</span>}
      </div>

      <div className="detalle-dos-columnas">
        <aside className="detalle-sidebar">
          <div className="rotulo-grupo">Datos generales</div>
          <div className="campos-apilados">
            <div className="campo">
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
            {idCombo && (
              <button className="btn-secundario" type="button" onClick={usarPrecioSugerido} style={{ width: '100%' }}>
                Usar sugerido (${formatearMoneda(precioSugerido)})
              </button>
            )}
            <button className="btn-primario" onClick={handleGuardarCombo} disabled={guardando} style={{ width: '100%' }}>
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </aside>

        <div className="detalle-principal">
          <div className="tabs-detalle">
            <button className={pestana === 'productos' ? 'tab-btn activo' : 'tab-btn'} onClick={() => setPestana('productos')}>
              Productos incluidos
            </button>
            <button className={pestana === 'web' ? 'tab-btn activo' : 'tab-btn'} onClick={() => setPestana('web')}>
              Publicación web
            </button>
          </div>

          {pestana === 'productos' && (
            !idCombo ? (
              <p style={{ color: '#8A6A66', fontSize: 13 }}>Guardá primero los datos generales para poder agregar productos.</p>
            ) : (
              <>
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
                  <div className="tabla-wrapper">
                    <table className="tabla tabla-compacta">
                      <thead>
                        <tr>
                          <th>Producto</th>
                          <th>Cantidad</th>
                          <th>Costo unidad</th>
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
                            <td>
                              {pc.productos?.descripcion}
                              {pc.productos?.recetas?.descripcion && (
                                <span style={{ display: 'block', fontSize: '11px', color: '#A68E89' }}>
                                  {pc.productos.recetas.descripcion}
                                  {pc.productos.rendimientos?.descripcion ? ` · ${pc.productos.rendimientos.descripcion}` : ''}
                                </span>
                              )}
                            </td>
                            <td>{pc.cantidad}</td>
                            <td>${formatearMoneda(pc.costo_receta)}</td>
                            <td>${formatearMoneda(pc.precio_teorico)}</td>
                            <td>${formatearMoneda(pc.precio_venta)}</td>
                            <td>${formatearMoneda((pc.precio_venta || 0) * parseFloat(pc.cantidad))}</td>
                            <td>
                              <button className="icono-accion" title="Quitar" onClick={() => quitarProducto(pc.id_producto)}>🗑️</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="costo-total">
                  💰 Suma de precios de venta (sugerencia): <strong>${formatearMoneda(precioSugerido)}</strong>
                  &nbsp;|&nbsp; Precio actual del combo: <strong>${formatearMoneda(parseFloat(precio) || 0)}</strong>
                </div>
              </>
            )
          )}

          {pestana === 'web' && (
            <>
              <div className="ayuda-vigencia">
                Controla cómo aparece este combo en gimeburellopasteleria.com.ar. El precio publicado es el precio
                del combo mientras esté dentro de su vigencia; fuera de vigencia la web muestra "Consultar".
              </div>

              <div className="formulario formulario-costos">
                <div className="campo" style={{ flex: 2 }}>
                  <label>Rubro</label>
                  <select value={idSeccion} onChange={(e) => setIdSeccion(e.target.value)}>
                    <option value="">— Sin rubro (no se publica) —</option>
                    {secciones.map((s) => (
                      <option key={s.id_seccion} value={s.id_seccion}>
                        {s.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="campo" style={{ flex: 2 }}>
                  <label>Frase de venta</label>
                  <input
                    type="text"
                    placeholder="Ej: Todo listo para regalar."
                    value={fraseVenta}
                    onChange={(e) => setFraseVenta(e.target.value)}
                  />
                </div>

                <div className="campo">
                  <label>Orden</label>
                  <input
                    type="number"
                    placeholder="1"
                    value={ordenWeb}
                    onChange={(e) => setOrdenWeb(e.target.value)}
                  />
                </div>
              </div>

              <div className="formulario formulario-costos">
                <div className="campo" style={{ flex: 3 }}>
                  <label>Texto web</label>
                  <textarea
                    rows={3}
                    placeholder="Descripción que se muestra en la tarjeta del combo."
                    value={textoWeb}
                    onChange={(e) => setTextoWeb(e.target.value)}
                    style={{
                      padding: '10px 12px',
                      border: '1px solid #E8D5CF',
                      borderRadius: 8,
                      fontFamily: "'Poppins', sans-serif",
                      fontSize: 14,
                      width: '100%',
                      resize: 'vertical',
                    }}
                  />
                </div>

                <div className="campo" style={{ flex: 2 }}>
                  <label>Imagen</label>
                  {idCombo ? (
                    <>
                      <input
                        type="file"
                        accept="image/*"
                        disabled={subiendoImagen}
                        onChange={(e) => subirImagen(e.target.files?.[0])}
                      />
                      {subiendoImagen && (
                        <span style={{ color: '#8A6A66', fontSize: 13 }}>Subiendo imagen...</span>
                      )}
                      {imagenUrl && (
                        <img
                          src={imagenUrl}
                          alt="Imagen del combo"
                          style={{ marginTop: 8, width: 120, height: 90, objectFit: 'cover', borderRadius: 8 }}
                        />
                      )}
                    </>
                  ) : (
                    <span style={{ color: '#8A6A66', fontSize: 13 }}>
                      Guardá el combo para poder subir una imagen.
                    </span>
                  )}
                </div>
              </div>

              <div className="formulario formulario-costos">
                <div className="campo">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={visibleWeb}
                      onChange={(e) => setVisibleWeb(e.target.checked)}
                      style={{ width: 'auto' }}
                    />
                    Publicar en la web
                  </label>
                </div>

                <div className="campo-acciones">
                  <button className="btn-primario" onClick={handleGuardarCombo} disabled={guardando}>
                    {guardando ? 'Guardando...' : 'Guardar publicación web'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default Combos
