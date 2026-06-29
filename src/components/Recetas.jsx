import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function Recetas() {
  const [recetas, setRecetas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const [vista, setVista] = useState('lista')
  const [recetaActual, setRecetaActual] = useState(null)

  const [textoBusqueda, setTextoBusqueda] = useState('')

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
      .select('*')
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
      cantidad_producto_final: 1,
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
    const confirmar = window.confirm('¿Seguro que querés eliminar esta receta? También se eliminarán sus ingredientes.')
    if (!confirmar) return

    const { error: errorDetalle } = await supabase
      .from('detalle_receta')
      .delete()
      .eq('id_receta', id)

    if (errorDetalle) {
      alert('Error al eliminar ingredientes de la receta: ' + errorDetalle.message)
      return
    }

    const { error } = await supabase
      .from('recetas')
      .delete()
      .eq('id_receta', id)

    if (error) {
      alert('No se pudo eliminar la receta. Puede estar usada en algún producto.\n\nDetalle: ' + error.message)
    } else {
      cargarRecetas()
    }
  }

  const recetasFiltradas = textoBusqueda.trim()
    ? recetas.filter((r) => normalizar(r.descripcion).includes(normalizar(textoBusqueda)))
    : recetas

  function formatearFecha(fecha) {
    if (!fecha) return ''
    return new Date(fecha + 'T00:00:00').toLocaleDateString
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
    <div className="modulo">
      <h2>Recetas</h2>

      <div className="acciones-superiores">
        <button className="btn-primario" onClick={iniciarNueva}>
          + Nueva Receta
        </button>
      </div>

      <div className="campo-buscador">
        <input
          type="text"
          placeholder="🔎 Buscar receta..."
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
              <th>Cant. Producto Final</th>
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
                <td>{r.cantidad_producto_final}</td>
                <td>
                  {formatearFecha(r.fecha_inicio)} —{' '}
                  {r.fecha_fin?.slice(0, 10) === '3000-12-31' ? 'Indefinida' : formatearFecha(r.fecha_fin)}
                </td>
                <td>
                  <button className="btn-link" onClick={() => abrirReceta(r)}>
                    Ver / Editar
                  </button>
                  <button className="btn-link btn-eliminar" onClick={() => eliminarReceta(r.id_receta)}>
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
// SUBCOMPONENTE: Detalle de receta (cabecera + ingredientes)
// ============================================================
function DetalleReceta({ receta, recetasExistentes, onVolver }) {
  const [descripcion, setDescripcion] = useState(receta.descripcion)
  const [cantidadFinal, setCantidadFinal] = useState(receta.cantidad_producto_final)
  const [fechaInicio, setFechaInicio] = useState(receta.fecha_inicio?.slice(0, 10) || '')
  const [fechaFin, setFechaFin] = useState(receta.fecha_fin?.slice(0, 10) || '3000-12-31')
  const [guardando, setGuardando] = useState(false)

  const [ingredientes, setIngredientes] = useState([])
  const [cargandoIngredientes, setCargandoIngredientes] = useState(true)

  const [materiasPrimas, setMateriasPrimas] = useState([])
  const [textoBuscarMateria, setTextoBuscarMateria] = useState('')
  const [materiaParaAgregar, setMateriaParaAgregar] = useState(null)
  const [cantidadIngrediente, setCantidadIngrediente] = useState('')

  // Unidad y costo vigente de la materia prima seleccionada (NO editable, viene de costos)
  const [costoVigenteMateria, setCostoVigenteMateria] = useState(null)
  const [buscandoCosto, setBuscandoCosto] = useState(false)

  const [costoTotal, setCostoTotal] = useState(0)
  const [calculandoCosto, setCalculandoCosto] = useState(false)

  useEffect(() => {
    cargarMateriasPrimas()
    if (receta.id_receta) {
      cargarIngredientes()
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

  // Trae el costo vigente (hoy) de una materia prima específica
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

  // Extrae la cantidad numérica de la presentación, ej: "25000 Gramos" -> 25000
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
      .eq('id_receta', receta.id_receta)
      .order('secuencia', { ascending: true })

    if (!error) {
      // Para cada ingrediente, buscamos su costo vigente HOY para mostrar presentación y costo calculado
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

  // Calcula el costo total de la receta sumando cada ingrediente
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
    if (!descripcion.trim() || !cantidadFinal || !fechaInicio) {
      alert('Descripción, cantidad de producto final y fecha de inicio son obligatorios')
      return null
    }

    const finEfectivo = fechaFin || '3000-12-31'

    if (new Date(fechaInicio) > new Date(finEfectivo)) {
      alert('La fecha de inicio no puede ser posterior a la fecha de fin')
      return null
    }

    const mismosDescripcion = recetasExistentes.filter(
      (r) => normalizar(r.descripcion) === normalizar(descripcion) && r.id_receta !== receta.id_receta
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
      alert('Hay un conflicto de vigencia con otra versión de esta receta que no se puede resolver automáticamente. Revisá las fechas.')
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
      cantidad_producto_final: parseFloat(cantidadFinal),
      fecha_inicio: fechaInicio,
      fecha_fin: finEfectivo,
    }

    let idResultante = receta.id_receta

    if (receta.id_receta) {
      const { error } = await supabase.from('recetas').update(registro).eq('id_receta', receta.id_receta)
      if (error) {
        alert('Error al guardar: ' + error.message)
        setGuardando(false)
        return null
      }
    } else {
      const { data, error } = await supabase.from('recetas').insert(registro).select().single()
      if (error) {
        alert('Error al guardar: ' + error.message)
        setGuardando(false)
        return null
      }
      idResultante = data.id_receta
    }

    setGuardando(false)
    return idResultante
  }

  async function handleGuardarCabecera() {
    const id = await guardarCabecera()
    if (id) {
      alert('Receta guardada correctamente')
      if (!receta.id_receta) {
        receta.id_receta = id
        window.location.reload()
      }
    }
  }

  // Cuando se selecciona una materia prima del buscador, vamos a buscar su costo vigente
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
    if (!receta.id_receta) {
      alert('Primero guardá los datos generales de la receta antes de agregar ingredientes')
      return
    }
    if (!materiaParaAgregar || !cantidadIngrediente) {
      alert('Seleccioná una materia prima e indicá la cantidad')
      return
    }
    if (!costoVigenteMateria) {
      alert('Esta materia prima no tiene un costo vigente cargado. Cargá su costo antes de usarla en una receta.')
      return
    }

    const yaExiste = ingredientes.find((i) => i.id_materia_prima === materiaParaAgregar.id_materia_prima)
    if (yaExiste) {
      alert('Esa materia prima ya está agregada a la receta. Editá la cantidad si es necesario.')
      return
    }

    const siguienteSecuencia = ingredientes.length > 0 ? Math.max(...ingredientes.map((i) => i.secuencia)) + 1 : 1

    const { error } = await supabase.from('detalle_receta').insert({
      id_receta: receta.id_receta,
      id_materia_prima: materiaParaAgregar.id_materia_prima,
      secuencia: siguienteSecuencia,
      cantidad: parseFloat(cantidadIngrediente),
      unidad_medida: costoVigenteMateria.unidad_medida, // se toma directo del costo vigente
    })

    if (error) {
      alert('Error al agregar ingrediente: ' + error.message)
    } else {
      setMateriaParaAgregar(null)
      setTextoBuscarMateria('')
      setCantidadIngrediente('')
      setCostoVigenteMateria(null)
      cargarIngredientes()
    }
  }

  async function quitarIngrediente(idMateriaPrima, secuencia) {
    const confirmar = window.confirm('¿Quitar este ingrediente de la receta?')
    if (!confirmar) return

    const { error } = await supabase
      .from('detalle_receta')
      .delete()
      .eq('id_receta', receta.id_receta)
      .eq('id_materia_prima', idMateriaPrima)
      .eq('secuencia', secuencia)

    if (error) {
      alert('Error al quitar ingrediente: ' + error.message)
    } else {
      cargarIngredientes()
    }
  }

  return (
    <div className="modulo">
      <button className="btn-volver" onClick={onVolver}>
        ← Volver a Recetas
      </button>

      <h2>{receta.id_receta ? 'Editar Receta' : 'Nueva Receta'}</h2>

      <div className="subseccion">
        <h3>Datos generales</h3>
        <div className="formulario formulario-costos">
          <div className="campo" style={{ flex: 2 }}>
            <label>Descripción</label>
            <input
              type="text"
              placeholder="Ej: Torta de Chocolate"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </div>
          <div className="campo">
            <label>Cantidad producto final</label>
            <input
              type="number"
              step="0.01"
              placeholder="Ej: 1 o 20"
              value={cantidadFinal}
              onChange={(e) => setCantidadFinal(e.target.value)}
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
          <div className="campo-acciones">
            <button className="btn-primario" onClick={handleGuardarCabecera} disabled={guardando}>
              {guardando ? 'Guardando...' : 'Guardar datos generales'}
            </button>
          </div>
        </div>
      </div>

      {receta.id_receta && (
        <div className="subseccion">
          <h3>Ingredientes</h3>

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

            {/* Unidad de medida: NO editable, viene del costo vigente */}
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
            <table className="tabla">
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
                        className="btn-link btn-eliminar"
                        onClick={() => quitarIngrediente(ing.id_materia_prima, ing.secuencia)}
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>            </table>
          )}

          <div className="costo-total">
            {calculandoCosto ? (
              'Calculando costo...'
            ) : (
              <>
                💰 Costo total de la receta: <strong>${costoTotal.toFixed(2)}</strong>
                {cantidadFinal > 0 && (
                  <span> &nbsp;|&nbsp; Costo por unidad: <strong>${(costoTotal / cantidadFinal).toFixed(2)}</strong></span>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default Recetas