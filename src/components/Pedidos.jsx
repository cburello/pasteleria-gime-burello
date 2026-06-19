import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

function Pedidos({ idPedidoAbrir, onPedidoAbierto }) {
  const [pedidos, setPedidos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const [vista, setVista] = useState('lista')
  const [pedidoActual, setPedidoActual] = useState(null)

  const [textoBusqueda, setTextoBusqueda] = useState('')

useEffect(() => {
    cargarPedidos()
  }, [])

  // Si llega un id de pedido para abrir directamente (ej. desde el Dashboard), lo abrimos
  useEffect(() => {
    async function abrirDesdeId() {
      if (idPedidoAbrir) {
        const { data, error } = await supabase
          .from('pedidos')
          .select('*')
          .eq('id_pedido', idPedidoAbrir)
          .single()

        if (!error && data) {
          setPedidoActual({ ...data })
          setVista('detalle')
        }
        if (onPedidoAbierto) onPedidoAbierto() // limpia el estado en el padre para no reabrir en loop
      }
    }
    abrirDesdeId()
  }, [idPedidoAbrir])
  
  function normalizar(texto) {
    return (texto || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  }

  function formatearMoneda(valor) {
    if (valor === null || valor === undefined || isNaN(valor)) return '—'
    return new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(valor)
  }

  function formatearFecha(fecha) {
    if (!fecha) return ''
    return new Date(fecha).toLocaleDateString('es-AR')
  }

  async function cargarPedidos() {
    setCargando(true)
    setError(null)
    const { data, error } = await supabase
      .from('pedidos')
      .select('*, clientes(descripcion, cliente_anonimo)')
      .order('id_pedido', { ascending: false })

    if (error) {
      setError('Error al cargar los pedidos: ' + error.message)
    } else {
      setPedidos(data)
    }
    setCargando(false)
  }

  function iniciarNuevo() {
    setPedidoActual({
      id_pedido: null,
      id_cliente: null,
      descripcion: '',
      domicilio: '',
      telefono: '',
      fecha_pedido: new Date().toISOString().slice(0, 10),
      fecha_entrega: '',
    })
    setVista('detalle')
  }

  function abrirPedido(pedido) {
    setPedidoActual({ ...pedido })
    setVista('detalle')
  }

  async function eliminarPedido(id) {
    const confirmar = window.confirm('¿Seguro que querés eliminar este pedido? También se eliminarán sus líneas y pagos.')
    if (!confirmar) return

    await supabase.from('pagos').delete().eq('id_pedido', id)
    await supabase.from('detalle_pedido').delete().eq('id_pedido', id)

    const { error } = await supabase.from('pedidos').delete().eq('id_pedido', id)

    if (error) {
      alert('No se pudo eliminar el pedido.\n\nDetalle: ' + error.message)
    } else {
      cargarPedidos()
    }
  }

  function nombreCliente(pedido) {
    if (pedido.clientes?.cliente_anonimo === 'S') return pedido.descripcion || '— Cliente anónimo —'
    return pedido.clientes?.descripcion || pedido.descripcion || '—'
  }

  const pedidosFiltrados = textoBusqueda.trim()
    ? pedidos.filter((p) => normalizar(nombreCliente(p)).includes(normalizar(textoBusqueda)))
    : pedidos

  if (vista === 'detalle') {
    return (
      <DetallePedido
        pedido={pedidoActual}
        onVolver={() => {
          setVista('lista')
          cargarPedidos()
        }}
      />
    )
  }

  return (
    <div className="modulo">
      <h2>Pedidos</h2>

      <div className="acciones-superiores">
        <button className="btn-primario" onClick={iniciarNuevo}>
          + Nuevo Pedido
        </button>
      </div>

      <div className="campo-buscador">
        <input
          type="text"
          placeholder="🔎 Buscar por cliente..."
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
              <th>Cliente</th>
              <th>Fecha pedido</th>
              <th>Fecha entrega</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {pedidosFiltrados.length === 0 && (
              <tr>
                <td colSpan="5">No hay pedidos registrados.</td>
              </tr>
            )}
            {pedidosFiltrados.map((p) => (
              <tr key={p.id_pedido}>
                <td>{p.id_pedido}</td>
                <td>{nombreCliente(p)}</td>
                <td>{formatearFecha(p.fecha_pedido)}</td>
                <td>{formatearFecha(p.fecha_entrega)}</td>
                <td>
                  <button className="btn-link" onClick={() => abrirPedido(p)}>
                    Ver / Editar
                  </button>
                  <button className="btn-link btn-eliminar" onClick={() => eliminarPedido(p.id_pedido)}>
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
// SUBCOMPONENTE: Detalle de pedido (cabecera + líneas + pagos)
// ============================================================
function DetallePedido({ pedido, onVolver }) {
  // ---------- Cabecera ----------
  const [clientes, setClientes] = useState([])
  const [textoBuscarCliente, setTextoBuscarCliente] = useState('')
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null)

  const [idCliente, setIdCliente] = useState(pedido.id_cliente)
  const [descripcion, setDescripcion] = useState(pedido.descripcion || '')
  const [domicilio, setDomicilio] = useState(pedido.domicilio || '')
  const [telefono, setTelefono] = useState(pedido.telefono || '')
  const [fechaPedido] = useState(pedido.fecha_pedido?.slice(0, 10) || new Date().toISOString().slice(0, 10))
  const [fechaEntrega, setFechaEntrega] = useState(pedido.fecha_entrega?.slice(0, 10) || '')
  const [guardandoCabecera, setGuardandoCabecera] = useState(false)

  // ---------- Detalle (líneas) ----------
  const [lineas, setLineas] = useState([])
  const [cargandoLineas, setCargandoLineas] = useState(true)

  const [productos, setProductos] = useState([])
  const [combos, setCombos] = useState([])
  const [tipoItem, setTipoItem] = useState('producto')
  const [textoBuscarItem, setTextoBuscarItem] = useState('')
  const [itemSeleccionado, setItemSeleccionado] = useState(null)
  const [cantidadItem, setCantidadItem] = useState('1')
  const [precioRealItem, setPrecioRealItem] = useState('')
  const [precioVentaItem, setPrecioVentaItem] = useState('')
  const [buscandoPrecio, setBuscandoPrecio] = useState(false)

  // ---------- Pagos ----------
  const [pagos, setPagos] = useState([])
  const [cargandoPagos, setCargandoPagos] = useState(true)
  const [tipoPago, setTipoPago] = useState('SE')
  const [importePago, setImportePago] = useState('')
  const [mediosPago, setMediosPago] = useState([])
  const [medioPago, setMedioPago] = useState('')

  useEffect(() => {
    cargarClientes()
    cargarProductos()
    cargarCombosDisponibles()
    cargarMediosPago()
    if (pedido.id_pedido) {
      cargarLineas()
      cargarPagos()
    } else {
      setCargandoLineas(false)
      setCargandoPagos(false)
    }
  }, [])

  function normalizar(texto) {
    return (texto || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  }

  function formatearMoneda(valor) {
    if (valor === null || valor === undefined || isNaN(valor)) return '—'
    return new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(valor)
  }

  function formatearFecha(fecha) {
    if (!fecha) return ''
    return new Date(fecha).toLocaleDateString('es-AR')
  }

  // ---------- Carga de datos auxiliares ----------
  async function cargarClientes() {
    const { data } = await supabase.from('clientes').select('*')
    setClientes(data || [])

    if (pedido.id_cliente) {
      const actual = (data || []).find((c) => c.id_cliente === pedido.id_cliente)
      if (actual) {
        setClienteSeleccionado(actual)
        setTextoBuscarCliente(actual.cliente_anonimo === 'S' ? '— Cliente anónimo —' : actual.descripcion)
      }
    }
  }

  async function cargarProductos() {
    const { data } = await supabase.from('productos').select('*').order('descripcion')
    setProductos(data || [])
  }

  async function cargarCombosDisponibles() {
    const { data } = await supabase.from('combos').select('*').order('descripcion')
    setCombos(data || [])
  }

  async function cargarMediosPago() {
    const { data } = await supabase.from('medios_pagos').select('*').order('descripcion')
    setMediosPago(data || [])
    if (data && data.length > 0) {
      setMedioPago(data[0].descripcion)
    }
  }

  // ---------- Lógica de cliente ----------
  function clienteEsAnonimo(cliente) {
    return cliente?.cliente_anonimo === 'S'
  }

  const clientesFiltrados = textoBuscarCliente.trim()
    ? clientes.filter((c) => {
        const texto = clienteEsAnonimo(c) ? 'cliente anonimo' : c.descripcion
        return normalizar(texto).includes(normalizar(textoBuscarCliente))
      })
    : []

  function seleccionarCliente(cliente) {
    setClienteSeleccionado(cliente)
    setIdCliente(cliente.id_cliente)

    if (clienteEsAnonimo(cliente)) {
      setTextoBuscarCliente('— Cliente anónimo —')
      setDescripcion('')
      setDomicilio('')
      setTelefono('')
    } else {
      setTextoBuscarCliente(cliente.descripcion)
      setDescripcion(cliente.descripcion)
      setDomicilio(cliente.domicilio || '')
      setTelefono(cliente.telefono || '')
    }
  }

  // Busca un cliente anónimo genérico existente, o lo crea si no hay ninguno
  async function obtenerOcrearClienteAnonimoGenerico() {
    const { data: existentes } = await supabase
      .from('clientes')
      .select('*')
      .eq('cliente_anonimo', 'S')
      .limit(1)

    if (existentes && existentes.length > 0) {
      return existentes[0].id_cliente
    }

    const { data: nuevo, error } = await supabase
      .from('clientes')
      .insert({ cliente_anonimo: 'S', descripcion: null, domicilio: null, telefono: null })
      .select()
      .single()

    if (error) {
      alert('Error al crear el cliente anónimo genérico: ' + error.message)
      return null
    }

    return nuevo.id_cliente
  }

  // ---------- Guardar cabecera ----------
  async function guardarCabecera() {
    if (!fechaEntrega) {
      alert('La fecha de entrega es obligatoria')
      return null
    }

    const sinClienteSeleccionado = !idCliente
    const esAnonimo = clienteEsAnonimo(clienteSeleccionado)

    if ((sinClienteSeleccionado || esAnonimo) && !descripcion.trim()) {
      alert('La descripción (nombre) es obligatoria cuando no hay un cliente identificado seleccionado')
      return null
    }

    setGuardandoCabecera(true)

    let idClienteFinal = idCliente

    if (sinClienteSeleccionado) {
      idClienteFinal = await obtenerOcrearClienteAnonimoGenerico()
      if (!idClienteFinal) {
        setGuardandoCabecera(false)
        return null
      }
    }

    const registro = {
      id_cliente: idClienteFinal,
      descripcion: (sinClienteSeleccionado || esAnonimo) ? descripcion : clienteSeleccionado.descripcion,
      domicilio: (sinClienteSeleccionado || esAnonimo) ? (domicilio || null) : clienteSeleccionado.domicilio,
      telefono: (sinClienteSeleccionado || esAnonimo) ? (telefono || null) : clienteSeleccionado.telefono,
      fecha_pedido: fechaPedido,
      fecha_entrega: fechaEntrega,
    }

    let idResultante = pedido.id_pedido

    if (pedido.id_pedido) {
      const { error } = await supabase.from('pedidos').update(registro).eq('id_pedido', pedido.id_pedido)
      if (error) {
        alert('Error al guardar: ' + error.message)
        setGuardandoCabecera(false)
        return null
      }
    } else {
      const { data, error } = await supabase.from('pedidos').insert(registro).select().single()
      if (error) {
        alert('Error al guardar: ' + error.message)
        setGuardandoCabecera(false)
        return null
      }
      idResultante = data.id_pedido
    }

    setGuardandoCabecera(false)
    return idResultante
  }

  async function handleGuardarCabecera() {
    const id = await guardarCabecera()
    if (id) {
      const esNuevo = !pedido.id_pedido
      pedido.id_pedido = id
      alert(esNuevo ? 'Pedido guardado. Ya podés agregar productos/combos y registrar pagos.' : 'Pedido actualizado correctamente')
      if (esNuevo) {
        await cargarLineas()
        await cargarPagos()
        setCargandoLineas(false)
        setCargandoPagos(false)
      }
    }
  }

  // ---------- Lógica de líneas (detalle_pedido) ----------
  async function cargarLineas() {
    setCargandoLineas(true)
    const { data, error } = await supabase
      .from('detalle_pedido')
      .select('*, productos(descripcion), combos(descripcion)')
      .eq('id_pedido', pedido.id_pedido)
      .order('secuencia', { ascending: true })

    if (!error) {
      setLineas(data)
    }
    setCargandoLineas(false)
  }

  const itemsDisponibles = tipoItem === 'producto' ? productos : combos
  const itemsFiltrados = textoBuscarItem.trim()
    ? itemsDisponibles.filter((i) => normalizar(i.descripcion).includes(normalizar(textoBuscarItem)))
    : []

  function extraerCantidadPresentacion(presentacion) {
    const match = presentacion.match(/[\d.,]+/)
    if (!match) return null
    return parseFloat(match[0].replace(',', '.'))
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

  async function calcularCostoReceta(idReceta) {
    const { data: detalle, error } = await supabase.from('detalle_receta').select('*').eq('id_receta', idReceta)
    if (error || !detalle) return null

    let total = 0
    for (const ing of detalle) {
      const costo = await obtenerCostoVigente(ing.id_materia_prima)
      if (costo) {
        const cantidadPresentacion = extraerCantidadPresentacion(costo.presentacion)
        if (cantidadPresentacion && cantidadPresentacion > 0) {
          total += (parseFloat(costo.precio) / cantidadPresentacion) * parseFloat(ing.cantidad)
        }
      }
    }
    return total
  }

  async function obtenerPrecioVigenteProducto(idProducto) {
    const hoy = new Date().toISOString().slice(0, 10)
    const { data, error } = await supabase
      .from('precios')
      .select('*')
      .eq('id_producto', idProducto)
      .lte('fecha_inicio', hoy)
      .gte('fecha_fin', hoy)
      .order('fecha_inicio', { ascending: false })
      .limit(1)

    if (error || !data || data.length === 0) return null
    return data[0]
  }

  async function seleccionarItem(item) {
    setItemSeleccionado(item)
    setTextoBuscarItem(item.descripcion)
    setBuscandoPrecio(true)
    setPrecioRealItem('')
    setPrecioVentaItem('')

    if (tipoItem === 'producto') {
      const precioVigente = await obtenerPrecioVigenteProducto(item.id_producto)
      if (precioVigente) {
        setPrecioRealItem(precioVigente.precio_venta)
        setPrecioVentaItem(precioVigente.precio_venta)
      }
    } else {
      if (item.precio) {
        setPrecioRealItem(item.precio)
        setPrecioVentaItem(item.precio)
      }
    }

    setBuscandoPrecio(false)
  }

  async function agregarLinea() {
    if (!pedido.id_pedido) {
      alert('Primero guardá los datos generales del pedido antes de agregar productos o combos')
      return
    }
    if (!itemSeleccionado || !cantidadItem || !precioVentaItem) {
      alert('Seleccioná un producto/combo, indicá la cantidad y verificá el precio')
      return
    }

    const siguienteSecuencia = lineas.length > 0 ? Math.max(...lineas.map((l) => l.secuencia)) + 1 : 1

    const registro = {
      id_pedido: pedido.id_pedido,
      secuencia: siguienteSecuencia,
      id_producto: tipoItem === 'producto' ? itemSeleccionado.id_producto : null,
      id_combo: tipoItem === 'combo' ? itemSeleccionado.id_combo : null,
      cantidad: parseFloat(cantidadItem),
      precio_real: parseFloat(precioRealItem || 0),
      precio_venta: parseFloat(precioVentaItem),
    }

    const { error } = await supabase.from('detalle_pedido').insert(registro)

    if (error) {
      alert('Error al agregar la línea: ' + error.message)
    } else {
      setItemSeleccionado(null)
      setTextoBuscarItem('')
      setCantidadItem('1')
      setPrecioRealItem('')
      setPrecioVentaItem('')
      cargarLineas()
    }
  }

  async function quitarLinea(secuencia) {
    const confirmar = window.confirm('¿Quitar esta línea del pedido?')
    if (!confirmar) return

    const { error } = await supabase
      .from('detalle_pedido')
      .delete()
      .eq('id_pedido', pedido.id_pedido)
      .eq('secuencia', secuencia)

    if (error) {
      alert('Error al quitar la línea: ' + error.message)
    } else {
      cargarLineas()
    }
  }

  function descripcionLinea(linea) {
    return linea.productos?.descripcion || linea.combos?.descripcion || '—'
  }

  // ---------- Lógica de pagos ----------
  async function cargarPagos() {
    setCargandoPagos(true)
    const { data, error } = await supabase
      .from('pagos')
      .select('*')
      .eq('id_pedido', pedido.id_pedido)
      .order('secuencia', { ascending: true })

    if (!error) {
      setPagos(data)
    }
    setCargandoPagos(false)
  }

  function manejarCambioTipoPago(nuevoTipo) {
    setTipoPago(nuevoTipo)
    if (nuevoTipo === 'PP' || nuevoTipo === 'PT') {
      setImportePago(saldoPendiente > 0 ? saldoPendiente.toFixed(2) : '')
    } else {
      setImportePago('')
    }
  }

  async function agregarPago() {
    if (!pedido.id_pedido) {
      alert('Primero guardá los datos generales del pedido')
      return
    }

    if (saldoPendiente <= 0) {
      alert('Este pedido ya está totalmente pagado. No se pueden registrar más pagos.')
      return
    }

    const importe = parseFloat(importePago)

    if (!importePago || importe <= 0) {
      alert('Ingresá un importe válido')
      return
    }

    if (tipoPago === 'SE' && importe >= totalPedido) {
      alert('La seña debe ser menor al total del pedido.')
      return
    }

    if ((tipoPago === 'PP' || tipoPago === 'PT') && importe > saldoPendiente) {
      alert(`El importe no puede superar el saldo pendiente ($${formatearMoneda(saldoPendiente)}).`)
      return
    }

    if (totalPagado + importe > totalPedido) {
      alert('La suma de los pagos no puede superar el total del pedido.')
      return
    }

    const siguienteSecuencia = pagos.length > 0 ? Math.max(...pagos.map((p) => p.secuencia)) + 1 : 1

    const { error } = await supabase.from('pagos').insert({
      id_pedido: pedido.id_pedido,
      secuencia: siguienteSecuencia,
      tipo: tipoPago,
      importe: importe,
      medio_pago: medioPago,
      fecha_pago: new Date().toISOString(),
    })

    if (error) {
      alert('Error al registrar el pago: ' + error.message)
    } else {
      setImportePago('')
      cargarPagos()
    }
  }

  async function eliminarPago(secuencia) {
    const confirmar = window.confirm('¿Eliminar este pago?')
    if (!confirmar) return

    const { error } = await supabase
      .from('pagos')
      .delete()
      .eq('id_pedido', pedido.id_pedido)
      .eq('secuencia', secuencia)

    if (error) {
      alert('Error al eliminar el pago: ' + error.message)
    } else {
      cargarPagos()
    }
  }

  function nombreTipoPago(tipo) {
    return { PT: 'Pago Total', SE: 'Seña', PP: 'Pago Parcial' }[tipo] || tipo
  }

  // ---------- Totales ----------
  const totalPedido = lineas.reduce((acc, l) => acc + parseFloat(l.precio_venta) * parseFloat(l.cantidad), 0)
  const totalPagado = pagos.reduce((acc, p) => acc + parseFloat(p.importe), 0)
  const saldoPendiente = totalPedido - totalPagado

  // ---------- GENERACIÓN DE PDF (Comanda) ----------
  function generarComanda() {
    if (lineas.length === 0) {
      alert('Este pedido no tiene productos o combos cargados todavía.')
      return
    }

    const doc = new jsPDF()
    const margenIzq = 20
    let y = 22

    doc.setFont('times', 'bold')
    doc.setFontSize(22)
    doc.text('Comanda', 105, y, { align: 'center' })
    y += 10

    doc.setFont('times', 'normal')
    doc.setFontSize(10)
    doc.text(`Pedido N°: ${pedido.id_pedido}`, margenIzq, y)
    y += 8

    doc.setLineWidth(0.4)
    doc.line(margenIzq, y, 190, y)
    y += 10

    doc.setFont('times', 'bold')
    doc.setFontSize(13)
    doc.text('Datos del cliente', margenIzq, y)
    y += 7

    doc.setFont('times', 'normal')
    doc.setFontSize(11)
    doc.text(`Nombre: ${descripcion || '-'}`, margenIzq, y)
    y += 6
    doc.text(`Domicilio: ${domicilio || '-'}`, margenIzq, y)
    y += 6
    doc.text(`Teléfono: ${telefono || '-'}`, margenIzq, y)
    y += 10

    doc.setFont('times', 'bold')
    doc.setFontSize(13)
    doc.text('Fechas', margenIzq, y)
    y += 7

    doc.setFont('times', 'normal')
    doc.setFontSize(11)
    doc.text(`Fecha de pedido: ${formatearFecha(fechaPedido)}`, margenIzq, y)
    y += 6
    doc.text(`Fecha de entrega: ${formatearFecha(fechaEntrega)}`, margenIzq, y)
    y += 8

    doc.line(margenIzq, y, 190, y)
    y += 8

    doc.setFont('times', 'bold')
    doc.setFontSize(13)
    doc.text('Detalle del pedido', margenIzq, y)
    y += 6

    const filas = lineas.map((l) => [
      String(l.cantidad),
      l.productos?.descripcion || l.combos?.descripcion || '—',
      l.id_producto ? 'Producto' : 'Combo',
    ])

    autoTable(doc, {
      startY: y,
      margin: { left: margenIzq, right: 20 },
      head: [['Cantidad', 'Descripción', 'Tipo']],
      body: filas,
      theme: 'grid',
      styles: {
        font: 'times',
        fontSize: 11,
        cellPadding: 3,
        lineWidth: 0.3,
        lineColor: [180, 180, 180],
      },
      headStyles: {
        fillColor: [232, 118, 92],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        lineWidth: 0.3,
        lineColor: [180, 180, 180],
      },
      columnStyles: {
        0: { cellWidth: 25, halign: 'center' },
        2: { cellWidth: 30 },
      },
    })

    const finalY = doc.lastAutoTable.finalY + 10

    doc.setFontSize(9)
    doc.setFont('times', 'italic')
    doc.text('Documento generado a modo de remito interno — sin valores monetarios.', margenIzq, finalY)

    const nombreArchivo = `Comanda_${(descripcion || 'Cliente').replace(/\s+/g, '_')}.pdf`
    doc.save(nombreArchivo)
  }

  return (
    <div className="modulo">
      <button className="btn-volver" onClick={onVolver}>
        ← Volver a Pedidos
      </button>

      <h2>{pedido.id_pedido ? `Editar Pedido #${pedido.id_pedido}` : 'Nuevo Pedido'}</h2>

      {pedido.id_pedido && lineas.length > 0 && (
        <div className="acciones-superiores">
          <button className="btn-secundario" onClick={generarComanda}>
            🧾 Generar Comanda (PDF)
          </button>
        </div>
      )}

      {/* ===== CABECERA ===== */}
      <div className="subseccion">
        <h3>Datos del pedido</h3>
        <div className="formulario formulario-costos">
          <div className="campo" style={{ flex: 2, position: 'relative' }}>
            <label>Cliente (opcional)</label>
            <input
              type="text"
              placeholder="🔎 Buscar cliente o dejar en blanco..."
              value={textoBuscarCliente}
              onChange={(e) => {
                setTextoBuscarCliente(e.target.value)
                setClienteSeleccionado(null)
                setIdCliente(null)
              }}
              disabled={!!pedido.id_pedido}
            />
            {textoBuscarCliente && !clienteSeleccionado && clientesFiltrados.length > 0 && !pedido.id_pedido && (
              <div className="dropdown-resultados">
                {clientesFiltrados.map((c) => (
                  <div key={c.id_cliente} className="dropdown-item" onClick={() => seleccionarCliente(c)}>
                    {clienteEsAnonimo(c) ? `— Cliente anónimo (#${c.id_cliente}) —` : c.descripcion}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="campo">
            <label>Fecha de pedido</label>
            <input type="date" value={fechaPedido} disabled />
          </div>

          <div className="campo">
            <label>Fecha de entrega</label>
            <input type="date" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} />
          </div>
        </div>

        {(!clienteSeleccionado || clienteEsAnonimo(clienteSeleccionado)) && (
          <div className="formulario formulario-costos" style={{ marginTop: '10px' }}>
            <div className="campo" style={{ flex: 2 }}>
              <label>Nombre (obligatorio)</label>
              <input
                type="text"
                placeholder="Ej: Juan Pérez"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                disabled={!!pedido.id_pedido}
              />
            </div>
            <div className="campo">
              <label>Domicilio (opcional)</label>
              <input
                type="text"
                value={domicilio}
                onChange={(e) => setDomicilio(e.target.value)}
                disabled={!!pedido.id_pedido}
              />
            </div>
            <div className="campo">
              <label>Teléfono (opcional)</label>
              <input
                type="text"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                disabled={!!pedido.id_pedido}
              />
            </div>
          </div>
        )}

        {clienteSeleccionado && !clienteEsAnonimo(clienteSeleccionado) && (
          <p className="ayuda-vigencia" style={{ marginTop: '10px' }}>
            📍 {clienteSeleccionado.domicilio || 'Sin domicilio'} &nbsp;|&nbsp; 📞 {clienteSeleccionado.telefono || 'Sin teléfono'}
          </p>
        )}

        <div className="campo-acciones" style={{ marginTop: '14px' }}>
          <button className="btn-primario" onClick={handleGuardarCabecera} disabled={guardandoCabecera}>
            {guardandoCabecera ? 'Guardando...' : 'Guardar datos del pedido'}
          </button>
        </div>
      </div>

      {/* ===== DETALLE (LÍNEAS) ===== */}
      {pedido.id_pedido && (
        <div className="subseccion">
          <h3>Productos / Combos del pedido</h3>

          <div className="formulario">
            <select
              value={tipoItem}
              onChange={(e) => {
                setTipoItem(e.target.value)
                setItemSeleccionado(null)
                setTextoBuscarItem('')
              }}
              style={{ maxWidth: '130px' }}
            >
              <option value="producto">Producto</option>
              <option value="combo">Combo</option>
            </select>

            <div style={{ position: 'relative', flex: 2 }}>
              <input
                type="text"
                placeholder={`🔎 Buscar ${tipoItem}...`}
                value={textoBuscarItem}
                onChange={(e) => {
                  setTextoBuscarItem(e.target.value)
                  setItemSeleccionado(null)
                }}
              />
              {textoBuscarItem && !itemSeleccionado && itemsFiltrados.length > 0 && (
                <div className="dropdown-resultados">
                  {itemsFiltrados.map((i) => (
                    <div
                      key={tipoItem === 'producto' ? i.id_producto : i.id_combo}
                      className="dropdown-item"
                      onClick={() => seleccionarItem(i)}
                    >
                      {i.descripcion}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <input
              type="number"
              step="1"
              placeholder="Cant."
              value={cantidadItem}
              onChange={(e) => setCantidadItem(e.target.value)}
              style={{ maxWidth: '90px' }}
            />

            <input
              type="number"
              step="0.01"
              placeholder="Precio venta"
              value={precioVentaItem}
              onChange={(e) => setPrecioVentaItem(e.target.value)}
              style={{ maxWidth: '140px' }}
              disabled={buscandoPrecio}
            />

            <button className="btn-primario" onClick={agregarLinea}>
              + Agregar
            </button>
          </div>

          {itemSeleccionado && !buscandoPrecio && (
            <p className="ayuda-vigencia">
              💡 Precio sugerido (vigente): ${formatearMoneda(precioRealItem)}. Podés ajustarlo en el campo "Precio venta" antes de agregar.
            </p>
          )}

          {cargandoLineas && <p>Cargando líneas del pedido...</p>}

          {!cargandoLineas && (
            <table className="tabla">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Descripción</th>
                  <th>Cantidad</th>
                  <th>Precio real</th>
                  <th>Precio venta</th>
                  <th>Subtotal</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {lineas.length === 0 && (
                  <tr>
                    <td colSpan="7">Todavía no agregaste productos o combos.</td>
                  </tr>
                )}
                {lineas.map((l) => (
                  <tr key={l.secuencia}>
                    <td>{l.id_producto ? 'Producto' : 'Combo'}</td>
                    <td>{descripcionLinea(l)}</td>
                    <td>{l.cantidad}</td>
                    <td>${formatearMoneda(l.precio_real)}</td>
                    <td>${formatearMoneda(l.precio_venta)}</td>
                    <td>${formatearMoneda(parseFloat(l.precio_venta) * parseFloat(l.cantidad))}</td>
                    <td>
                      <button className="btn-link btn-eliminar" onClick={() => quitarLinea(l.secuencia)}>
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="costo-total">
            💰 Total del pedido: <strong>${formatearMoneda(totalPedido)}</strong>
          </div>
        </div>
      )}

      {/* ===== PAGOS ===== */}
      {pedido.id_pedido && (
        <div className="subseccion">
          <h3>Pagos</h3>

          {saldoPendiente <= 0 ? (
            <div className="aviso-ok">✅ Este pedido está totalmente pagado. No se pueden registrar más pagos.</div>
          ) : (
            <div className="formulario">
              <div className="campo">
                <label>Tipo</label>
                <select value={tipoPago} onChange={(e) => manejarCambioTipoPago(e.target.value)}>
                  <option value="SE">Seña</option>
                  <option value="PP">Pago Parcial</option>
                  <option value="PT">Saldo Restante</option>
                </select>
              </div>
              <div className="campo">
                <label>Importe</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={importePago}
                  onChange={(e) => setImportePago(e.target.value)}
                />
              </div>
              <div className="campo">
                <label>Medio de pago</label>
                <select value={medioPago} onChange={(e) => setMedioPago(e.target.value)}>
                  {mediosPago.map((m) => (
                    <option key={m.id_medio_pago} value={m.descripcion}>
                      {m.descripcion}
                    </option>
                  ))}
                </select>
              </div>
              <div className="campo-acciones">
                <button className="btn-primario" onClick={agregarPago}>
                  + Registrar pago
                </button>
              </div>
            </div>
          )}

          {cargandoPagos && <p>Cargando pagos...</p>}

          {!cargandoPagos && (
            <table className="tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Importe</th>
                  <th>Medio de pago</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pagos.length === 0 && (
                  <tr>
                    <td colSpan="5">No hay pagos registrados.</td>
                  </tr>
                )}
                {pagos.map((p) => (
                  <tr key={p.secuencia}>
                    <td>{formatearFecha(p.fecha_pago)}</td>
                    <td>{nombreTipoPago(p.tipo)}</td>
                    <td>${formatearMoneda(p.importe)}</td>
                    <td>{p.medio_pago}</td>
                    <td>
                      <button className="btn-link btn-eliminar" onClick={() => eliminarPago(p.secuencia)}>
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className={saldoPendiente > 0 ? 'aviso-similar' : 'aviso-ok'}>
            💰 Total: ${formatearMoneda(totalPedido)} &nbsp;|&nbsp; Pagado: ${formatearMoneda(totalPagado)} &nbsp;|&nbsp;
            Saldo pendiente: <strong>${formatearMoneda(saldoPendiente)}</strong>
          </div>
        </div>
      )}
    </div>
  )
}

export default Pedidos