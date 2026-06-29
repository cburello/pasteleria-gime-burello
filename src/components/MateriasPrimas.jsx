import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import CostosMateriaPrima from './CostosMateriaPrima'

function MateriasPrimas() {
  const [materias, setMaterias] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const [editandoId, setEditandoId] = useState(null)
  const [descripcion, setDescripcion] = useState('')
  const [guardando, setGuardando] = useState(false)

  const [materiaSeleccionada, setMateriaSeleccionada] = useState(null)

  // Búsqueda en la grilla (texto parcial)
  const [textoBusqueda, setTextoBusqueda] = useState('')

  // Resultado de "buscar similares" al cargar una nueva
  const [similaresEncontrados, setSimilaresEncontrados] = useState(null)
  const [yaVerificado, setYaVerificado] = useState(false)

  useEffect(() => {
    cargarMaterias()
  }, [])

  async function cargarMaterias() {
    setCargando(true)
    setError(null)
    const { data, error } = await supabase
      .from('materias_primas')
      .select('*')
      .order('id_materia_prima', { ascending: true })

    if (error) {
      setError('Error al cargar los datos: ' + error.message)
    } else {
      setMaterias(data)
    }
    setCargando(false)
  }

  function iniciarNuevo() {
    setEditandoId(null)
    setDescripcion('')
    setSimilaresEncontrados(null)
    setYaVerificado(false)
  }

  function iniciarEdicion(materia) {
    setEditandoId(materia.id_materia_prima)
    setDescripcion(materia.descripcion)
    setSimilaresEncontrados(null)
    setYaVerificado(true) // si está editando, no hace falta verificar duplicados
  }

  // Normaliza texto para comparar sin importar mayúsculas/espacios/acentos
  function normalizar(texto) {
    return texto
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  }

  async function buscarSimilares() {
    if (!descripcion.trim()) {
      alert('Escribí una descripción para buscar')
      return
    }

    const textoNormalizado = normalizar(descripcion)

    // Traemos todas y filtramos en el cliente por similitud simple (incluye substring)
    const { data, error } = await supabase
      .from('materias_primas')
      .select('*')

    if (error) {
      alert('Error al buscar: ' + error.message)
      return
    }

    const encontrados = data.filter((m) => {
      const desc = normalizar(m.descripcion)
      return desc.includes(textoNormalizado) || textoNormalizado.includes(desc)
    })

    setSimilaresEncontrados(encontrados)
    setYaVerificado(true)
  }

  async function guardar(e) {
    e.preventDefault()
    if (!descripcion.trim()) {
      alert('La descripción es obligatoria')
      return
    }

    setGuardando(true)

    if (editandoId) {
      const { error } = await supabase
        .from('materias_primas')
        .update({ descripcion })
        .eq('id_materia_prima', editandoId)

      if (error) alert('Error al actualizar: ' + error.message)
    } else {
      const { error } = await supabase
        .from('materias_primas')
        .insert({ descripcion })

      if (error) alert('Error al crear: ' + error.message)
    }

    setGuardando(false)
    setDescripcion('')
    setEditandoId(null)
    setSimilaresEncontrados(null)
    setYaVerificado(false)
    cargarMaterias()
  }

  async function eliminar(id) {
    const confirmar = window.confirm('¿Seguro que querés eliminar esta materia prima?')
    if (!confirmar) return

    const { error } = await supabase
      .from('materias_primas')
      .delete()
      .eq('id_materia_prima', id)

    if (error) {
      alert('No se pudo eliminar. Puede que esté siendo usada en alguna receta.\n\nDetalle: ' + error.message)
    } else {
      cargarMaterias()
    }
  }

  if (materiaSeleccionada) {
    return (
      <CostosMateriaPrima
        materiaPrima={materiaSeleccionada}
        onVolver={() => setMateriaSeleccionada(null)}
      />
    )
  }

  // Lista filtrada por el buscador de la grilla
  const materiasFiltradas = textoBusqueda.trim()
    ? materias.filter((m) =>
        normalizar(m.descripcion).includes(normalizar(textoBusqueda))
      )
    : materias

  // Si hay búsqueda de similares activa, esa lista tiene prioridad visual
  const listaAMostrar = similaresEncontrados !== null ? similaresEncontrados : materiasFiltradas

  return (
    <div className="modulo">
      <h2>Materias Primas</h2>

      {/* Formulario de alta/edición */}
      <form className="formulario" onSubmit={guardar}>
        <input
          type="text"
          placeholder="Descripción (ej: Harina 0000)"
          value={descripcion}
          onChange={(e) => {
            setDescripcion(e.target.value)
            setYaVerificado(false)
            setSimilaresEncontrados(null)
          }}
        />

        {!editandoId && (
          <button type="button" className="btn-secundario" onClick={buscarSimilares}>
            🔍 Buscar similares
          </button>
        )}

        <button
          type="submit"
          className="btn-primario"
          disabled={guardando || (!editandoId && !yaVerificado)}
          title={!editandoId && !yaVerificado ? 'Primero buscá similares' : ''}
        >
          {guardando ? 'Guardando...' : editandoId ? 'Actualizar' : 'Agregar'}
        </button>

        {(editandoId || descripcion) && (
          <button type="button" className="btn-secundario" onClick={iniciarNuevo}>
            Cancelar
          </button>
        )}
      </form>

      {/* Mensaje de resultado de la búsqueda de similares */}
      {similaresEncontrados !== null && (
        <div className={similaresEncontrados.length > 0 ? 'aviso-similar' : 'aviso-ok'}>
          {similaresEncontrados.length > 0
            ? `⚠️ Se encontraron ${similaresEncontrados.length} materia(s) prima(s) similares. Revisá la grilla antes de agregar una nueva.`
            : '✅ No se encontraron coincidencias. Podés agregarla con el botón "Agregar".'}
        </div>
      )}

      {/* Buscador de la grilla general */}
      <div className="campo-buscador">
        <input
          type="text"
          placeholder="🔎 Buscar en la lista..."
          value={textoBusqueda}
          onChange={(e) => {
            setTextoBusqueda(e.target.value)
            setSimilaresEncontrados(null)
          }}
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
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {listaAMostrar.length === 0 && (
                <tr>
                  <td colSpan="3">No se encontraron materias primas.</td>
                </tr>
              )}
              {listaAMostrar.map((m) => (
                <tr key={m.id_materia_prima} className={similaresEncontrados !== null ? 'fila-destacada' : ''}>
                  <td>{m.id_materia_prima}</td>
                  <td>{m.descripcion}</td>
                  <td>
                    <button className="btn-link" onClick={() => iniciarEdicion(m)}>
                      Editar
                    </button>
                    <button className="btn-link" onClick={() => setMateriaSeleccionada(m)}>
                      Ver costos
                    </button>
                    <button className="btn-link btn-eliminar" onClick={() => eliminar(m.id_materia_prima)}>
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

export default MateriasPrimas