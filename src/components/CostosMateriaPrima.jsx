import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function CostosMateriaPrima({ materiaPrima, onVolver }) {
  const [costos, setCostos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)

  const [editandoId, setEditandoId] = useState(null)
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('3000-12-31')
  const [presentacion, setPresentacion] = useState('')
  const [unidadMedida, setUnidadMedida] = useState('Gramos')
  const [precio, setPrecio] = useState('')

  useEffect(() => {
    cargarCostos()
  }, [])

  async function cargarCostos() {
    setCargando(true)
    setError(null)
    const { data, error } = await supabase
      .from('costos_materia_prima')
      .select('*')
      .eq('id_materia_prima', materiaPrima.id_materia_prima)
      .order('fecha_inicio', { ascending: false })

    if (error) {
      setError('Error al cargar los costos: ' + error.message)
    } else {
      setCostos(data)
    }
    setCargando(false)
  }

  function limpiarFormulario() {
    setEditandoId(null)
    setFechaInicio('')
    setFechaFin('3000-12-31')
    setPresentacion('')
    setUnidadMedida('Gramos')
    setPrecio('')
  }

  function iniciarEdicion(costo) {
    setEditandoId(costo.id_costo)
    setFechaInicio(costo.fecha_inicio?.slice(0, 10) || '')
    setFechaFin(costo.fecha_fin?.slice(0, 10) || '3000-12-31')
    setPresentacion(costo.presentacion)
    setUnidadMedida(costo.unidad_medida)
    setPrecio(costo.precio)
  }

  function haySuperposicion(inicioA, finA, inicioB, finB) {
    const iA = new Date(inicioA).getTime()
    const fA = new Date(finA).getTime()
    const iB = new Date(inicioB).getTime()
    const fB = new Date(finB).getTime()
    return iA <= fB && fA >= iB
  }

  // Resta un día a una fecha (formato YYYY-MM-DD) y devuelve string YYYY-MM-DD
  function restarUnDia(fechaStr) {
    const f = new Date(fechaStr + 'T00:00:00')
    f.setDate(f.getDate() - 1)
    return f.toISOString().slice(0, 10)
  }

  function formatearFecha(fecha) {
    if (!fecha) return ''
    const f = new Date(fecha)
    return f.toLocaleDateString('es-AR')
  }

  async function guardar(e) {
    e.preventDefault()

    if (!fechaInicio || !presentacion.trim() || !precio) {
      alert('Fecha de inicio, presentación y precio son obligatorios')
      return
    }

    const finEfectivo = fechaFin || '3000-12-31'

    if (new Date(fechaInicio) > new Date(finEfectivo)) {
      alert('La fecha de inicio no puede ser posterior a la fecha de fin')
      return
    }

    // Buscamos todos los registros (excepto el que estoy editando) que se superponen
    const conflictivos = costos.filter((c) => {
      if (editandoId && c.id_costo === editandoId) return false
      return haySuperposicion(fechaInicio, finEfectivo, c.fecha_inicio, c.fecha_fin)
    })

    // Separamos: los que pueden "cerrarse" automáticamente vs los que generan ambigüedad
    const ajustables = []
    const noAjustables = []

    for (const c of conflictivos) {
      const inicioExistente = new Date(c.fecha_inicio).getTime()
      const inicioNuevo = new Date(fechaInicio).getTime()

      if (inicioExistente < inicioNuevo) {
        // El existente empezó antes que el nuevo → se puede cerrar un día antes
        ajustables.push(c)
      } else {
        // El existente empieza igual o después que el nuevo → ambigüedad, no se puede resolver solo
        noAjustables.push(c)
      }
    }

    if (noAjustables.length > 0) {
      const detalle = noAjustables
        .map((c) => `• ${c.presentacion} ($${c.precio}) vigente desde ${formatearFecha(c.fecha_inicio)} hasta ${formatearFecha(c.fecha_fin)}`)
        .join('\n')
      alert(
        `No se puede guardar automáticamente: hay un conflicto de fechas que no se puede resolver solo.\n\n${detalle}\n\n` +
        `Editá o eliminá ese registro primero.`
      )
      return
    }

    setGuardando(true)

    // Cerramos automáticamente los registros ajustables
    for (const c of ajustables) {
      const nuevaFechaFin = restarUnDia(fechaInicio)
      const { error: errorUpdate } = await supabase
        .from('costos_materia_prima')
        .update({ fecha_fin: nuevaFechaFin })
        .eq('id_costo', c.id_costo)

      if (errorUpdate) {
        alert('Error al cerrar la vigencia del costo anterior: ' + errorUpdate.message)
        setGuardando(false)
        return
      }
    }

    const registro = {
      id_materia_prima: materiaPrima.id_materia_prima,
      fecha_inicio: fechaInicio,
      fecha_fin: finEfectivo,
      presentacion,
      unidad_medida: unidadMedida,
      precio: parseFloat(precio),
    }

    let resultado
    if (editandoId) {
      resultado = await supabase
        .from('costos_materia_prima')
        .update(registro)
        .eq('id_costo', editandoId)
    } else {
      resultado = await supabase
        .from('costos_materia_prima')
        .insert(registro)
    }

    if (resultado.error) {
      alert('Error al guardar: ' + resultado.error.message)
    } else {
      const avisoAjuste = ajustables.length > 0
        ? `\n\nSe actualizó automáticamente la vigencia de ${ajustables.length} registro(s) anterior(es).`
        : ''
      if (avisoAjuste) alert('Costo guardado correctamente.' + avisoAjuste)
      limpiarFormulario()
      cargarCostos()
    }

    setGuardando(false)
  }

  async function eliminar(id) {
    const confirmar = window.confirm('¿Seguro que querés eliminar este registro de costo?')
    if (!confirmar) return

    const { error } = await supabase
      .from('costos_materia_prima')
      .delete()
      .eq('id_costo', id)

    if (error) {
      alert('No se pudo eliminar: ' + error.message)
    } else {
      cargarCostos()
    }
  }

  return (
    <div className="modulo">
      <button className="btn-volver" onClick={onVolver}>
        ← Volver a Materias Primas
      </button>

      <h2>Costos — {materiaPrima.descripcion}</h2>

      <p className="ayuda-vigencia">
        💡 Si cargás un costo nuevo con fecha posterior a uno vigente, el sistema cierra automáticamente la vigencia del anterior un día antes. Fecha fin en blanco = vigencia indefinida (31/12/3000).
      </p>

      <form className="formulario formulario-costos" onSubmit={guardar}>
        <div className="campo">
          <label>Fecha inicio</label>
          <input
            type="date"
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
          />
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
          <label>Presentación</label>
          <input
            type="text"
            placeholder="Ej: 1000 Gramos"
            value={presentacion}
            onChange={(e) => setPresentacion(e.target.value)}
          />
        </div>
        <div className="campo">
          <label>Unidad</label>
          <select value={unidadMedida} onChange={(e) => setUnidadMedida(e.target.value)}>
            <option value="Gramos">Gramos</option>
            <option value="Unidades">Unidades</option>
            <option value="Mililitros">Mililitros</option>
            <option value="Kilogramos">Kilogramos</option>
          </select>
        </div>
        <div className="campo">
          <label>Precio</label>
          <input
            type="number"
            step="0.01"
            placeholder="0.00"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
          />
        </div>

        <div className="campo-acciones">
          <button type="submit" className="btn-primario" disabled={guardando}>
            {guardando ? 'Guardando...' : editandoId ? 'Actualizar' : 'Agregar'}
          </button>
          {editandoId && (
            <button type="button" className="btn-secundario" onClick={limpiarFormulario}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      {cargando && <p>Cargando...</p>}
      {error && <p className="mensaje-error">{error}</p>}

      {!cargando && !error && (
        <table className="tabla">
          <thead>
            <tr>
              <th>Desde</th>
              <th>Hasta</th>
              <th>Presentación</th>
              <th>Unidad</th>
              <th>Precio</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {costos.length === 0 && (
              <tr>
                <td colSpan="6">No hay costos registrados para esta materia prima.</td>
              </tr>
            )}
            {costos.map((c) => (
              <tr key={c.id_costo}>
                <td>{formatearFecha(c.fecha_inicio)}</td>
                <td>{c.fecha_fin?.slice(0, 10) === '3000-12-31' ? 'Indefinida' : formatearFecha(c.fecha_fin)}</td>
                <td>{c.presentacion}</td>
                <td>{c.unidad_medida}</td>
                <td>${parseFloat(c.precio).toFixed(2)}</td>
                <td>
                  <button className="btn-link" onClick={() => iniciarEdicion(c)}>
                    Editar
                  </button>
                  <button className="btn-link btn-eliminar" onClick={() => eliminar(c.id_costo)}>
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

export default CostosMateriaPrima