import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNotificaciones } from '../hooks/useNotificaciones'

const COL = {
  coral: '#E8765C', coralDark: '#D4624A', bg: '#FFF5F2', card: '#FFFFFF',
  text: '#4A2C2A', sec: '#8A6A66', line: '#F0DAD3',
  ok: '#2E7D32', okBg: '#E8F5E9', danger: '#C0392B', dangerBg: '#FDECEA',
}

function CaratulaWeb() {
  const { confirmar } = useNotificaciones()
  const [caratula, setCaratula] = useState(null)
  const [segundos, setSegundos] = useState('5')
  const [imagenes, setImagenes] = useState([])
  const [promos, setPromos] = useState([])
  const [promoEdit, setPromoEdit] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [subiendo, setSubiendo] = useState(false)
  const [mensaje, setMensaje] = useState(null)

  useEffect(() => { cargarTodo() }, [])

  async function cargarTodo() {
    setCargando(true)
    const { data: cara } = await supabase.from('secciones').select('*').eq('nivel', 'caratula').limit(1)
    const c = (cara && cara[0]) || null
    setCaratula(c)
    setSegundos(String(c && c.carrusel_segundos != null ? c.carrusel_segundos : 5))

    const { data: imgs } = await supabase.from('caratula_imagenes').select('*').order('orden')
    setImagenes((imgs || []).map((x) => ({ ...x })))

    const { data: pr } = await supabase.from('promo_inicio').select('*').order('id_promo', { ascending: false })
    setPromos(pr || [])
    setCargando(false)
  }

  function aviso(tipo, texto) { setMensaje({ tipo, texto }) }

  // ---------- carrusel ----------
  async function guardarIntervalo() {
    if (!caratula) return
    const n = parseInt(segundos, 10)
    if (isNaN(n) || n < 1) { aviso('error', 'El intervalo debe ser un número de segundos mayor a 0.'); return }
    const { error } = await supabase.from('secciones').update({ carrusel_segundos: n }).eq('id_seccion', caratula.id_seccion)
    aviso(error ? 'error' : 'ok', error ? 'Error: ' + error.message : 'Intervalo guardado.')
  }

  async function subirImagenCarrusel(e) {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    setSubiendo(true)
    const ext = file.name.split('.').pop()
    const ruta = `caratula/carrusel-${Date.now()}.${ext}`
    const { error: errUp } = await supabase.storage.from('catalogo').upload(ruta, file, { upsert: true, contentType: file.type })
    if (errUp) { setSubiendo(false); aviso('error', 'Error al subir: ' + errUp.message); return }
    const { data } = supabase.storage.from('catalogo').getPublicUrl(ruta)
    const orden = imagenes.length ? Math.max(...imagenes.map((i) => i.orden || 0)) + 1 : 1
    const { error } = await supabase.from('caratula_imagenes').insert({ imagen_url: data.publicUrl, orden, visible: true })
    setSubiendo(false)
    e.target.value = ''
    if (error) { aviso('error', 'Error al guardar la imagen: ' + error.message); return }
    aviso('ok', 'Imagen agregada.')
    cargarTodo()
  }

  function cambiarOrdenLocal(id, valor) {
    setImagenes((prev) => prev.map((i) => (i.id_caratula_imagen === id ? { ...i, orden: valor } : i)))
  }
  async function guardarOrden(img) {
    const n = parseInt(img.orden, 10)
    if (isNaN(n)) return
    await supabase.from('caratula_imagenes').update({ orden: n }).eq('id_caratula_imagen', img.id_caratula_imagen)
    cargarTodo()
  }
  async function toggleVisibleImagen(img) {
    await supabase.from('caratula_imagenes').update({ visible: !img.visible }).eq('id_caratula_imagen', img.id_caratula_imagen)
    setImagenes((prev) => prev.map((i) => (i.id_caratula_imagen === img.id_caratula_imagen ? { ...i, visible: !i.visible } : i)))
  }
  async function quitarImagen(img) {
    if (!(await confirmar('¿Quitar esta imagen del carrusel?'))) return
    const { error } = await supabase.from('caratula_imagenes').delete().eq('id_caratula_imagen', img.id_caratula_imagen)
    if (error) { aviso('error', 'Error al quitar: ' + error.message); return }
    aviso('ok', 'Imagen quitada.')
    cargarTodo()
  }

  // ---------- promo ----------
  function promoVacia() {
    return { id_promo: null, activo: false, tipo: 'foto', url: '', segundos: 5, texto: '', fecha_desde: '', fecha_hasta: '' }
  }
  function nuevaPromo() { setPromoEdit(promoVacia()); setMensaje(null) }
  function editarPromo(p) {
    setPromoEdit({
      id_promo: p.id_promo, activo: p.activo, tipo: p.tipo || 'foto', url: p.url || '',
      segundos: p.segundos != null ? p.segundos : 5, texto: p.texto || '',
      fecha_desde: p.fecha_desde || '', fecha_hasta: p.fecha_hasta || '',
    })
    setMensaje(null)
  }
  function cancelarPromo() { setPromoEdit(null) }
  function setP(campo, valor) { setPromoEdit((prev) => ({ ...prev, [campo]: valor })) }

  async function subirMediaPromo(e) {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    setSubiendo(true)
    const ext = file.name.split('.').pop()
    const ruta = `promo/${Date.now()}.${ext}`
    const { error: errUp } = await supabase.storage.from('catalogo').upload(ruta, file, { upsert: true, contentType: file.type })
    if (errUp) { setSubiendo(false); aviso('error', 'Error al subir: ' + errUp.message); return }
    const { data } = supabase.storage.from('catalogo').getPublicUrl(ruta)
    const tipo = file.type.startsWith('video') ? 'video' : 'foto'
    setPromoEdit((prev) => ({ ...prev, url: data.publicUrl, tipo }))
    setSubiendo(false)
    e.target.value = ''
  }

  async function guardarPromo() {
    if (!promoEdit) return
    const payload = {
      activo: promoEdit.activo,
      tipo: promoEdit.tipo,
      url: promoEdit.url || null,
      segundos: parseInt(promoEdit.segundos, 10) || 0,
      texto: promoEdit.texto ? promoEdit.texto.trim() : null,
      fecha_desde: promoEdit.fecha_desde || null,
      fecha_hasta: promoEdit.fecha_hasta || null,
      actualizado_en: new Date().toISOString(),
    }
    let error
    if (promoEdit.id_promo) {
      ({ error } = await supabase.from('promo_inicio').update(payload).eq('id_promo', promoEdit.id_promo))
    } else {
      ({ error } = await supabase.from('promo_inicio').insert(payload))
    }
    if (error) { aviso('error', 'Error al guardar la promo: ' + error.message); return }
    aviso('ok', 'Promoción guardada.')
    setPromoEdit(null)
    cargarTodo()
  }

  async function eliminarPromo(p) {
    if (!(await confirmar('¿Eliminar esta promoción?'))) return
    const { error } = await supabase.from('promo_inicio').delete().eq('id_promo', p.id_promo)
    if (error) { aviso('error', 'Error al eliminar: ' + error.message); return }
    aviso('ok', 'Promoción eliminada.')
    cargarTodo()
  }

  // ---------- estilos ----------
  const inp = { width: '100%', padding: '8px 10px', border: `1px solid ${COL.line}`, borderRadius: '8px', background: COL.card, color: COL.text, colorScheme: 'light', fontFamily: 'inherit', fontSize: '.9rem', boxSizing: 'border-box' }
  const panel = { background: COL.card, border: `1px solid ${COL.line}`, borderRadius: '16px', padding: '18px 20px', marginBottom: '18px' }
  const h2 = { fontSize: '1.2rem', fontWeight: 600, margin: '0 0 4px', color: COL.coralDark }
  const desc = { color: COL.sec, fontSize: '.82rem', margin: '0 0 16px' }
  const label = { fontSize: '.72rem', letterSpacing: '.03em', textTransform: 'uppercase', color: COL.sec, display: 'block', marginBottom: '4px' }
  const btn = { background: COL.coral, color: '#fff', border: 0, borderRadius: '10px', padding: '9px 16px', fontWeight: 600, fontSize: '.85rem', cursor: 'pointer' }
  const btnSec = { ...btn, background: COL.card, color: COL.text, border: `1px solid ${COL.line}` }
  const btnDanger = { ...btn, background: COL.card, color: COL.danger, border: `1px solid ${COL.danger}` }

  function bannerMensaje() {
    if (!mensaje) return null
    const ok = mensaje.tipo === 'ok'
    return (
      <div style={{ padding: '10px 12px', borderRadius: '10px', marginBottom: '14px', fontSize: '.85rem', background: ok ? COL.okBg : COL.dangerBg, color: ok ? COL.ok : COL.danger }}>
        {mensaje.texto}
      </div>
    )
  }

  function renderCarrusel() {
    return (
      <div style={panel}>
        <h2 style={h2}>Carrusel de portada</h2>
        <p style={desc}>Fotos que rotan solas en el inicio del sitio. Si no cargás ninguna visible, se usa la foto de portada actual.</p>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ maxWidth: '180px' }}>
            <label style={label}>Segundos por foto</label>
            <input type="number" min="1" value={segundos} style={inp} onChange={(e) => setSegundos(e.target.value)} />
          </div>
          <button style={btnSec} onClick={guardarIntervalo}>Guardar intervalo</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', marginTop: '16px' }}>
          {imagenes.map((img) => (
            <div key={img.id_caratula_imagen} style={{ border: `1px solid ${COL.line}`, borderRadius: '12px', overflow: 'hidden', background: COL.card }}>
              <img src={img.imagen_url} alt="" style={{ width: '100%', height: '100px', objectFit: 'cover', display: 'block' }} />
              <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '.72rem', color: COL.sec }}>Orden</span>
                <input type="number" value={img.orden} style={{ ...inp, width: '60px', padding: '5px 7px' }}
                  onChange={(e) => cambiarOrdenLocal(img.id_caratula_imagen, e.target.value)} onBlur={() => guardarOrden(img)} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px 10px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '.78rem', color: COL.sec }}>
                  <input type="checkbox" checked={img.visible} onChange={() => toggleVisibleImagen(img)} /> Visible
                </label>
                <button style={{ ...btnDanger, padding: '4px 10px', fontSize: '.75rem' }} onClick={() => quitarImagen(img)}>Quitar</button>
              </div>
            </div>
          ))}

          <label style={{ border: `2px dashed ${COL.line}`, borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', color: COL.sec, cursor: 'pointer', minHeight: '150px', fontSize: '.85rem' }}>
            <span style={{ fontSize: '1.8rem', color: COL.coral }}>+</span>
            {subiendo ? 'Subiendo…' : 'Agregar imagen'}
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={subirImagenCarrusel} disabled={subiendo} />
          </label>
        </div>
      </div>
    )
  }

  function renderPromoEditor() {
    const p = promoEdit
    return (
      <div style={{ border: `1px solid ${COL.line}`, borderRadius: '12px', padding: '14px', marginTop: '12px', background: COL.bg }}>
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '.9rem', fontWeight: 600, color: COL.text }}>
            <input type="checkbox" checked={p.activo} onChange={(e) => setP('activo', e.target.checked)} /> Promo activa
          </label>
        </div>

        <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <div>
            <label style={label}>Tipo</label>
            <div style={{ display: 'flex', gap: '14px', fontSize: '.9rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><input type="radio" checked={p.tipo === 'foto'} onChange={() => setP('tipo', 'foto')} /> Foto</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><input type="radio" checked={p.tipo === 'video'} onChange={() => setP('tipo', 'video')} /> Video</label>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: '160px' }}>
            <label style={label}>Segundos hasta cerrar (0 = solo manual)</label>
            <input type="number" min="0" value={p.segundos} style={inp} onChange={(e) => setP('segundos', e.target.value)} />
          </div>
        </div>

        <div style={{ marginBottom: '12px' }}>
          <label style={label}>Archivo (foto o video)</label>
          <label style={{ ...btnSec, display: 'inline-block', cursor: 'pointer' }}>
            {subiendo ? 'Subiendo…' : 'Subir archivo'}
            <input type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={subirMediaPromo} disabled={subiendo} />
          </label>
          {p.url && (
            <div style={{ marginTop: '8px' }}>
              {p.tipo === 'video'
                ? <video src={p.url} controls muted style={{ width: '100%', maxWidth: '320px', borderRadius: '10px' }} />
                : <img src={p.url} alt="" style={{ width: '100%', maxWidth: '320px', borderRadius: '10px', display: 'block' }} />}
            </div>
          )}
        </div>

        <div style={{ marginBottom: '12px' }}>
          <label style={label}>Texto (opcional)</label>
          <input type="text" value={p.texto} style={inp} onChange={(e) => setP('texto', e.target.value)} />
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '4px' }}>
          <div style={{ flex: 1, minWidth: '140px' }}>
            <label style={label}>Mostrar desde</label>
            <input type="date" value={p.fecha_desde} style={inp} onChange={(e) => setP('fecha_desde', e.target.value)} />
          </div>
          <div style={{ flex: 1, minWidth: '140px' }}>
            <label style={label}>Mostrar hasta</label>
            <input type="date" value={p.fecha_hasta} style={inp} onChange={(e) => setP('fecha_hasta', e.target.value)} />
          </div>
        </div>
        <p style={{ fontSize: '.75rem', color: COL.sec, margin: '6px 0 0' }}>
          Se muestra si está activa y hoy cae dentro del rango. Dejá una fecha vacía para no poner ese límite.
        </p>

        <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
          <button style={btn} onClick={guardarPromo}>Guardar promoción</button>
          <button style={btnSec} onClick={cancelarPromo}>Cancelar</button>
        </div>
      </div>
    )
  }

  function renderPromos() {
    return (
      <div style={panel}>
        <h2 style={h2}>Ventana promocional de inicio</h2>
        <p style={desc}>Aparece al abrir la página. Puede ser una foto o un video (uno u otro). Se muestra si está activa y si hoy cae dentro del rango de fechas.</p>

        {promos.length === 0 && <p style={{ fontSize: '.85rem', color: COL.sec }}>No hay promociones cargadas.</p>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {promos.map((p) => (
            <div key={p.id_promo} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', border: `1px solid ${COL.line}`, borderRadius: '10px', padding: '10px 12px' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '.9rem', color: COL.text }}>
                  {p.texto || (p.tipo === 'video' ? 'Video' : 'Foto')}{' '}
                  <span style={{ fontSize: '.72rem', color: '#fff', background: p.activo ? COL.ok : COL.sec, borderRadius: '20px', padding: '1px 8px', marginLeft: '4px' }}>
                    {p.activo ? 'activa' : 'inactiva'}
                  </span>
                </div>
                <div style={{ fontSize: '.75rem', color: COL.sec }}>
                  {p.tipo} · {p.fecha_desde || 'sin inicio'} a {p.fecha_hasta || 'sin fin'} · {p.segundos > 0 ? p.segundos + 's' : 'cierre manual'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button style={{ ...btnSec, padding: '5px 12px', fontSize: '.78rem' }} onClick={() => editarPromo(p)}>Editar</button>
                <button style={{ ...btnDanger, padding: '5px 12px', fontSize: '.78rem' }} onClick={() => eliminarPromo(p)}>Eliminar</button>
              </div>
            </div>
          ))}
        </div>

        {promoEdit ? renderPromoEditor() : (
          <div style={{ marginTop: '12px' }}>
            <button style={btn} onClick={nuevaPromo}>+ Nueva promoción</button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ padding: '20px', color: COL.text }}>
      <h2 style={{ fontSize: '1.4rem', fontWeight: 600, margin: '0 0 4px' }}>Carátula y promoción</h2>
      <p style={{ fontSize: '.85rem', color: COL.sec, margin: '0 0 16px' }}>Fotos del carrusel de la portada y ventana promocional de inicio del sitio público.</p>

      {bannerMensaje()}

      {cargando ? <p style={{ color: COL.sec }}>Cargando…</p> : (
        <>
          {renderCarrusel()}
          {renderPromos()}
        </>
      )}
    </div>
  )
}

export default CaratulaWeb
