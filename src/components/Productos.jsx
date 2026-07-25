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
  const { mostrarToast, confirmar } = useNotificaciones()
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
  const [precioMayoristaManual, setPrecioMayoristaManual] = useState('')
  const [guardandoPrecio, setGuardandoPrecio] = useState(false)
  const [editandoPrecioId, setEditandoPrecioId] = useState(null)
  const refFechaInicioPrecio = useRef(null)

  useEffect(() => {
    cargarRecetas()
    cargarSecciones()
    if (producto.id_producto) {
      cargarPrecios()
      refFechaInicioPrecio.current?.focus()
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
    if (!producto.id_producto) {
      mostrarToast('Guardá primero los datos generales para poder subir la imagen.', 'error')
      return
    }
    setSubiendoImagen(true)
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const ruta = `productos/${producto.id_producto}-${Date.now()}.${ext}`
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
      mostrarToast('Descripción, receta y coeficiente de ganancia son obligatorios', 'error')
      return null
    }

    setGuardandoCabecera(true)

    const registro = {
      descripcion,
      id_receta: idReceta,
      coeficiente_ganancia: parseFloat(coeficiente),
      id_seccion: idSeccion || null,
      frase_venta: fraseVenta.trim() || null,
      texto_web: textoWeb.trim() || null,
      imagen_url: imagenUrl || null,
      visible_web: visibleWeb,
      orden_web: ordenWeb === '' || ordenWeb === null ? null : parseInt(ordenWeb),
    }

    let idResultante = producto.id_producto

    if (producto.id_producto) {
      const { error } = await supabase.from('productos').update(registro).eq('id_producto', producto.id_producto)
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
      id_producto: producto.id_producto,
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

      <div className="subseccion">
        <h3>Publicación web</h3>
        <div className="ayuda-vigencia">
          Controla cómo aparece este producto en gimeburellopasteleria.com.ar. El precio publicado es el
          precio de venta vigente; si no hay ninguno vigente, la web muestra “Consultar”.
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
            {producto.id_producto ? (
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
                    <th style={{ backgroundColor: '#EDE9FE', color: '#5B21B6' }}>Mayorista</th>
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
                      <td style={{ color: '#5B21B6', fontWeight: 600 }}>
                        {p.precio_mayorista != null ? `$${formatearMoneda(p.precio_mayorista)}` : '—'}
                      </td>
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
