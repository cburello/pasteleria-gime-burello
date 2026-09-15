import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNotificaciones } from '../hooks/useNotificaciones'

function normalizar(texto) {
  return (texto || '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

function textoSeleccion(grupo) {
  const max = Number(grupo.seleccion_maxima) || 1
  const detalle = max <= 1 ? 'elegís 1' : `hasta ${max}`
  return `${grupo.es_obligatorio ? 'Obligatorio' : 'Opcional'} · ${detalle}`
}

function Personalizacion() {
  const { mostrarToast, confirmar } = useNotificaciones()
  const [grupos, setGrupos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [textoBusqueda, setTextoBusqueda] = useState('')

  const [vista, setVista] = useState('lista')
  const [grupoActual, setGrupoActual] = useState(null)

  useEffect(() => {
    cargarGrupos()
  }, [])

  async function cargarGrupos() {
    setCargando(true)
    setError(null)
    const { data, error } = await supabase
      .from('grupos_personalizacion')
      .select('*, items_personalizacion(id)')
      .order('orden', { ascending: true })

    if (error) {
      setError('Error al cargar los grupos: ' + error.message)
    } else {
      setGrupos(data)
    }
    setCargando(false)
  }

  function iniciarNuevo() {
    const siguienteOrden = grupos.length > 0 ? Math.max(...grupos.map((g) => g.orden || 0)) + 1 : 1
    setGrupoActual({
      id: null,
      codigo: '',
      nombre: '',
      descripcion: '',
      seleccion_minima: 1,
      seleccion_maxima: 1,
      es_obligatorio: true,
      orden: siguienteOrden,
      activo: true,
    })
    setVista('detalle')
  }

  function abrirGrupo(grupo) {
    setGrupoActual({ ...grupo })
    setVista('detalle')
  }

  async function eliminarGrupo(id) {
    const confirmado = await confirmar(
      '¿Seguro que querés eliminar este grupo? También se eliminarán todos sus ítems.'
    )
    if (!confirmado) return

    const { error } = await supabase.from('grupos_personalizacion').delete().eq('id', id)
    if (error) {
      mostrarToast('No se pudo eliminar el grupo: ' + error.message, 'error')
    } else {
      cargarGrupos()
    }
  }

  async function alternarActivoGrupo(grupo) {
    const { error } = await supabase
      .from('grupos_personalizacion')
      .update({ activo: !grupo.activo })
      .eq('id', grupo.id)
    if (error) {
      mostrarToast('No se pudo cambiar el estado: ' + error.message, 'error')
    } else {
      cargarGrupos()
    }
  }

  const gruposFiltrados = textoBusqueda.trim()
    ? grupos.filter(
        (g) =>
          normalizar(g.nombre).includes(normalizar(textoBusqueda)) ||
          normalizar(g.codigo).includes(normalizar(textoBusqueda))
      )
    : grupos

  if (vista === 'detalle') {
    return (
      <DetalleGrupo
        grupo={grupoActual}
        gruposExistentes={grupos}
        onVolver={() => {
          setVista('lista')
          cargarGrupos()
        }}
      />
    )
  }

  return (
    <div className="modulo modulo-compacto">
      <div className="cabecera-lista">
        <h2>Personalización</h2>
        <span className="contador">{gruposFiltrados.length}</span>
        <div className="buscador-inline">
          <input
            type="text"
            placeholder="🔎 Buscar grupo..."
            value={textoBusqueda}
            onChange={(e) => setTextoBusqueda(e.target.value)}
          />
        </div>
        <button className="btn-primario" onClick={iniciarNuevo}>
          + Nuevo grupo
        </button>
      </div>

      <div className="ayuda-vigencia">
        Cada grupo es un paso del armador de tortas de la app móvil (ej. "elegí el bizcocho"). Los ítems son las
        opciones que ve el cliente dentro de ese paso. El orden es el orden en que aparecen los pasos en la app.
      </div>

      {error && <p className="mensaje-error">{error}</p>}
      {cargando && <p>Cargando...</p>}

      {!cargando && !error && (
        <div className="tabla-wrapper">
          <table className="tabla tabla-compacta">
            <thead>
              <tr>
                <th>Orden</th>
                <th>Código</th>
                <th>Nombre</th>
                <th>Selección</th>
                <th>Ítems</th>
                <th>Activo</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {gruposFiltrados.length === 0 && (
                <tr>
                  <td colSpan="7">No hay grupos de personalización cargados.</td>
                </tr>
              )}
              {gruposFiltrados.map((g) => {
                const cantidadItems = (g.items_personalizacion || []).length
                return (
                  <tr key={g.id}>
                    <td>{g.orden}</td>
                    <td><code>{g.codigo}</code></td>
                    <td>{g.nombre}</td>
                    <td>
                      <span className={`badge-pill ${g.es_obligatorio ? 'badge-obligatorio' : 'badge-opcional'}`}>
                        {textoSeleccion(g)}
                      </span>
                    </td>
                    <td>{cantidadItems} ítem{cantidadItems === 1 ? '' : 's'}</td>
                    <td>
                      <button
                        className="icono-accion"
                        title={g.activo ? 'Activo (click para pausar)' : 'Pausado (click para activar)'}
                        onClick={() => alternarActivoGrupo(g)}
                      >
                        {g.activo ? '👁️' : '—'}
                      </button>
                    </td>
                    <td>
                      <button className="icono-accion" title="Editar" onClick={() => abrirGrupo(g)}>✏️</button>
                      <button className="icono-accion" title="Eliminar" onClick={() => eliminarGrupo(g.id)}>🗑️</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ============================================================
// SUBCOMPONENTE: Detalle de grupo (datos generales + ítems)
// ============================================================
function DetalleGrupo({ grupo, gruposExistentes, onVolver }) {
  const { mostrarToast, confirmar } = useNotificaciones()
  const [idGrupoActual, setIdGrupoActual] = useState(grupo.id)
  const [codigo, setCodigo] = useState(grupo.codigo || '')
  const [nombre, setNombre] = useState(grupo.nombre || '')
  const [descripcion, setDescripcion] = useState(grupo.descripcion || '')
  const [seleccionMinima, setSeleccionMinima] = useState(String(grupo.seleccion_minima ?? 1))
  const [seleccionMaxima, setSeleccionMaxima] = useState(String(grupo.seleccion_maxima ?? 1))
  const [esObligatorio, setEsObligatorio] = useState(grupo.es_obligatorio ?? true)
  const [orden, setOrden] = useState(String(grupo.orden ?? 0))
  const [activo, setActivo] = useState(grupo.activo ?? true)
  const [guardando, setGuardando] = useState(false)

  const [items, setItems] = useState([])
  const [cargandoItems, setCargandoItems] = useState(true)
  const [fotosRotas, setFotosRotas] = useState(new Set())

  const [nombreItem, setNombreItem] = useState('')
  const [descripcionItem, setDescripcionItem] = useState('')
  const [ordenItem, setOrdenItem] = useState('')
  const [destacadoItem, setDestacadoItem] = useState(false)
  const [editandoItemId, setEditandoItemId] = useState(null)
  const [fotoUrlItem, setFotoUrlItem] = useState('')
  const [guardandoItem, setGuardandoItem] = useState(false)
  const [subiendoFoto, setSubiendoFoto] = useState(false)

  useEffect(() => {
    if (idGrupoActual) {
      cargarItems()
    } else {
      setCargandoItems(false)
    }
  }, [])

  async function cargarItems(id = idGrupoActual) {
    setCargandoItems(true)
    const { data, error } = await supabase
      .from('items_personalizacion')
      .select('*')
      .eq('grupo_id', id)
      .order('orden', { ascending: true })

    if (!error) setItems(data || [])
    setCargandoItems(false)
  }

  async function guardarCabecera() {
    if (!codigo.trim() || !nombre.trim()) {
      mostrarToast('Código y nombre son obligatorios', 'error')
      return null
    }

    const min = parseInt(seleccionMinima)
    const max = parseInt(seleccionMaxima)
    if (isNaN(min) || isNaN(max) || min < 0 || max < 1 || min > max) {
      mostrarToast('Revisá la selección mínima y máxima: la máxima tiene que ser al menos 1 y no puede ser menor que la mínima', 'error')
      return null
    }

    const codigoNormalizado = normalizar(codigo).replace(/\s+/g, '_')
    const yaExiste = gruposExistentes.some(
      (g) => normalizar(g.codigo) === normalizar(codigoNormalizado) && g.id !== idGrupoActual
    )
    if (yaExiste) {
      mostrarToast('Ya existe un grupo con ese código. Usá uno distinto.', 'error')
      return null
    }

    setGuardando(true)

    const registro = {
      codigo: codigoNormalizado,
      nombre: nombre.trim(),
      descripcion: descripcion.trim() || null,
      seleccion_minima: min,
      seleccion_maxima: max,
      es_obligatorio: esObligatorio,
      orden: orden === '' ? 0 : parseInt(orden),
      activo,
    }

    let resultado
    if (idGrupoActual) {
      resultado = await supabase.from('grupos_personalizacion').update(registro).eq('id', idGrupoActual)
    } else {
      resultado = await supabase.from('grupos_personalizacion').insert(registro).select().single()
    }

    if (resultado.error) {
      if (resultado.error.code === '23505') {
        mostrarToast('Ya existe un grupo con ese código.', 'error')
      } else {
        mostrarToast('Error al guardar: ' + resultado.error.message, 'error')
      }
      setGuardando(false)
      return null
    }

    setGuardando(false)
    setCodigo(codigoNormalizado)
    return idGrupoActual || resultado.data.id
  }

  async function handleGuardarCabecera() {
    const esNuevo = !idGrupoActual
    const id = await guardarCabecera()
    if (id) {
      mostrarToast('Grupo guardado correctamente')
      if (esNuevo) {
        setIdGrupoActual(id)
        setCargandoItems(true)
        cargarItems(id)
      }
    }
  }

  function limpiarFormularioItem() {
    setEditandoItemId(null)
    setNombreItem('')
    setDescripcionItem('')
    setOrdenItem('')
    setDestacadoItem(false)
    setFotoUrlItem('')
  }

  function iniciarEdicionItem(item) {
    setEditandoItemId(item.id)
    setNombreItem(item.nombre || '')
    setDescripcionItem(item.descripcion || '')
    setOrdenItem(String(item.orden ?? ''))
    setDestacadoItem(!!item.es_destacado)
    setFotoUrlItem(item.foto_url || '')
  }

  async function guardarItem() {
    if (!idGrupoActual) {
      mostrarToast('Primero guardá los datos generales del grupo antes de agregar ítems', 'error')
      return
    }
    if (!nombreItem.trim()) {
      mostrarToast('El nombre del ítem es obligatorio', 'error')
      return
    }

    setGuardandoItem(true)

    const siguienteOrden = items.length > 0 ? Math.max(...items.map((i) => i.orden || 0)) + 1 : 1
    const registro = {
      grupo_id: idGrupoActual,
      nombre: nombreItem.trim(),
      descripcion: descripcionItem.trim() || null,
      es_destacado: destacadoItem,
      orden: ordenItem === '' ? siguienteOrden : parseInt(ordenItem),
    }

    let resultado
    if (editandoItemId) {
      resultado = await supabase.from('items_personalizacion').update(registro).eq('id', editandoItemId)
    } else {
      resultado = await supabase.from('items_personalizacion').insert(registro)
    }

    if (resultado.error) {
      mostrarToast('Error al guardar el ítem: ' + resultado.error.message, 'error')
    } else {
      limpiarFormularioItem()
      cargarItems()
    }
    setGuardandoItem(false)
  }

  async function eliminarItem(id) {
    const confirmado = await confirmar('¿Eliminar este ítem?')
    if (!confirmado) return

    const { error } = await supabase.from('items_personalizacion').delete().eq('id', id)
    if (error) {
      mostrarToast('Error al eliminar el ítem: ' + error.message, 'error')
    } else {
      if (editandoItemId === id) limpiarFormularioItem()
      cargarItems()
    }
  }

  async function alternarDestacado(item) {
    const { error } = await supabase
      .from('items_personalizacion')
      .update({ es_destacado: !item.es_destacado })
      .eq('id', item.id)
    if (error) {
      mostrarToast('No se pudo cambiar: ' + error.message, 'error')
    } else {
      cargarItems()
    }
  }

  async function alternarActivoItem(item) {
    const { error } = await supabase
      .from('items_personalizacion')
      .update({ activo: !item.activo })
      .eq('id', item.id)
    if (error) {
      mostrarToast('No se pudo cambiar: ' + error.message, 'error')
    } else {
      cargarItems()
    }
  }

  async function subirFotoItem(file) {
    if (!file) return
    if (!editandoItemId) {
      mostrarToast('Guardá primero el ítem para poder subir su foto.', 'error')
      return
    }
    setSubiendoFoto(true)
    const ruta = `personalizacion/${editandoItemId}-${Date.now()}.jpg`
    const { error } = await supabase.storage
      .from('catalogo')
      .upload(ruta, file, { upsert: true, contentType: file.type })
    if (error) {
      mostrarToast('Error al subir la foto: ' + error.message, 'error')
      setSubiendoFoto(false)
      return
    }
    const { data } = supabase.storage.from('catalogo').getPublicUrl(ruta)

    const { error: errorUpdate } = await supabase
      .from('items_personalizacion')
      .update({ foto_url: data.publicUrl })
      .eq('id', editandoItemId)

    if (errorUpdate) {
      mostrarToast('La foto se subió pero no se pudo guardar en el ítem: ' + errorUpdate.message, 'error')
    } else {
      setFotoUrlItem(data.publicUrl)
      cargarItems()
    }
    setSubiendoFoto(false)
  }

  return (
    <div className="modulo modulo-compacto">
      <div className="detalle-cabecera-compacta">
        <button className="btn-volver" onClick={onVolver} style={{ marginBottom: 0 }}>← Volver a Personalización</button>
        <h2>{idGrupoActual ? (nombre || 'Editar grupo') : 'Nuevo grupo'}</h2>
        {idGrupoActual && <span className="id-badge">ID {idGrupoActual}</span>}
      </div>

      <div className="detalle-dos-columnas">
        <aside className="detalle-sidebar">
          <div className="rotulo-grupo">Datos del grupo</div>
          <div className="campos-apilados">
            <div className="campo">
              <label>Código</label>
              <input
                type="text"
                placeholder="Ej: cobertura_estilo"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
              />
            </div>
            <div className="campo">
              <label>Nombre</label>
              <input
                type="text"
                placeholder="Ej: Estilo de Cobertura y Acabado"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </div>
            <div className="campo">
              <label>Descripción / instrucción</label>
              <textarea
                placeholder="Texto orientativo para el cliente en la app"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                rows={3}
              />
            </div>
            <div className="fila-2">
              <div className="campo">
                <label>Selección mínima</label>
                <input type="number" min="0" value={seleccionMinima} onChange={(e) => setSeleccionMinima(e.target.value)} />
              </div>
              <div className="campo">
                <label>Selección máxima</label>
                <input type="number" min="1" value={seleccionMaxima} onChange={(e) => setSeleccionMaxima(e.target.value)} />
              </div>
            </div>
            <div className="fila-2">
              <div className="campo">
                <label>Orden del paso</label>
                <input type="number" value={orden} onChange={(e) => setOrden(e.target.value)} />
              </div>
            </div>
            <label className="campo-check">
              <input type="checkbox" checked={esObligatorio} onChange={(e) => setEsObligatorio(e.target.checked)} />
              Obligatorio
            </label>
            <label className="campo-check">
              <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
              Grupo activo (visible en la app)
            </label>
            <button className="btn-primario" onClick={handleGuardarCabecera} disabled={guardando} style={{ width: '100%' }}>
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </aside>

        <div className="detalle-principal">
          {idGrupoActual ? (
            <>
              <div className="rotulo-grupo">Opciones de este grupo ({items.length})</div>

              <div className="aviso-similar">
                💡 La foto es lo que ve el cliente en la app al elegir esta opción — importa sobre todo en técnicas
                y coberturas. "Destacado" resalta la opción como favorita de Gime.
              </div>

              <div className="formulario">
                <div className="campo grande">
                  <label>Nombre</label>
                  <input
                    type="text"
                    placeholder="Ej: Drip Cake Artesanal"
                    value={nombreItem}
                    onChange={(e) => setNombreItem(e.target.value)}
                  />
                </div>
                <div className="campo grande">
                  <label>Descripción</label>
                  <input
                    type="text"
                    placeholder="Notas de sabor o técnica"
                    value={descripcionItem}
                    onChange={(e) => setDescripcionItem(e.target.value)}
                  />
                </div>
                <div className="campo">
                  <label>Orden</label>
                  <input
                    type="number"
                    placeholder="1"
                    value={ordenItem}
                    onChange={(e) => setOrdenItem(e.target.value)}
                    style={{ maxWidth: '80px' }}
                  />
                </div>
                <div className="campo">
                  <label className="campo-check">
                    <input type="checkbox" checked={destacadoItem} onChange={(e) => setDestacadoItem(e.target.checked)} />
                    Destacado
                  </label>
                </div>
                <button className="btn-primario" onClick={guardarItem} disabled={guardandoItem}>
                  {guardandoItem ? '...' : editandoItemId ? 'Actualizar' : '+ Agregar'}
                </button>
                {editandoItemId && (
                  <button className="btn-secundario" type="button" onClick={limpiarFormularioItem}>
                    Cancelar
                  </button>
                )}
              </div>

              {editandoItemId && (
                <div className="campo" style={{ maxWidth: '280px', marginBottom: '16px' }}>
                  <label>Foto</label>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={subiendoFoto}
                    onChange={(e) => subirFotoItem(e.target.files?.[0])}
                  />
                  {subiendoFoto && <span style={{ color: '#8A6A66', fontSize: 13 }}>Subiendo imagen...</span>}
                  {fotoUrlItem && <img src={fotoUrlItem} alt={nombreItem} className="foto-preview" />}
                </div>
              )}

              {cargandoItems ? (
                <p>Cargando ítems...</p>
              ) : (
                <div className="tabla-wrapper">
                  <table className="tabla tabla-compacta">
                    <thead>
                      <tr>
                        <th>Foto</th>
                        <th>Nombre</th>
                        <th>Descripción</th>
                        <th>Destacado</th>
                        <th>Activo</th>
                        <th>Orden</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.length === 0 && (
                        <tr>
                          <td colSpan="7">Todavía no agregaste ítems a este grupo.</td>
                        </tr>
                      )}
                      {items.map((item) => (
                        <tr key={item.id}>
                          <td>
                            {item.foto_url && !fotosRotas.has(item.id) ? (
                              <img
                                src={item.foto_url}
                                alt={item.nombre}
                                className="foto-mini"
                                onError={() => setFotosRotas((prev) => new Set(prev).add(item.id))}
                              />
                            ) : (
                              <span className="foto-vacia">—</span>
                            )}
                          </td>
                          <td>{item.nombre}</td>
                          <td>{item.descripcion || '—'}</td>
                          <td>
                            <button
                              className={`btn-estrella${item.es_destacado ? ' activa' : ''}`}
                              title={item.es_destacado ? 'Destacado (click para quitar)' : 'Marcar como destacado'}
                              onClick={() => alternarDestacado(item)}
                            >
                              ★
                            </button>
                          </td>
                          <td>
                            <button
                              className="icono-accion"
                              title={item.activo ? 'Activo (click para pausar)' : 'Pausado (click para activar)'}
                              onClick={() => alternarActivoItem(item)}
                            >
                              {item.activo ? '👁️' : '—'}
                            </button>
                          </td>
                          <td>{item.orden}</td>
                          <td>
                            <button className="icono-accion" title="Editar" onClick={() => iniciarEdicionItem(item)}>✏️</button>
                            <button className="icono-accion" title="Eliminar" onClick={() => eliminarItem(item.id)}>🗑️</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="ayuda-vigencia" style={{ marginTop: '12px', marginBottom: 0 }}>
                Al editar un ítem (✏️) se habilita subir su foto: primero se guarda el ítem y recién ahí se puede
                adjuntar la imagen, porque el archivo se guarda con el ID del ítem en el nombre.
              </div>
            </>
          ) : (
            <p style={{ color: '#8A6A66', fontSize: 13 }}>Guardá primero los datos generales para poder agregar ítems.</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default Personalizacion
