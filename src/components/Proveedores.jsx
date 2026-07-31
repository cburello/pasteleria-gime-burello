import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNotificaciones } from '../hooks/useNotificaciones'

function Proveedores() {
  const { mostrarToast, confirmar } = useNotificaciones()
  const [proveedores, setProveedores] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const [editandoId, setEditandoId] = useState(null)
  const [descripcion, setDescripcion] = useState('')
  const [guardando, setGuardando] = useState(false)

  const [textoBusqueda, setTextoBusqueda] = useState('')

  useEffect(() => {
    cargarProveedores()
  }, [])

  function normalizar(texto) {
    return (texto || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  }

  async function cargarProveedores() {
    setCargando(true)
    setError(null)
    const { data, error } = await supabase
      .from('proveedores')
      .select('*')
      .order('descripcion', { ascending: true })

    if (error) {
      setError('Error al cargar los proveedores: ' + error.message)
    } else {
      setProveedores(data)
    }
    setCargando(false)
  }

  function iniciarNuevo() {
    setEditandoId(null)
    setDescripcion('')
  }

  function iniciarEdicion(proveedor) {
    setEditandoId(proveedor.id_proveedor)
    setDescripcion(proveedor.descripcion)
  }

  async function guardar(e) {
    e.preventDefault()
    if (!descripcion.trim()) {
      mostrarToast('La descripción es obligatoria', 'error')
      return
    }

    setGuardando(true)

    if (editandoId) {
      const { error } = await supabase
        .from('proveedores')
        .update({ descripcion })
        .eq('id_proveedor', editandoId)

      if (error) mostrarToast('Error al actualizar: ' + error.message, 'error')
    } else {
      const { error } = await supabase
        .from('proveedores')
        .insert({ descripcion })

      if (error) mostrarToast('Error al crear: ' + error.message, 'error')
    }

    setGuardando(false)
    setDescripcion('')
    setEditandoId(null)
    cargarProveedores()
  }

  async function eliminar(id) {
    const confirmado = await confirmar('¿Seguro que querés eliminar este proveedor?')
    if (!confirmado) return

    const { error } = await supabase
      .from('proveedores')
      .delete()
      .eq('id_proveedor', id)

    if (error) {
      mostrarToast('No se pudo eliminar. Puede que esté siendo usado en algún gasto. Detalle: ' + error.message, 'error')
    } else {
      cargarProveedores()
    }
  }

  const proveedoresFiltrados = textoBusqueda.trim()
    ? proveedores.filter((p) => normalizar(p.descripcion).includes(normalizar(textoBusqueda)))
    : proveedores

  return (
    <div className="modulo modulo-compacto">
      <div className="cabecera-lista">
        <h2>Proveedores</h2>
        <span className="contador">{proveedoresFiltrados.length}</span>
        <div className="buscador-inline">
          <input
            type="text"
            placeholder="🔎 Buscar proveedor..."
            value={textoBusqueda}
            onChange={(e) => setTextoBusqueda(e.target.value)}
          />
        </div>
      </div>

      <form className="formulario" onSubmit={guardar}>
        <input
          type="text"
          placeholder="Descripción (ej: Molino San Jorge)"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
        />
        <button type="submit" className="btn-primario" disabled={guardando}>
          {guardando ? 'Guardando...' : editandoId ? 'Actualizar' : 'Agregar'}
        </button>
        {editandoId && (
          <button type="button" className="btn-secundario" onClick={iniciarNuevo}>
            Cancelar
          </button>
        )}
      </form>

      {cargando && <p>Cargando...</p>}
      {error && <p className="mensaje-error">{error}</p>}

      {!cargando && !error && (
        <table className="tabla tabla-compacta">
          <thead>
            <tr>
              <th>ID</th>
              <th>Descripción</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {proveedoresFiltrados.length === 0 && (
              <tr>
                <td colSpan="3">No hay proveedores registrados.</td>
              </tr>
            )}
            {proveedoresFiltrados.map((p) => (
              <tr key={p.id_proveedor}>
                <td>{p.id_proveedor}</td>
                <td>{p.descripcion}</td>
                <td>
                  <button className="icono-accion" title="Editar" onClick={() => iniciarEdicion(p)}>✏️</button>
                  <button className="icono-accion" title="Eliminar" onClick={() => eliminar(p.id_proveedor)}>🗑️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default Proveedores