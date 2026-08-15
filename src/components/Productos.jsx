import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useNotificaciones } from '../hooks/useNotificaciones'

function Productos() {
  const { mostrarToast, confirmar } = useNotificaciones()
  const [productos, setProductos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const [vista, setVista] = useState('lista')
  const [productoActual, setProductoActual] = useState(null)

  const [textoBusqueda, setTextoBusqueda] = useState('')
  const [secciones, setSecciones] = useState([])
  const [filtroRubro, setFiltroRubro] = useState('todos')
  const [preciosVigentes, setPreciosVigentes] = useState({})

  useEffect(() => {
    cargarProductos()
    cargarSecciones()
    cargarPreciosVigentes()
  }, [])

  async function cargarSecciones() {
    const { data } = await supabase
      .from('secciones')
      .select('id_seccion, nombre')
      .eq('nivel', 'rubro')
      .order('orden')
    setSecciones(data || [])
  }

  function normalizar(texto) {
    return texto
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  }

  function formatearMonedaLista(valor) {
    if (valor === null || valor === undefined || isNaN(valor)) return '—'
    return new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(valor)
  }

  async function cargarPreciosVigentes() {
    const hoy = new Date().toLocaleString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).slice(0, 10)
    const { data } = await supabase
      .from('precios')
      .select('id_producto, precio_venta, precio_mayorista, fecha_inicio')
      .lte('fecha_inicio', hoy)
      .gte('fecha_fin', hoy)
      .order('fecha_inicio', { ascending: false })

    const mapa = {}
    ;(data || []).forEach((fila) => {
      if (!mapa[fila.id_producto]) mapa[fila.id_producto] = fila
    })
    setPreciosVigentes(mapa)
  }

  async function cargarProductos() {
    setCargando(true)
    setError(null)
    const { data, error } = await supabase
      .from('productos')
      .select('*, recetas(descripcion), rendimientos(descripcion, cantidad_unidades)')
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
      coeficiente_ganancia: 3,
    })
    setVista('detalle')
  }

  function abrirProducto(producto) {
    setProductoActual({ ...producto })
    setVista('detalle')
  }

  async function eliminarProducto(id) {
    const confirmado = await confirmar('¿Seguro que querés eliminar este producto? También se eliminará su historial de precios.')
    if (!confirmado) return

    const { error: errorPrecios } = await supabase.from('precios').delete().eq('id_producto', id)
    if (errorPrecios) {
      mostrarToast('Error al eliminar precios del producto: ' + errorPrecios.message, 'error')
      return
    }

    const { error } = await supabase.from('productos').delete().eq('id_producto', id)

    if (error) {
      mostrarToast('No se pudo eliminar el producto. Puede estar usado en algún combo o pedido. Detalle: ' + error.message, 'error')
    } else {
      cargarProductos()
    }
  }

  const productosFiltrados = productos
    .filter((p) => (textoBusqueda.trim() ? normalizar(p.descripcion).includes(normalizar(textoBusqueda)) : true))
    .filter((p) => (filtroRubro === 'todos' ? true : String(p.id_seccion || '') === filtroRubro))

  if (vista === 'detalle') {
    return (
      <DetalleProducto
        producto={productoActual}
        onVolver={() => {
          setVista('lista')
          cargarProductos()
          cargarPreciosVigentes()
        }}
      />
    )
  }

  return (
    <div className="modulo modulo-compacto">
      <div className="cabecera-lista">
        <h2>Productos</h2>
        <span className="contador">{productosFiltrados.length}</span>
        <div className="buscador-inline">
          <input
            type="text"
            placeholder="🔎 Buscar producto..."
            value={textoBusqueda}
            onChange={(e) => setTextoBusqueda(e.target.value)}
          />
        </div>
        <select className="filtro-rubro" value={filtroRubro} onChange={(e) => setFiltroRubro(e.target.value)}>
          <option value="todos">Rubro: todos</option>
          {secciones.map((s) => (
            <option key={s.id_seccion} value={String(s.id_seccion)}>{s.nombre}</option>
          ))}
        </select>
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
                <th>Receta</th>
                <th>Coef.</th>
                <th title="Publicado en la web">Web</th>
                <th style={{ textAlign: 'right' }}>Minorista</th>
                <th style={{ textAlign: 'right' }}>Mayorista</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {productosFiltrados.length === 0 && (
                <tr>
                  <td colSpan="8">No hay productos registrados.</td>
                </tr>
              )}
              {productosFiltrados.map((p) => (
                <tr key={p.id_producto}>
                  <td>{p.id_producto}</td>
                  <td>{p.descripcion}</td>
                  <td>
                    {p.recetas?.descripcion || '—'}
                    {p.rendimientos?.descripcion && (
                      <span style={{ color: '#A68E89', fontSize: '11.5px' }}> · {p.rendimientos.descripcion}</span>
                    )}
                  </td>
                  <td>{p.coeficiente_ganancia}</td>
                  <td style={{ textAlign: 'center' }} title={p.visible_web ? 'Publicado en la web' : 'No publicado'}>
                    {p.visible_web ? '👁️' : '—'}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {preciosVigentes[p.id_producto]
                      ? `$${formatearMonedaLista(preciosVigentes[p.id_producto].precio_venta)}`
                      : <span style={{ color: '#993C1D', fontStyle: 'italic', fontSize: '11.5px' }}>Sin precio</span>}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap', color: '#534AB7' }}>
                    {preciosVigentes[p.id_producto]?.precio_mayorista != null
                      ? `$${formatearMonedaLista(preciosVigentes[p.id_producto].precio_mayorista)}`
                      : <span style={{ color: '#A68E89' }}>—</span>}
                  </td>
                  <td>
                    <button className="icono-accion" title="Ver / Editar" onClick={() => abrirProducto(p)}>✏️</button>
                    <button className="icono-accion" title="Eliminar" onClick={() => eliminarProducto(p.id_producto)}>🗑️</button>
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
  const { mostrarToast, confirmar } = useNotificaciones()
  const [idProducto, setIdProducto] = useState(producto.id_producto)
  const [descripcion, setDescripcion] = useState(producto.descripcion)
  const [idReceta, setIdReceta] = useState(producto.id_receta)
  const [coeficiente, setCoeficiente] = useState(producto.coeficiente_ganancia)
  const [guardandoCabecera, setGuardandoCabecera] = useState(false)

  // Campos de publicación web
  const [idSeccion, setIdSeccion] = useState(producto.id_seccion || '')
  const [fraseVenta, setFraseVenta] = useState(producto.frase_venta || '')
  const [textoWeb, setTextoWeb] = useState(producto.texto_web || '')
  const [imagenUrl, setImagenUrl] = useState(producto.imagen_url || '')
  const [visibleWeb, setVisibleWeb] = useState(producto.visible_web || false)
  const [ordenWeb, setOrdenWeb] = useState(producto.orden_web ?? '')
  const [secciones, setSecciones] = useState([])
  const [subiendoImagen, setSubiendoImagen] = useState(false)

  const [idRendimiento, setIdRendimiento] = useState(producto.id_rendimiento)
  const [combinaciones, setCombinaciones] = useState([])
  const [textoBuscarReceta, setTextoBuscarReceta] = useState('')
  const [combinacionSeleccionada, setCombinacionSeleccionada] = useState(null)

  const [costoReceta, setCostoReceta] = useState(null)
  const [calculandoCosto, setCalculandoCosto] = useState(false)

  const [precios, setPrecios] = useState([])
  const [cargandoPrecios, setCargandoPrecios] = useState(true)

  const [fechaInicioPrecio, setFechaInicioPrecio] = useState(new Date().toISOString().slice(0, 10))
  const [fechaFinPrecio, setFechaFinPrecio] = useState('3000-12-31')
  const [precioVentaManual, setPrecioVentaManual] = useState('')
  const [precioMayoristaManual, setPrecioMayoristaManual] = useState('')
  const [guardandoPrecio, setGuardandoPrecio] = useState(false)
  const [editandoPrecioId, setEditandoPrecioId] = useState(null)
  const refFechaInicioPrecio = useRef(null)
  const [pestana, setPestana] = useState('historial')

  useEffect(() => {
    cargarRecetas()
    cargarSecciones()
  }, [])

  useEffect(() => {
    if (idProducto) {
      cargarPrecios()
      refFechaInicioPrecio.current?.focus()
    } else {
      setCargandoPrecios(false)
    }
  }, [idProducto])

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
const [anio, mes, dia] = fecha.slice(0, 10).split('-')
    return `${dia}/${mes}/${anio}`
  }

  function formatearMoneda(valor) {
    if (valor === null || valor === undefined || isNaN(valor)) return '—'
    return new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(valor)
  }

  async function cargarRecetas() {
    const { data } = await supabase
      .from('recetas')
      .select('id_receta, descripcion, rendimientos(id_rendimiento, descripcion, cantidad_unidades)')
      .order('descripcion')

    // Cada opción del selector es una combinación receta · rendimiento
    const lista = []
    for (const r of data || []) {
      for (const rend of r.rendimientos || []) {
        lista.push({
          id_receta: r.id_receta,
          id_rendimiento: rend.id_rendimiento,
          texto: `${r.descripcion} · ${rend.descripcion}`,
          unidades: parseFloat(rend.cantidad_unidades),
        })
      }
    }
    lista.sort((a, b) => a.texto.localeCompare(b.texto))
    setCombinaciones(lista)

    if (producto.id_rendimiento) {
      const actual = lista.find((c) => c.id_rendimiento === producto.id_rendimiento)
      if (actual) {
        setCombinacionSeleccionada(actual)
        setTextoBuscarReceta(actual.texto)
      }
    } else if (producto.id_receta) {
      // Producto viejo sin rendimiento asignado: ofrecer el primero de su receta
      const porReceta = lista.find((c) => c.id_receta === producto.id_receta)
      if (porReceta) {
        setCombinacionSeleccionada(porReceta)
        setIdRendimiento(porReceta.id_rendimiento)
        setTextoBuscarReceta(porReceta.texto)
      }
    }
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
    if (!idProducto) {
      mostrarToast('Guardá primero los datos generales para poder subir la imagen.', 'error')
      return
    }
    setSubiendoImagen(true)
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const ruta = `productos/${idProducto}-${Date.now()}.${ext}`
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

  const combinacionesFiltradas = textoBuscarReceta.trim()
    ? combinaciones.filter((c) => normalizar(c.texto).includes(normalizar(textoBuscarReceta)))
    : []

  function seleccionarCombinacion(combinacion) {
    setCombinacionSeleccionada(combinacion)
    setIdReceta(combinacion.id_receta)
    setIdRendimiento(combinacion.id_rendimiento)
    setTextoBuscarReceta(combinacion.texto)
  }

  const costoPorUnidad =
    costoReceta !== null && combinacionSeleccionada?.unidades > 0
      ? costoReceta / combinacionSeleccionada.unidades
      : null

  const precioTeoricoSimulado =
    costoPorUnidad !== null ? costoPorUnidad * parseFloat(coeficiente || 0) : null

  // % de ganancia sobre el costo por unidad de la receta: (precio − costo) / costo
  function gananciaSobreCosto(precioStr) {
    const precio = parseFloat(precioStr)
    if (isNaN(precio) || precio <= 0 || costoPorUnidad === null || costoPorUnidad <= 0) return null
    return ((precio - costoPorUnidad) / costoPorUnidad) * 100
  }

  function formatearPorcentaje(valor) {
    return new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(valor)
  }

  async function guardarCabecera() {
    if (!descripcion.trim() || !idReceta || !idRendimiento || !coeficiente) {
      mostrarToast('Descripción, receta·rendimiento y coeficiente de ganancia son obligatorios', 'error')
      return null
    }

    setGuardandoCabecera(true)

    const registro = {
      descripcion,
      id_receta: idReceta,
      id_rendimiento: idRendimiento,
      coeficiente_ganancia: parseFloat(coeficiente),
      id_seccion: idSeccion || null,
      frase_venta: fraseVenta.trim() || null,
      texto_web: textoWeb.trim() || null,
      imagen_url: imagenUrl || null,
      visible_web: visibleWeb,
      orden_web: ordenWeb === '' || ordenWeb === null ? null : parseInt(ordenWeb),
    }

    let idResultante = idProducto

    if (idProducto) {
      const { error } = await supabase.from('productos').update(registro).eq('id_producto', idProducto)
      if (error) {
        mostrarToast('Error al guardar: ' + error.message, 'error')
        setGuardandoCabecera(false)
        return null
      }
    } else {
      const { data, error } = await supabase.from('productos').insert(registro).select().single()
      if (error) {
        mostrarToast('Error al guardar: ' + error.message, 'error')
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
      mostrarToast('Producto guardado correctamente')
      if (!idProducto) {
        setIdProducto(id)
      }
    }
  }

  async function cargarPrecios() {
    setCargandoPrecios(true)
    const { data, error } = await supabase
      .from('precios')
      .select('*')
      .eq('id_producto', idProducto)
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
    setPrecioMayoristaManual('')
    refFechaInicioPrecio.current?.focus()
  }

  function iniciarEdicionPrecio(p) {
    setEditandoPrecioId(p.id_precio)
    setFechaInicioPrecio(p.fecha_inicio?.slice(0, 10) || '')
    setFechaFinPrecio(p.fecha_fin?.slice(0, 10) || '3000-12-31')
    setPrecioVentaManual(p.precio_venta)
    setPrecioMayoristaManual(p.precio_mayorista != null ? String(p.precio_mayorista) : '')
    refFechaInicioPrecio.current?.focus()
  }

  async function guardarPrecio() {
    if (!fechaInicioPrecio || !precioVentaManual) {
      mostrarToast('Fecha de inicio y precio de venta son obligatorios', 'error')
      return
    }

    if (precioMayoristaManual === '' || precioMayoristaManual === null) {
      mostrarToast('Falta el precio mayorista. Es obligatorio: si no lo cargás, los clientes mayoristas quedan sin su precio.', 'error')
      return
    }

    if (isNaN(parseFloat(precioMayoristaManual)) || parseFloat(precioMayoristaManual) < 0) {
      mostrarToast('El precio mayorista no es válido.', 'error')
      return
    }

    const finEfectivo = fechaFinPrecio || '3000-12-31'

    if (new Date(fechaInicioPrecio) > new Date(finEfectivo)) {
      mostrarToast('La fecha de inicio no puede ser posterior a la fecha de fin', 'error')
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
      mostrarToast('Hay un conflicto de vigencia con otro precio que no se puede resolver automáticamente. Revisá las fechas.', 'error')
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
      id_producto: idProducto,
      fecha_inicio: fechaInicioPrecio,
      fecha_fin: finEfectivo,
      precio_venta: parseFloat(precioVentaManual),
      precio_mayorista: parseFloat(precioMayoristaManual),
      precio_teorico: precioTeoricoSimulado !== null ? parseFloat(precioTeoricoSimulado.toFixed(2)) : null,
    }

    let resultado
    if (editandoPrecioId) {
      resultado = await supabase.from('precios').update(registro).eq('id_precio', editandoPrecioId)
    } else {
      resultado = await supabase.from('precios').insert(registro)
    }

    if (resultado.error) {
      mostrarToast('Error al guardar el precio: ' + resultado.error.message, 'error')
    } else {
      const avisoAjuste = ajustables.length > 0
        ? `\n\nSe actualizó automáticamente la vigencia de ${ajustables.length} precio(s) anterior(es).`
        : ''
      mostrarToast('Precio guardado correctamente.' + avisoAjuste)
      setEditandoPrecioId(null)
      setPrecioVentaManual('')
      cargarPrecios()
    }

    setGuardandoPrecio(false)
  }

  async function eliminarPrecio(id) {
    const confirmado = await confirmar('¿Seguro que querés eliminar este registro de precio?')
    if (!confirmado) return

    const { error } = await supabase.from('precios').delete().eq('id_precio', id)

    if (error) {
      mostrarToast('No se pudo eliminar: ' + error.message, 'error')
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
    <div className="modulo modulo-compacto">
      <div className="detalle-cabecera-compacta">
        <button className="btn-volver" onClick={onVolver} style={{ marginBottom: 0 }}>← Volver a Productos</button>
        <h2>{descripcion || (idProducto ? 'Editar Producto' : 'Nuevo Producto')}</h2>
        {idProducto && <span className="id-badge">ID {idProducto}</span>}
      </div>

      <div className="detalle-dos-columnas">
        {/* ===== COLUMNA IZQUIERDA: datos generales + simulador ===== */}
        <aside className="detalle-sidebar">
          <div className="rotulo-grupo">Datos generales</div>
          <div className="campos-apilados">
            <div className="campo">
              <label>Descripción</label>
              <input
                type="text"
                placeholder="Ej: Torta de Chocolate 1kg"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
            </div>

            <div className="campo" style={{ position: 'relative' }}>
              <label>Receta y rendimiento</label>
              <input
                type="text"
                placeholder="🔎 Buscar receta o rendimiento..."
                value={textoBuscarReceta}
                onChange={(e) => {
                  setTextoBuscarReceta(e.target.value)
                  setCombinacionSeleccionada(null)
                  setIdReceta(null)
                  setIdRendimiento(null)
                }}
              />
              {textoBuscarReceta && !combinacionSeleccionada && combinacionesFiltradas.length > 0 && (
                <div className="dropdown-resultados">
                  {combinacionesFiltradas.map((c) => (
                    <div key={c.id_rendimiento} className="dropdown-item" onClick={() => seleccionarCombinacion(c)}>
                      {c.texto}
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
                placeholder="Ej: 3"
                value={coeficiente}
                onChange={(e) => setCoeficiente(e.target.value)}
              />
            </div>

            <button className="btn-primario" onClick={handleGuardarCabecera} disabled={guardandoCabecera} style={{ width: '100%' }}>
              {guardandoCabecera ? 'Guardando...' : 'Guardar'}
            </button>
          </div>

          {idReceta && (
            <>
              <hr className="separador" />
              <div className="rotulo-grupo">Simulador de precio</div>
              {calculandoCosto && <p style={{ fontSize: 12.5, color: '#8A6A66' }}>Calculando...</p>}
              {!calculandoCosto && costoReceta !== null && (
                <div className="simulador-compacto">
                  <div className="sim-fila"><span>Costo receta</span><span>${formatearMoneda(costoReceta)}</span></div>
                  {combinacionSeleccionada && (
                    <div className="sim-fila"><span>Rendimiento</span><span>÷ {combinacionSeleccionada.unidades} u.</span></div>
                  )}
                  <div className="sim-fila"><span>Costo unitario</span><span>${formatearMoneda(costoPorUnidad)}</span></div>
                  <div className="sim-fila"><span>Coeficiente</span><span>x{parseFloat(coeficiente || 0).toFixed(2)}</span></div>
                  <div className="sim-fila sim-total"><span>Precio teórico</span><span>${formatearMoneda(precioTeoricoSimulado)}</span></div>
                </div>
              )}
              {!calculandoCosto && costoReceta === null && (
                <p className="mensaje-error" style={{ fontSize: 12.5 }}>No se pudo calcular el costo (verificá costos vigentes de los ingredientes).</p>
              )}
              {precioDesactualizado && (
                <div className="aviso-similar" style={{ marginTop: 8, fontSize: 12 }}>
                  El precio vigente (${formatearMoneda(precioVigenteHoy.precio_venta)}) difiere del teórico (${formatearMoneda(precioTeoricoSimulado)}).
                </div>
              )}
            </>
          )}
        </aside>

        {/* ===== COLUMNA DERECHA: solapas ===== */}
        <div className="detalle-principal">
          <div className="tabs-detalle">
            <button className={pestana === 'historial' ? 'tab-btn activo' : 'tab-btn'} onClick={() => setPestana('historial')}>
              Historial de precios
            </button>
            <button className={pestana === 'web' ? 'tab-btn activo' : 'tab-btn'} onClick={() => setPestana('web')}>
              Publicación web
            </button>
          </div>

          {pestana === 'historial' && (
            !idProducto ? (
              <p style={{ color: '#8A6A66', fontSize: 13 }}>Guardá primero los datos generales para poder cargar precios.</p>
            ) : (
              <>
                <div className="formulario formulario-costos">
                  <div style={{ display: 'flex', gap: '14px' }}>
                    <div className="campo">
                      <label>Fecha inicio</label>
                      <input
                        type="date"
                        ref={refFechaInicioPrecio}
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
                  </div>
                  <div style={{ display: 'flex', gap: '14px' }}>
                    <div className="campo">
                      <label>Precio de venta</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={precioVentaManual}
                        onChange={(e) => setPrecioVentaManual(e.target.value)}
                      />
                      {gananciaSobreCosto(precioVentaManual) !== null && (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: gananciaSobreCosto(precioVentaManual) >= 0 ? '#2D6A35' : '#C0392B',
                          }}
                        >
                          Ganancia: {formatearPorcentaje(gananciaSobreCosto(precioVentaManual))}% s/ costo unidad
                        </span>
                      )}
                    </div>
                    <div className="campo">
                      <label style={{ color: '#5B21B6' }}>Precio mayorista *</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={precioMayoristaManual}
                        onChange={(e) => setPrecioMayoristaManual(e.target.value)}
                        style={{ background: '#fff', colorScheme: 'light', borderColor: '#C4B5FD' }}
                      />
                      {gananciaSobreCosto(precioMayoristaManual) !== null && (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: gananciaSobreCosto(precioMayoristaManual) >= 0 ? '#2D6A35' : '#C0392B',
                          }}
                        >
                          Ganancia: {formatearPorcentaje(gananciaSobreCosto(precioMayoristaManual))}% s/ costo unidad
                        </span>
                      )}
                    </div>
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
                    <table className="tabla tabla-compacta">
                      <thead>
                        <tr>
                          <th>Desde</th>
                          <th>Hasta</th>
                          <th>Venta</th>
                          <th style={{ backgroundColor: '#EDE9FE', color: '#5B21B6' }}>Mayorista</th>
                          <th>Teórico</th>
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
                            <td style={{ color: '#5B21B6', fontWeight: 600 }}>
                              {p.precio_mayorista != null ? `$${formatearMoneda(p.precio_mayorista)}` : '—'}
                            </td>
                            <td>{p.precio_teorico ? `$${formatearMoneda(p.precio_teorico)}` : '—'}</td>
                            <td>
                              <button className="icono-accion" title="Editar" onClick={() => iniciarEdicionPrecio(p)}>✏️</button>
                              <button className="icono-accion" title="Eliminar" onClick={() => eliminarPrecio(p.id_precio)}>🗑️</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )
          )}

          {pestana === 'web' && (
            <>
              <div className="ayuda-vigencia">
                Controla cómo aparece este producto en gimeburellopasteleria.com.ar. El precio publicado es el
                precio de venta vigente; si no hay ninguno vigente, la web muestra "Consultar".
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
                    placeholder="Ej: El clásico que nunca falla."
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
                    placeholder="Descripción que se muestra en la tarjeta del producto."
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
                  {idProducto ? (
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
                          alt="Imagen del producto"
                          style={{ marginTop: 8, width: 120, height: 90, objectFit: 'cover', borderRadius: 8 }}
                        />
                      )}
                    </>
                  ) : (
                    <span style={{ color: '#8A6A66', fontSize: 13 }}>
                      Guardá el producto para poder subir una imagen.
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
                  <button className="btn-primario" onClick={handleGuardarCabecera} disabled={guardandoCabecera}>
                    {guardandoCabecera ? 'Guardando...' : 'Guardar publicación web'}
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

export default Productos
