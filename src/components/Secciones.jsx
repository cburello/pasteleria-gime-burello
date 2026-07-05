import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function slugify(texto) {
  return (texto || '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function Secciones() {
  const [rubros, setRubros] = useState([])
  const [caratula, setCaratula] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  // Formulario de carátula
  const [caratulaNombre, setCaratulaNombre] = useState('')
  const [caratulaDescripcion, setCaratulaDescripcion] = useState('')
  const [caratulaImagen, setCaratulaImagen] = useState('')
  const [caratulaVisible, setCaratulaVisible] = useState(true)
  const [guardandoCaratula, setGuardandoCaratula] = useState(false)
  const [subiendoCaratula, setSubiendoCaratula] = useState(false)

  // Formulario de rubro
  const [editandoId, setEditandoId] = useState(null)
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [orden, setOrden] = useState('')
  const [visible, setVisible] = useState(true)
  const [imagenUrl, setImagenUrl] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [subiendoImagen, setSubiendoImagen] = useState(false)

  useEffect(() => {
    cargarSecciones()
  }, [])

  async function cargarSecciones() {
    setCargando(true)
    setError(null)
    const { data, error } = await supabase.from('secciones').select('*').order('orden')

    if (error) {
      setError('Error al cargar las secciones: ' + error.message)
      setCargando(false)
      return
    }

    const cara = data.find((s) => s.nivel === 'caratula') || null
    setCaratula(cara)
    if (cara) {
      setCaratulaNombre(cara.nombre || '')
      setCaratulaDescripcion(cara.descripcion || '')
      setCaratulaImagen(cara.imagen_url || '')
      setCaratulaVisible(cara.visible)
    }

    setRubros(data.filter((s) => s.nivel === 'rubro'))
    setCargando(false)
  }

  // ---------- Carátula ----------
  async function subirImagenCaratula(file) {
    if (!file || !caratula) return
    setSubiendoCaratula(true)
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const ruta = `caratula/${caratula.id_seccion}-${Date.now()}.${ext}`
    const { error } = await supabase.storage
      .from('catalogo')
      .upload(ruta, file, { upsert: true, contentType: file.type })
    if (error) {
      alert('Error al subir la imagen: ' + error.message)
      setSubiendoCaratula(false)
      return
    }
    const { data } = supabase.storage.from('catalogo').getPublicUrl(ruta)
    setCaratulaImagen(data.publicUrl)
    setSubiendoCaratula(false)
  }

  async function guardarCaratula() {
    if (!caratula) return
    if (!caratulaNombre.trim()) {
      alert('El nombre de la carátula es obligatorio')
      return
    }
    setGuardandoCaratula(true)
    const { error } = await supabase
      .from('secciones')
      .update({
        nombre: caratulaNombre.trim(),
        descripcion: caratulaDescripcion.trim() || null,
        imagen_url: caratulaImagen || null,
        visible: caratulaVisible,
      })
      .eq('id_seccion', caratula.id_seccion)

    if (error) {
      alert('Error al guardar la carátula: ' + error.message)
    } else {
      alert('Carátula guardada correctamente')
      cargarSecciones()
    }
    setGuardandoCaratula(false)
  }

  // ---------- Rubros ----------
  function limpiarFormulario() {
    setEditandoId(null)
    setNombre('')
    setDescripcion('')
    setOrden('')
    setVisible(true)
    setImagenUrl('')
  }

  function iniciarEdicion(rubro) {
    setEditandoId(rubro.id_seccion)
    setNombre(rubro.nombre || '')
    setDescripcion(rubro.descripcion || '')
    setOrden(rubro.orden ?? '')
    setVisible(rubro.visible)
    setImagenUrl(rubro.imagen_url || '')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function subirImagenRubro(file) {
    if (!file) return
    if (!editandoId) {
      alert('Guardá primero el rubro para poder subir la imagen.')
      return
    }
    setSubiendoImagen(true)
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const ruta = `rubros/${editandoId}-${Date.now()}.${ext}`
    const { error } = await supabase.storage
      .from('catalogo')
      .upload(ruta, file, { upsert: true, contentType: file.type })
    if (error) {
      alert('Error al subir la imagen: ' + error.message)
      setSubiendoImagen(false)
      return
    }
    const { data } = supabase.storage.from('catalogo').getPublicUrl(ruta)
    setImagenUrl(data.publicUrl)
    setSubiendoImagen(false)
  }

  async function guardarRubro(e) {
    e.preventDefault()
    if (!nombre.trim()) {
      alert('El nombre del rubro es obligatorio')
      return
    }

    setGuardando(true)

    const registro = {
      id_padre: caratula ? caratula.id_seccion : null,
      nivel: 'rubro',
      slug: slugify(nombre),
      nombre: nombre.trim(),
      descripcion: descripcion.trim() || null,
      orden: orden === '' || orden === null ? 0 : parseInt(orden),
      visible,
      imagen_url: imagenUrl || null,
    }

    let resultado
    if (editandoId) {
      resultado = await supabase.from('secciones').update(registro).eq('id_seccion', editandoId)
    } else {
      resultado = await supabase.from('secciones').insert(registro)
    }

    if (resultado.error) {
      if (resultado.error.code === '23505') {
        alert('Ya existe un rubro con ese nombre (URL duplicada). Cambiá el nombre.')
      } else {
        alert('Error al guardar el rubro: ' + resultado.error.message)
      }
      setGuardando(false)
      return
    }

    setGuardando(false)
    limpiarFormulario()
    cargarSecciones()
  }

  async function eliminarRubro(id) {
    const confirmar = window.confirm(
      '¿Seguro que querés eliminar este rubro? Los productos y combos que lo tengan asignado quedarán sin rubro (dejarán de publicarse).'
    )
    if (!confirmar) return

    const { error } = await supabase.from('secciones').delete().eq('id_seccion', id)
    if (error) {
      alert('No se pudo eliminar: ' + error.message)
    } else {
      if (editandoId === id) limpiarFormulario()
      cargarSecciones()
    }
  }

  async function alternarVisible(rubro) {
    const { error } = await supabase
      .from('secciones')
      .update({ visible: !rubro.visible })
      .eq('id_seccion', rubro.id_seccion)
    if (error) {
      alert('No se pudo cambiar la visibilidad: ' + error.message)
    } else {
      cargarSecciones()
    }
  }

  return (
    <div className="modulo">
      <h2>Secciones del catálogo web</h2>
      <div className="ayuda-vigencia">
        La carátula es la portada de gimeburellopasteleria.com.ar. Los rubros son las tarjetas de la carta
        y el filtro por el que se agrupan los productos y combos. Solo se publican en la web las secciones
        marcadas como visibles.
      </div>

      {error && <p className="mensaje-error">{error}</p>}
      {cargando && <p>Cargando...</p>}

      {!cargando && (
        <>
          {/* CARÁTULA */}
          <div className="subseccion">
            <h3>Carátula (portada de la home)</h3>
            {!caratula && (
              <p className="mensaje-error">
                No se encontró la carátula. Verificá que hayas corrido el script SQL de la web.
              </p>
            )}
            {caratula && (
              <>
                <div className="formulario formulario-costos">
                  <div className="campo" style={{ flex: 2 }}>
                    <label>Nombre</label>
                    <input
                      type="text"
                      placeholder="Ej: Gime Burello Pastelería"
                      value={caratulaNombre}
                      onChange={(e) => setCaratulaNombre(e.target.value)}
                    />
                  </div>
                  <div className="campo" style={{ flex: 3 }}>
                    <label>Frase de portada</label>
                    <input
                      type="text"
                      placeholder="Ej: Pastelería para tus momentos más especiales"
                      value={caratulaDescripcion}
                      onChange={(e) => setCaratulaDescripcion(e.target.value)}
                    />
                  </div>
                </div>

                <div className="formulario formulario-costos">
                  <div className="campo" style={{ flex: 2 }}>
                    <label>Imagen de portada</label>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={subiendoCaratula}
                      onChange={(e) => subirImagenCaratula(e.target.files?.[0])}
                    />
                    {subiendoCaratula && (
                      <span style={{ color: '#8A6A66', fontSize: 13 }}>Subiendo imagen...</span>
                    )}
                    {caratulaImagen && (
                      <img
                        src={caratulaImagen}
                        alt="Portada"
                        style={{ marginTop: 8, width: 200, height: 112, objectFit: 'cover', borderRadius: 8 }}
                      />
                    )}
                  </div>

                  <div className="campo">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={caratulaVisible}
                        onChange={(e) => setCaratulaVisible(e.target.checked)}
                        style={{ width: 'auto' }}
                      />
                      Visible en la web
                    </label>
                  </div>

                  <div className="campo-acciones">
                    <button className="btn-primario" onClick={guardarCaratula} disabled={guardandoCaratula}>
                      {guardandoCaratula ? 'Guardando...' : 'Guardar carátula'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* RUBROS */}
          <div className="subseccion">
            <h3>{editandoId ? 'Editar rubro' : 'Nuevo rubro'}</h3>

            <form className="formulario formulario-costos" onSubmit={guardarRubro}>
              <div className="campo" style={{ flex: 2 }}>
                <label>Nombre</label>
                <input
                  type="text"
                  placeholder="Ej: Tortas"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                />
                {nombre.trim() && (
                  <span style={{ color: '#8A6A66', fontSize: 12, marginTop: 4 }}>
                    URL: /{slugify(nombre)}
                  </span>
                )}
              </div>

              <div className="campo" style={{ flex: 3 }}>
                <label>Descripción corta</label>
                <input
                  type="text"
                  placeholder="Ej: Para soplar las velitas."
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                />
              </div>

              <div className="campo">
                <label>Orden</label>
                <input
                  type="number"
                  placeholder="1"
                  value={orden}
                  onChange={(e) => setOrden(e.target.value)}
                />
              </div>

              <div className="campo">
                <label>Imagen</label>
                {editandoId ? (
                  <>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={subiendoImagen}
                      onChange={(e) => subirImagenRubro(e.target.files?.[0])}
                    />
                    {subiendoImagen && (
                      <span style={{ color: '#8A6A66', fontSize: 13 }}>Subiendo imagen...</span>
                    )}
                    {imagenUrl && (
                      <img
                        src={imagenUrl}
                        alt="Rubro"
                        style={{ marginTop: 8, width: 120, height: 90, objectFit: 'cover', borderRadius: 8 }}
                      />
                    )}
                  </>
                ) : (
                  <span style={{ color: '#8A6A66', fontSize: 13 }}>
                    Guardá el rubro para poder subir una imagen.
                  </span>
                )}
              </div>

              <div className="campo">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={visible}
                    onChange={(e) => setVisible(e.target.checked)}
                    style={{ width: 'auto' }}
                  />
                  Visible en la web
                </label>
              </div>

              <div className="campo-acciones">
                <button type="submit" className="btn-primario" disabled={guardando}>
                  {guardando ? 'Guardando...' : editandoId ? 'Actualizar' : 'Agregar rubro'}
                </button>
                {editandoId && (
                  <button type="button" className="btn-secundario" onClick={limpiarFormulario}>
                    Cancelar
                  </button>
                )}
              </div>
            </form>

            <div className="tabla-wrapper">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Orden</th>
                    <th>Imagen</th>
                    <th>Nombre</th>
                    <th>URL</th>
                    <th>Visible</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {rubros.length === 0 && (
                    <tr>
                      <td colSpan="6">Todavía no hay rubros. Agregá el primero desde el formulario.</td>
                    </tr>
                  )}
                  {rubros.map((r) => (
                    <tr key={r.id_seccion}>
                      <td>{r.orden}</td>
                      <td>
                        {r.imagen_url ? (
                          <img
                            src={r.imagen_url}
                            alt={r.nombre}
                            style={{ width: 48, height: 36, objectFit: 'cover', borderRadius: 6 }}
                          />
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{r.nombre}</td>
                      <td>/{r.slug}</td>
                      <td>
                        <button className="btn-link" onClick={() => alternarVisible(r)}>
                          {r.visible ? 'Sí' : 'No'}
                        </button>
                      </td>
                      <td>
                        <button className="btn-link" onClick={() => iniciarEdicion(r)}>
                          Editar
                        </button>
                        <button className="btn-link btn-eliminar" onClick={() => eliminarRubro(r.id_seccion)}>
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default Secciones
