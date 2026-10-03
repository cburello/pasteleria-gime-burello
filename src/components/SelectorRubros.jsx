import { useEffect, useRef, useState } from 'react'

// Lista desplegable con checks para elegir qué rubros se emiten en la lista
// de precios.
// rubros: [{ id, nombre }] (ver cargarRubrosListaPrecios)
// seleccionados: array de ids marcados
// onChange: recibe el nuevo array de ids
function SelectorRubros({ rubros, seleccionados, onChange, style }) {
  const [abierto, setAbierto] = useState(false)
  const contenedorRef = useRef(null)

  // se cierra al tocar fuera del desplegable
  useEffect(() => {
    if (!abierto) return
    function alClickear(e) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target)) setAbierto(false)
    }
    document.addEventListener('mousedown', alClickear)
    document.addEventListener('touchstart', alClickear)
    return () => {
      document.removeEventListener('mousedown', alClickear)
      document.removeEventListener('touchstart', alClickear)
    }
  }, [abierto])

  const todos = rubros.length > 0 && seleccionados.length === rubros.length

  function alternar(id) {
    onChange(seleccionados.includes(id) ? seleccionados.filter((x) => x !== id) : [...seleccionados, id])
  }

  function alternarTodos() {
    onChange(todos ? [] : rubros.map((r) => r.id))
  }

  const resumen = todos
    ? 'Rubros: todos'
    : seleccionados.length === 0
      ? 'Rubros: ninguno'
      : `Rubros: ${seleccionados.length} de ${rubros.length}`

  return (
    <div className="selector-rubros" ref={contenedorRef} style={style}>
      <button type="button" className="selector-rubros-boton" onClick={() => setAbierto(!abierto)}>
        <span>{resumen}</span>
        <span className="selector-rubros-flecha">{abierto ? '▲' : '▼'}</span>
      </button>
      {abierto && (
        <div className="selector-rubros-panel">
          <label className="selector-rubros-opcion selector-rubros-todos">
            <input type="checkbox" checked={todos} onChange={alternarTodos} />
            Todos
          </label>
          {rubros.map((r) => (
            <label key={r.id} className="selector-rubros-opcion">
              <input type="checkbox" checked={seleccionados.includes(r.id)} onChange={() => alternar(r.id)} />
              {r.nombre}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export default SelectorRubros
