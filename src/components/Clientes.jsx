import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function Clientes() {
  const [clientes, setClientes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const [editandoId, setEditandoId] = useState(null)
  const [esAnonimo, setEsAnonimo] = useState(false)
  const [descripcion, setDescripcion] = useState('')
  const [domicilio, setDomicilio] = useState('')
  const [telefono, setTelefono] = useState('')
  const [guardando, setGuardando] = useState(false)

  const [textoBusqueda, setTextoBusqueda] = useState('')

  const [similaresEncontrados, setSimilaresEncontrados] = useState(null)
  const [yaVerificado, setYaVerificado] = useState(false)

  useEffect(() => {
    cargarClientes()
  }, [])

  function normalizar(texto) {
    return texto
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  }

  async function cargarClientes() {
    setCargando(true)
    setError(null)
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .order('id_cliente', { ascending: false })

    if (error) {
      setError('Error al cargar los clientes: ' + error.message)
    } else {
      setClientes(data)
    }
    setCargando(false)
  }

  function limpiarFormulario() {
    setEditandoId(null)
    setEsAnonimo(false)
    setDescripcion('')
    setDomicilio('')
    setTelefono('')
    setSimilaresEncontrados(null)
    setYaVerificado(false)
  }

  function iniciarEdicion(cliente) {
    setEditandoId(cliente.id_cliente)
    setEsAnonimo(cliente.cliente_anonimo === 'S')
    setDescripcion(cliente.descripcion || '')
    setDomicilio(cliente.domicilio || '')
    setTelefono(cliente.telefono || '')
    setSimilaresEncontrados(null)
    setYaVerificado(true)
  }

  async function buscarSimilares() {
    if (!descripcion.trim()) {
      alert('Escribí una descripción para buscar')
      return
    }

    const textoNormalizado = normalizar(descripcion)

    const { data, error } = await supabase.from('clientes').select('*').eq('cliente_anonimo', 'N')

    if (error) {
      alert('Error al buscar: ' + error.message)
      return
    }

    const encontrados = data.filter((c) => {
      const desc = normalizar(c.descripcion || '')
      return desc.includes(textoNormalizado) || textoNormalizado.includes(desc)
    })

    setSimilaresEncontrados(encontrados)
    setYaVerificado(true)
  }

  async function guardar(e) {
    e.preventDefault()

    if (esAnonimo) {
      // Cliente anónimo: no requiere datos adicionales
    } else {
      if (!descripcion.trim() || !domicilio.trim() || !telefono.trim()) {
        alert('Para un cliente identificado, descripción, domicilio y teléfono son obligatorios')
        return
      }
    }

    setGuardando(true)

    const registro = esAnonimo
      ? { cliente_anonimo: 'S', descripcion: null, domicilio: null, telefono: null }
      : { cliente_anonimo: 'N', descripcion, domicilio, telefono }

    if (editandoId) {
      const { cliente_anonimo, ...registroSinAnonimo } = registro
      const { error } = await supabase
        .from('clientes')
        .update(registroSinAnonimo)
        .eq('id_cliente', editandoId)

      if (error) alert('Error al actualizar: ' + error.message)
    } else {
      const { error } = await supabase.from('clientes').insert(registro)

      if (error) alert('Error al crear: ' + error.message)
    }

    setGuardando(false)
    limpiarFormulario()
    cargarClientes()
  }

  async function eliminar(id) {
    const confirmar = window.confirm('¿Seguro que querés eliminar este cliente?')
    if (!confirmar) return

    const { error } = await supabase.from('clientes').delete().eq('id_cliente', id)

    if (error) {
      alert('No se pudo eliminar. Puede que esté siendo usado en algún pedido.\n\nDetalle: ' + error.message)
    } else {
      cargarClientes()
    }
  }

  function descripcionVisible(cliente) {
    if (cliente.cliente_anonimo === 'S') return '— Cliente anónimo —'
    return cliente.descripcion
  }

  const clientesFiltrados = textoBusqueda.trim()
    ? clientes.filter((c) => normalizar(descripcionVisible(c)).includes(normalizar(textoBusqueda)))
    : clientes

  const listaAMostrar = similaresEncontrados !== null ? similaresEncontrados : clientesFiltrados

  return (
    <div className="modulo">
      <h2>Clientes</h2>

      <form className="formulario formulario-costos" onSubmit={guardar}>
        <div className="campo">
          <label>Tipo de cliente</label>
          <select
            value={esAnonimo ? 'S' : 'N'}
            onChange={(e) => {
              if (editandoId) return
              setEsAnonimo(e.target.value === 'S')
              setSimilaresEncontrados(null)
              setYaVerificado(false)
            }}
            disabled={!!editandoId}
          >
            <option value="N">Identificado</option>
            <option value="S">Anónimo</option>
          </select>
        </div>

        {!esAnonimo && (
          <>
            <div className="campo" style={{ flex: 2 }}>
              <label>Descripción / Nombre</label>
              <input
                type="text"
                placeholder="Ej: María García"
                value={descripcion}
                onChange={(e) => {
                  setDescripcion(e.target.value)
                  setYaVerificado(false)
                  setSimilaresEncontrados(null)
                }}
              />
            </div>
            <div className="campo">
              <label>Domicilio</label>
              <input
                type="text"
                placeholder="Ej: Av. Siempre Viva 123"
                value={domicilio}
                onChange={(e) => setDomicilio(e.target.value)}
              />
            </div>
            <div className="campo">
              <label>Teléfono</label>
              <input
                type="text"
                placeholder="Ej: 11 1234-5678"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
              />
            </div>
          </>
        )}

        <div className="campo-acciones">
          {!esAnonimo && !editandoId && (
            <button type="button" className="btn-secundario" onClick={buscarSimilares}>
              🔍 Buscar similares
            </button>
          )}

          <button
            type="submit"
            className="btn-primario"
            disabled={guardando || (!esAnonimo && !editandoId && !yaVerificado)}
            title={!esAnonimo && !editandoId && !yaVerificado ? 'Primero buscá similares' : ''}
          >
            {guardando ? 'Guardando...' : editandoId ? 'Actualizar' : 'Agregar'}
          </button>

          {(editandoId || descripcion || esAnonimo) && (
            <button type="button" className="btn-secundario" onClick={limpiarFormulario}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      {similaresEncontrados !== null && (
        <div className={similaresEncontrados.length > 0 ? 'aviso-similar' : 'aviso-ok'}>
          {similaresEncontrados.length > 0
            ? `⚠️ Se encontraron ${similaresEncontrados.length} cliente(s) similares. Revisá la grilla antes de agregar uno nuevo.`
            : '✅ No se encontraron coincidencias. Podés agregarlo con el botón "Agregar".'}
        </div>
      )}

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
                <th>Domicilio</th>
                <th>Teléfono</th>
                <th>Tipo</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {listaAMostrar.length === 0 && (
                <tr>
                  <td colSpan="6">No se encontraron clientes.</td>
                </tr>
              )}
              {listaAMostrar.map((c) => (
                <tr key={c.id_cliente} className={similaresEncontrados !== null ? 'fila-destacada' : ''}>
                  <td>{c.id_cliente}</td>
                  <td>{descripcionVisible(c)}</td>
                  <td>{c.domicilio || '—'}</td>
                  <td>{c.telefono || '—'}</td>
                  <td>{c.cliente_anonimo === 'S' ? 'Anónimo' : 'Identificado'}</td>
                  <td>
                    <button className="btn-link" onClick={() => iniciarEdicion(c)}>
                      Editar
                    </button>
                    <button className="btn-link btn-eliminar" onClick={() => eliminar(c.id_cliente)}>
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

export default Clientes