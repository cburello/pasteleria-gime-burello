import { useState, useEffect } from 'react'
import { obtenerRecetasParaSeleccion, generarPdfRecetas } from '../lib/recetasPdf'
import { supabase } from '../lib/supabase'
import { useNotificaciones } from '../hooks/useNotificaciones'

function Recetas() {
  const { mostrarToast, confirmar } = useNotificaciones()
  const [recetas, setRecetas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const [vista, setVista] = useState('lista')
  const [recetaActual, setRecetaActual] = useState(null)

  const [textoBusqueda, setTextoBusqueda] = useState('')

  const [modalImprimirAbierto, setModalImprimirAbierto] = useState(false)
  const [listaImprimir, setListaImprimir] = useState([])
  const [cargandoListaImprimir, setCargandoListaImprimir] = useState(false)
  const [seleccionImprimir, setSeleccionImprimir] = useState({}) // { id_receta: true/false }
  const [buscarImprimir, setBuscarImprimir] = useState('')
  const [generandoPdf, setGenerandoPdf] = useState(false)

  useEffect(() => {
    cargarRecetas()
  }, [])

  function normalizar(texto) {
    return texto
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  }

  async function cargarRecetas() {
    setCargando(true)
    setError(null)
    const { data, error } = await supabase
      .from('recetas')
      .select('*, rendimientos(id_rendimiento, descripcion, cantidad_unidades)')
      .order('id_receta', { ascending: false })

    if (error) {
      setError('Error al cargar las recetas: ' + error.message)
    } else {
      setRecetas(data)
    }
    setCargando(false)
  }

  function iniciarNueva() {
    setRecetaActual({
      id_receta: null,
      descripcion: '',
      fecha_inicio: new Date().toISOString().slice(0, 10),
      fecha_fin: '3000-12-31',
    })
    setVista('detalle')
  }

  function abrirReceta(receta) {
    setRecetaActual({ ...receta })
    setVista('detalle')
  }

  async function eliminarReceta(id) {
    const confirmado = await confirmar('¿Seguro que querés eliminar esta receta? También se eliminarán sus ingredientes.')
    if (!confirmado) return

    const { error: errorDetalle } = await supabase
      .from('detalle_receta')
      .delete()
      .eq('id_receta', id)

    if (errorDetalle) {
      mostrarToast('Error al eliminar ingredientes de la receta: ' + errorDetalle.message, 'error')
      return
    }

    // Los rendimientos usados por productos bloquean el borrado (FK): es la protección buscada.
    const { error: errorRendimientos } = await supabase
      .from('rendimientos')
      .delete()
      .eq('id_receta', id)

    if (errorRendimientos) {
      mostrarToast('No se puede eliminar la receta: alguno de sus rendimientos está usado por un producto.', 'error')
      return
    }

    const { error } = await supabase
      .from('recetas')
      .delete()
      .eq('id_receta', id)

    if (error) {
      mostrarToast('No se pudo eliminar la receta. Puede estar usada en algún producto. Detalle: ' + error.message, 'error')
    } else {
      cargarRecetas()
    }
  }

  const recetasFiltradas = textoBusqueda.trim()
    ? recetas.filter((r) => normalizar(r.descripcion).includes(normalizar(textoBusqueda)))
    : recetas

  function formatearFecha(fecha) {
    if (!fecha) return ''
    const [anio, mes, dia] = fecha.slice(0, 10).split('-')
    return `${dia}/${mes}/${anio}`
  }

  async function abrirModalImprimir() {
    setModalImprimirAbierto(true)
    setCargandoListaImprimir(true)
    setBuscarImprimir('')
    try {
      const lista = await obtenerRecetasParaSeleccion(supabase)
      setListaImprimir(lista)
      const inicial = {}
      lista.forEach((r) => { inicial[r.id_receta] = true })
      setSeleccionImprimir(inicial)
    } catch (e) {
      mostrarToast(e.message, 'error')
      setModalImprimirAbierto(false)
    }
    setCargandoListaImprimir(false)
  }

  function cerrarModalImprimir() {
    if (generandoPdf) return
    setModalImprimirAbierto(false)
  }

  const listaImprimirFiltrada = buscarImprimir.trim()
    ? listaImprimir.filter((r) => normalizar(r.descripcion).includes(normalizar(buscarImprimir)))
    : listaImprimir

  const cantidadSeleccionada = Object.values(seleccionImprimir).filter(Boolean).length
  const todasMarcadas = listaImprimirFiltrada.length > 0 && listaImprimirFiltrada.every((r) => seleccionImprimir[r.id_receta])

  function toggleUna(id) {
    setSeleccionImprimir((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function toggleTodas() {
    const nuevoValor = !todasMarcadas
    setSeleccionImprimir((prev) => {
      const copia = { ...prev }
      listaImprimirFiltrada.forEach((r) => { copia[r.id_receta] = nuevoValor })
      return copia
    })
  }

  async function handleGenerarPdf() {
    const seleccionadas = listaImprimir.filter((r) => seleccionImprimir[r.id_receta])
    if (seleccionadas.length === 0) {
      mostrarToast('Elegí al menos una receta.', 'error')
      return
    }
    setGenerandoPdf(true)
    try {
      await generarPdfRecetas(supabase, seleccionadas)
      setModalImprimirAbierto(false)
    } catch (e) {
      mostrarToast('No se pudo generar el PDF: ' + e.message, 'error')
    }
    setGenerandoPdf(false)
  }

  if (vista === 'detalle') {
    return (
      <DetalleReceta
        receta={recetaActual}
        recetasExistentes={recetas}
        onVolver={() => {
          setVista('lista')
          cargarRecetas()
        }}
      />
    )
  }

  return (
    <div className="modulo modulo-compacto">
      <div className="cabecera-lista">
        <h2>Recetas</h2>
        <span className="contador">{recetasFiltradas.length}</span>
        <div className="buscador-inline">
          <input
            type="text"
            placeholder="🔎 Buscar receta..."
            value={textoBusqueda}
            onChange={(e) => setTextoBusqueda(e.target.value)}
          />
        </div>
        <button className="btn-secundario" onClick={abrirModalImprimir}>
          🖨️ Imprimir
        </button>
        <button className="btn-primario" onClick={iniciarNueva}>
          + Nueva
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
                <th>Rendimientos</th>
                <th>Vigencia</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {recetasFiltradas.length === 0 && (
                <tr>
                  <td colSpan="5">No hay recetas registradas.</td>
                </tr>
              )}
              {recetasFiltradas.map((r) => (
                <tr key={r.id_receta}>
                  <td>{r.id_receta}</td>
                  <td>{r.descripcion}</td>
                  <td>
                    {(r.rendimientos || []).length === 0
                      ? <span style={{ color: '#C0392B', fontSize: '12px' }}>Sin rendimientos</span>
                      : (r.rendimientos || []).map((rd) => rd.descripcion).join(' · ')}
                  </td>
                  <td>
                    {formatearFecha(r.fecha_inicio)} —{' '}
                    {r.fecha_fin?.slice(0, 10) === '3000-12-31' ? 'Indefinida' : formatearFecha(r.fecha_fin)}
                  </td>
                  <td>
                    <button className="icono-accion" title="Ver / Editar" onClick={() => abrirReceta(r)}>✏️</button>
                    <button className="icono-accion" title="Eliminar" onClick={() => eliminarReceta(r.id_receta)}>🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalImprimirAbierto && (
        <div className="modal-overlay" onClick={cerrarModalImprimir}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3>Imprimir recetas</h3>
            <p className="ayuda-vigencia">Elegí una, varias, o todas. Orden alfabético.</p>

            {cargandoListaImprimir ? (
              <p>Cargando...</p>
            ) : (
              <>
                <input
                  type="text"
                  placeholder="🔎 Buscar receta..."
                  value={buscarImprimir}
                  onChange={(e) => setBuscarImprimir(e.target.value)}
                  style={{ width: '100%', marginBottom: '10px' }}
                />

                <label
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600,
                    fontSize: '.9rem', padding: '6px 2px', borderBottom: '2px solid #F0DAD3', marginBottom: '4px',
                  }}
                >
                  <input type="checkbox" checked={todasMarcadas} onChange={toggleTodas} />
                  Seleccionar todas ({listaImprimirFiltrada.length})
                </label>

                <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                  {listaImprimirFiltrada.length === 0 && (
                    <p className="ayuda-vigencia">No hay recetas que coincidan con la búsqueda.</p>
                  )}
                  {listaImprimirFiltrada.map((r) => (
                    <label
                      key={r.id_receta}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 2px',
                        borderBottom: '1px solid #FAEDE9', fontSize: '.88rem', cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={!!seleccionImprimir[r.id_receta]}
                        onChange={() => toggleUna(r.id_receta)}
                      />
                      <span style={{ flex: 1 }}>{r.descripcion}</span>
                      {r.sinProducto && (
                        <span
                          style={{
                            fontSize: '.66rem', background: '#FBEFD9', color: '#C9A227',
                            padding: '2px 9px', borderRadius: '20px', fontWeight: 600, whiteSpace: 'nowrap',
                          }}
                        >
                          Sin producto asociado
                        </span>
                      )}
                    </label>
                  ))}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '14px', paddingTop: '14px', borderTop: '1px solid #F0DAD3' }}>
                  <span style={{ fontSize: '.82rem', color: '#8A6A66' }}>
                    {cantidadSeleccionada} receta{cantidadSeleccionada === 1 ? '' : 's'} seleccionada{cantidadSeleccionada === 1 ? '' : 's'}
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn-secundario" onClick={cerrarModalImprimir} disabled={generandoPdf}>
                      Cancelar
                    </button>
                    <button className="btn-primario" onClick={handleGenerarPdf} disabled={generandoPdf || cantidadSeleccionada === 0}>
                      {generandoPdf ? 'Generando...' : '📄 Generar PDF'}
                    </button>
                  </div>
                </div>

                <p className="ayuda-vigencia" style={{ marginTop: '10px' }}>
                  💡 Las recetas marcadas "Sin producto asociado" no están vinculadas a ningún producto de la carta.
                  Si un ingrediente no tiene costo vigente, en el PDF aparece como "Sin costo cargado" y el total de esa
                  receta queda marcado como incompleto.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// SUBCOMPONENTE: Detalle de receta (cabecera + ingredientes)
// ============================================================
function DetalleReceta({ receta, recetasExistentes, onVolver }) {
  const { mostrarToast, confirmar } = useNotificaciones()
  const [descripcion, setDescripcion] = useState(receta.descripcion)
  const [fechaInicio, setFechaInicio] = useState(receta.fecha_inicio?.slice(0, 10) || '')
  const [fechaFin, setFechaFin] = useState(receta.fecha_fin?.slice(0, 10) || '3000-12-31')
  const [guardando, setGuardando] = useState(false)
  const [idRecetaActual, setIdRecetaActual] = useState(receta.id_receta)

  const [ingredientes, setIngredientes] = useState([])
  const [cargandoIngredientes, setCargandoIngredientes] = useState(true)

  const [materiasPrimas, setMateriasPrimas] = useState([])
  const [textoBuscarMateria, setTextoBuscarMateria] = useState('')
  const [materiaParaAgregar, setMateriaParaAgregar] = useState(null)
  const [cantidadIngrediente, setCantidadIngrediente] = useState('')

  const [costoVigenteMateria, setCostoVigenteMateria] = useState(null)
  const [buscandoCosto, setBuscandoCosto] = useState(false)

  const [costoTotal, setCostoTotal] = useState(0)
  const [calculandoCosto, setCalculandoCosto] = useState(false)

  const [rendimientos, setRendimientos] = useState([])
  const [descripcionRend, setDescripcionRend] = useState('')
  const [unidadesRend, setUnidadesRend] = useState('')
  const [editandoRendId, setEditandoRendId] = useState(null)
  const [guardandoRend, setGuardandoRend] = useState(false)

  useEffect(() => {
    cargarMateriasPrimas()
    if (idRecetaActual) {
      cargarIngredientes()
      cargarRendimientos()
    } else {
      setCargandoIngredientes(false)
    }
  }, [])

  useEffect(() => {
    calcularCostoTotal()
  }, [ingredientes])

  function normalizar(texto) {
    return texto
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  }

  async function cargarMateriasPrimas() {
    const { data } = await supabase.from('materias_primas').select('*').order('descripcion')
    setMateriasPrimas(data || [])
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

  function extraerCantidadPresentacion(presentacion) {
    const match = presentacion.match(/[\d.,]+/)
    if (!match) return null
    return parseFloat(match[0].replace(',', '.'))
  }

  async function cargarIngredientes() {
    setCargandoIngredientes(true)
    const { data, error } = await supabase
      .from('detalle_receta')
      .select('*, materias_primas(descripcion)')
      .eq('id_receta', idRecetaActual)
      .order('secuencia', { ascending: true })

    if (!error) {
      const conCosto = await Promise.all(
        data.map(async (ing) => {
          const costo = await obtenerCostoVigente(ing.id_materia_prima)
          let costoCalculado = null
          if (costo) {
            const cantidadPresentacion = extraerCantidadPresentacion(costo.presentacion)
            if (cantidadPresentacion && cantidadPresentacion > 0) {
              const precioUnitario = parseFloat(costo.precio) / cantidadPresentacion
              costoCalculado = precioUnitario * parseFloat(ing.cantidad)
            }
          }
          return {
            ...ing,
            presentacion_vigente: costo ? costo.presentacion : null,
            costo_calculado: costoCalculado,
          }
        })
      )
      setIngredientes(conCosto)
    }
    setCargandoIngredientes(false)
  }

  async function calcularCostoTotal() {
    if (ingredientes.length === 0) {
      setCostoTotal(0)
      return
    }

    setCalculandoCosto(true)
    let total = 0

    for (const ing of ingredientes) {
      const costo = await obtenerCostoVigente(ing.id_materia_prima)
      if (costo) {
        const cantidadPresentacion = extraerCantidadPresentacion(costo.presentacion)
        if (cantidadPresentacion && cantidadPresentacion > 0) {
          const precioUnitario = parseFloat(costo.precio) / cantidadPresentacion
          total += precioUnitario * parseFloat(ing.cantidad)
        }
      }
    }

    setCostoTotal(total)
    setCalculandoCosto(false)
  }

  async function cargarRendimientos(id = idRecetaActual) {
    const { data, error } = await supabase
      .from('rendimientos')
      .select('*')
      .eq('id_receta', id)
      .order('cantidad_unidades', { ascending: true })

    if (!error) setRendimientos(data || [])
  }

  function iniciarEdicionRendimiento(rend) {
    setEditandoRendId(rend.id_rendimiento)
    setDescripcionRend(rend.descripcion)
    setUnidadesRend(String(rend.cantidad_unidades))
  }

  function cancelarEdicionRendimiento() {
    setEditandoRendId(null)
    setDescripcionRend('')
    setUnidadesRend('')
  }

  async function guardarRendimiento() {
    const unidades = parseFloat(unidadesRend)
    if (!descripcionRend.trim() || isNaN(unidades) || unidades <= 0) {
      mostrarToast('Cargá la descripción del rendimiento y una cantidad de unidades mayor a cero', 'error')
      return
    }

    setGuardandoRend(true)

    if (editandoRendId) {
      const { error } = await supabase
        .from('rendimientos')
        .update({ descripcion: descripcionRend.trim(), cantidad_unidades: unidades })
        .eq('id_rendimiento', editandoRendId)
      if (error) mostrarToast('Error al actualizar el rendimiento: ' + error.message, 'error')
    } else {
      const { error } = await supabase
        .from('rendimientos')
        .insert({ id_receta: idRecetaActual, descripcion: descripcionRend.trim(), cantidad_unidades: unidades })
      if (error) mostrarToast('Error al agregar el rendimiento: ' + error.message, 'error')
    }

    setGuardandoRend(false)
    cancelarEdicionRendimiento()
    cargarRendimientos()
  }

  async function eliminarRendimiento(idRendimiento) {
    const { data: productosUsando } = await supabase
      .from('productos')
      .select('descripcion')
      .eq('id_rendimiento', idRendimiento)

    if (productosUsando && productosUsando.length > 0) {
      mostrarToast(
        'No se puede eliminar: este rendimiento lo usan ' +
          productosUsando.length +
          ' producto(s): ' +
          productosUsando.map((p) => p.descripcion).join(', '),
        'error'
      )
      return
    }

    const confirmado = await confirmar('¿Eliminar este rendimiento?')
    if (!confirmado) return

    const { error } = await supabase.from('rendimientos').delete().eq('id_rendimiento', idRendimiento)
    if (error) {
      mostrarToast('Error al eliminar el rendimiento: ' + error.message, 'error')
    } else {
      cargarRendimientos()
    }
  }

  const materiasFiltradas = textoBuscarMateria.trim()
    ? materiasPrimas.filter((m) => normalizar(m.descripcion).includes(normalizar(textoBuscarMateria)))
    : []

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

  async function guardarCabecera() {
    if (!descripcion.trim() || !fechaInicio) {
      mostrarToast('Descripción y fecha de inicio son obligatorios', 'error')
      return null
    }

    const finEfectivo = fechaFin || '3000-12-31'

    if (new Date(fechaInicio) > new Date(finEfectivo)) {
      mostrarToast('La fecha de inicio no puede ser posterior a la fecha de fin', 'error')
      return null
    }

    const mismosDescripcion = recetasExistentes.filter(
      (r) => normalizar(r.descripcion) === normalizar(descripcion) && r.id_receta !== idRecetaActual
    )

    const conflictivos = mismosDescripcion.filter((r) =>
      haySuperposicion(fechaInicio, finEfectivo, r.fecha_inicio, r.fecha_fin)
    )

    const ajustables = []
    const noAjustables = []
    for (const r of conflictivos) {
      if (new Date(r.fecha_inicio).getTime() < new Date(fechaInicio).getTime()) {
        ajustables.push(r)
      } else {
        noAjustables.push(r)
      }
    }

    if (noAjustables.length > 0) {
      mostrarToast('Hay un conflicto de vigencia con otra versión de esta receta que no se puede resolver automáticamente. Revisá las fechas.', 'error')
      return null
    }

    setGuardando(true)

    for (const r of ajustables) {
      await supabase
        .from('recetas')
        .update({ fecha_fin: restarUnDia(fechaInicio) })
        .eq('id_receta', r.id_receta)
    }

    const registro = {
      descripcion,
      fecha_inicio: fechaInicio,
      fecha_fin: finEfectivo,
    }

    let idResultante = idRecetaActual

    if (idRecetaActual) {
      const { error } = await supabase.from('recetas').update(registro).eq('id_receta', idRecetaActual)
      if (error) {
        mostrarToast('Error al guardar: ' + error.message, 'error')
        setGuardando(false)
        return null
      }
    } else {
      const { data, error } = await supabase.from('recetas').insert(registro).select().single()
      if (error) {
        mostrarToast('Error al guardar: ' + error.message, 'error')
        setGuardando(false)
        return null
      }
      idResultante = data.id_receta

      // Si esta receta nueva es una versión de otra (misma descripción, vigencia
      // ajustada), copiarle los rendimientos de la versión anterior más reciente
      // para no tener que recargarlos a mano.
      if (ajustables.length > 0) {
        const anterior = ajustables.reduce((a, b) =>
          new Date(a.fecha_inicio) > new Date(b.fecha_inicio) ? a : b
        )
        const { data: rendsAnteriores } = await supabase
          .from('rendimientos')
          .select('descripcion, cantidad_unidades')
          .eq('id_receta', anterior.id_receta)

        if (rendsAnteriores && rendsAnteriores.length > 0) {
          await supabase.from('rendimientos').insert(
            rendsAnteriores.map((r) => ({ ...r, id_receta: idResultante }))
          )
        }
      }
    }

    setGuardando(false)
    return idResultante
  }

  async function handleGuardarCabecera() {
    const esNueva = !idRecetaActual
    const id = await guardarCabecera()
    if (id) {
      mostrarToast('Receta guardada correctamente')
      if (esNueva) {
        setIdRecetaActual(id)
        setCargandoIngredientes(true)
        cargarIngredientes()
        cargarRendimientos(id)
      }
    }
  }

  async function seleccionarMateria(materia) {
    setMateriaParaAgregar(materia)
    setTextoBuscarMateria(materia.descripcion)
    setBuscandoCosto(true)
    setCostoVigenteMateria(null)

    const costo = await obtenerCostoVigente(materia.id_materia_prima)
    setCostoVigenteMateria(costo)
    setBuscandoCosto(false)
  }

  async function agregarIngrediente() {
    if (!idRecetaActual) {
      mostrarToast('Primero guardá los datos generales de la receta antes de agregar ingredientes', 'error')
      return
    }
    if (!materiaParaAgregar || !cantidadIngrediente) {
      mostrarToast('Seleccioná una materia prima e indicá la cantidad', 'error')
      return
    }
    if (!costoVigenteMateria) {
      mostrarToast('Esta materia prima no tiene un costo vigente cargado. Cargá su costo antes de usarla en una receta.', 'error')
      return
    }

    const yaExiste = ingredientes.find((i) => i.id_materia_prima === materiaParaAgregar.id_materia_prima)
    if (yaExiste) {
      mostrarToast('Esa materia prima ya está agregada a la receta. Editá la cantidad si es necesario.', 'error')
      return
    }

    const siguienteSecuencia = ingredientes.length > 0 ? Math.max(...ingredientes.map((i) => i.secuencia)) + 1 : 1

    const { error } = await supabase.from('detalle_receta').insert({
      id_receta: idRecetaActual,
      id_materia_prima: materiaParaAgregar.id_materia_prima,
      secuencia: siguienteSecuencia,
      cantidad: parseFloat(cantidadIngrediente),
      unidad_medida: costoVigenteMateria.unidad_medida,
    })

    if (error) {
      mostrarToast('Error al agregar ingrediente: ' + error.message, 'error')
    } else {
      setMateriaParaAgregar(null)
      setTextoBuscarMateria('')
      setCantidadIngrediente('')
      setCostoVigenteMateria(null)
      cargarIngredientes()
    }
  }

  async function quitarIngrediente(idMateriaPrima, secuencia) {
    const confirmado = await confirmar('¿Quitar este ingrediente de la receta?')
    if (!confirmado) return

    const { error } = await supabase
      .from('detalle_receta')
      .delete()
      .eq('id_receta', idRecetaActual)
      .eq('id_materia_prima', idMateriaPrima)
      .eq('secuencia', secuencia)

    if (error) {
      mostrarToast('Error al quitar ingrediente: ' + error.message, 'error')
    } else {
      cargarIngredientes()
    }
  }

  return (
    <div className="modulo modulo-compacto">
      <div className="detalle-cabecera-compacta">
        <button className="btn-volver" onClick={onVolver} style={{ marginBottom: 0 }}>← Volver a Recetas</button>
        <h2>{idRecetaActual ? (descripcion || 'Editar Receta') : 'Nueva Receta'}</h2>
        {idRecetaActual && <span className="id-badge">ID {idRecetaActual}</span>}
      </div>

      <div className="detalle-dos-columnas">
        <aside className="detalle-sidebar">
          <div className="rotulo-grupo">Datos generales</div>
          <div className="campos-apilados">
            <div className="campo">
              <label>Descripción</label>
              <input
                type="text"
                placeholder="Ej: Torta de Chocolate"
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
            <button className="btn-primario" onClick={handleGuardarCabecera} disabled={guardando} style={{ width: '100%' }}>
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
          </div>

          {idRecetaActual && (
            <>
              <hr className="separador" />
              <div className="rotulo-grupo">Costo</div>
              {calculandoCosto ? (
                <p style={{ fontSize: 12.5, color: '#8A6A66' }}>Calculando costo...</p>
              ) : (
                <div className="simulador-compacto">
                  <div className="sim-fila sim-total"><span>Total receta</span><span>${costoTotal.toFixed(2)}</span></div>
                </div>
              )}
            </>
          )}
        </aside>

        <div className="detalle-principal">
          {idRecetaActual ? (
            <>
              <div className="rotulo-grupo">Rendimientos</div>
              {rendimientos.length === 0 && (
                <p className="aviso-similar" style={{ fontSize: 12, padding: '7px 12px', marginBottom: 8 }}>
                  ⚠️ Cargá al menos un rendimiento para poder crear productos con esta receta.
                </p>
              )}
              <div className="formulario" style={{ marginBottom: 10 }}>
                <input
                  type="text"
                  placeholder="Descripción (ej: 2 unidades de 22 cm)"
                  value={descripcionRend}
                  onChange={(e) => setDescripcionRend(e.target.value)}
                  style={{ flex: 2 }}
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Unidades"
                  value={unidadesRend}
                  onChange={(e) => setUnidadesRend(e.target.value)}
                  style={{ maxWidth: '110px' }}
                />
                <button className="btn-primario" onClick={guardarRendimiento} disabled={guardandoRend}>
                  {guardandoRend ? '...' : editandoRendId ? 'Actualizar' : '+ Agregar'}
                </button>
                {editandoRendId && (
                  <button className="btn-secundario" type="button" onClick={cancelarEdicionRendimiento}>
                    Cancelar
                  </button>
                )}
              </div>
              {rendimientos.length > 0 && (
                <div className="tabla-wrapper" style={{ marginBottom: 14 }}>
                  <table className="tabla tabla-compacta">
                    <thead>
                      <tr>
                        <th>Descripción</th>
                        <th>Unidades</th>
                        <th>Costo por unidad</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rendimientos.map((rend) => (
                        <tr key={rend.id_rendimiento}>
                          <td>{rend.descripcion}</td>
                          <td>{parseFloat(rend.cantidad_unidades)}</td>
                          <td>
                            {costoTotal > 0
                              ? `$${(costoTotal / parseFloat(rend.cantidad_unidades)).toFixed(2)}`
                              : '—'}
                          </td>
                          <td>
                            <button className="icono-accion" title="Editar" onClick={() => iniciarEdicionRendimiento(rend)}>✏️</button>
                            <button className="icono-accion" title="Eliminar" onClick={() => eliminarRendimiento(rend.id_rendimiento)}>🗑️</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <hr className="separador" style={{ margin: '4px 0 12px' }} />

              <div className="rotulo-grupo">Ingredientes</div>
              <div className="formulario">
                <div style={{ position: 'relative', flex: 2 }}>
                  <input
                    type="text"
                    placeholder="🔎 Buscar materia prima..."
                    value={textoBuscarMateria}
                    onChange={(e) => {
                      setTextoBuscarMateria(e.target.value)
                      setMateriaParaAgregar(null)
                      setCostoVigenteMateria(null)
                    }}
                  />
                  {textoBuscarMateria && !materiaParaAgregar && materiasFiltradas.length > 0 && (
                    <div className="dropdown-resultados">
                      {materiasFiltradas.map((m) => (
                        <div
                          key={m.id_materia_prima}
                          className="dropdown-item"
                          onClick={() => seleccionarMateria(m)}
                        >
                          {m.descripcion}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <input
                  type="number"
                  step="0.01"
                  placeholder="Cantidad"
                  value={cantidadIngrediente}
                  onChange={(e) => setCantidadIngrediente(e.target.value)}
                  style={{ maxWidth: '120px' }}
                />

                <div className="unidad-fija">
                  {buscandoCosto && '...'}
                  {!buscandoCosto && materiaParaAgregar && costoVigenteMateria && (
                    <span className="badge-unidad">{costoVigenteMateria.unidad_medida}</span>
                  )}
                  {!buscandoCosto && materiaParaAgregar && !costoVigenteMateria && (
                    <span className="badge-unidad badge-error">Sin costo vigente</span>
                  )}
                  {!materiaParaAgregar && <span className="badge-unidad badge-vacio">Unidad</span>}
                </div>

                <button className="btn-primario" onClick={agregarIngrediente}>
                  + Agregar
                </button>
              </div>

              {cargandoIngredientes && <p>Cargando ingredientes...</p>}

              {!cargandoIngredientes && (
                <div className="tabla-wrapper">
                  <table className="tabla tabla-compacta">
                    <thead>
                      <tr>
                        <th>Materia Prima</th>
                        <th>Cantidad</th>
                        <th>Unidad</th>
                        <th>Presentación</th>
                        <th>Costo</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ingredientes.length === 0 && (
                        <tr>
                          <td colSpan="6">Todavía no agregaste ingredientes.</td>
                        </tr>
                      )}
                      {ingredientes.map((ing) => (
                        <tr key={`${ing.id_materia_prima}-${ing.secuencia}`}>
                          <td>{ing.materias_primas?.descripcion || ing.id_materia_prima}</td>
                          <td>{ing.cantidad}</td>
                          <td>{ing.unidad_medida}</td>
                          <td>{ing.presentacion_vigente || <span className="badge-error-texto">Sin costo vigente</span>}</td>
                          <td>{ing.costo_calculado !== null ? `$${ing.costo_calculado.toFixed(2)}` : '—'}</td>
                          <td>
                            <button
                              className="icono-accion"
                              title="Quitar"
                              onClick={() => quitarIngrediente(ing.id_materia_prima, ing.secuencia)}
                            >
                              🗑️
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <p style={{ color: '#8A6A66', fontSize: 13 }}>Guardá primero los datos generales para poder agregar ingredientes.</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default Recetas
