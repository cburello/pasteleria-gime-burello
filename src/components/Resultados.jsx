import { useState, useEffect, Fragment } from 'react'
import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'
import { supabase } from '../lib/supabase'
import { useNotificaciones } from '../hooks/useNotificaciones'

const COLOR_MARCA = 'FFE8765C'
const COLOR_MARCA_OSCURO = 'FFD4624A'
const COLOR_CREMA = 'FFFFF5F2'
const COLOR_TEXTO = 'FF4A2C2A'
const COLOR_TEXTO_SUAVE = 'FF8A6A66'
const COLOR_BLANCO = 'FFFFFFFF'
const COLOR_VERDE = 'FF2D6A35'
const COLOR_ROJO = 'FFC0392B'

function normalizarTexto(texto) {
  return (texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

function clasificarGasto(descripcionConcepto) {
  const normalizado = normalizarTexto(descripcionConcepto)
  if (normalizado.includes('materia prima')) return 'Materia Prima'
  if (normalizado.includes('papeler')) return 'Papelería'
  return 'Otros'
}

function formatearFechaCorta(fecha) {
  if (!fecha) return ''
  const [anio, mes, dia] = fecha.slice(0, 10).split('-')
  return `${dia}/${mes}/${anio}`
}

const BORDE_FINO = {
  top: { style: 'thin', color: { argb: 'FFE8D5CF' } },
  left: { style: 'thin', color: { argb: 'FFE8D5CF' } },
  bottom: { style: 'thin', color: { argb: 'FFE8D5CF' } },
  right: { style: 'thin', color: { argb: 'FFE8D5CF' } },
}

const COLUMNAS_HOJA_MEDIO = 5

// Hoja por medio de pago con formato "extracto bancario": una sola lista cronológica
// de todos los movimientos (pedidos, otros ingresos, gastos y retiros), con columnas
// Ingreso / Egreso y saldo acumulado por fila, pensada para conciliar contra el banco.
function construirHojaMedio(libro, datos, periodoTexto) {
  const { medio, movimientos, saldoInicial, saldoFinal } = datos

  const nombreHoja = medio.descripcion.length > 31 ? medio.descripcion.slice(0, 31) : medio.descripcion
  const hoja = libro.addWorksheet(nombreHoja, {
    properties: { tabColor: { argb: COLOR_MARCA } },
    views: [{ showGridLines: false }],
  })

  hoja.columns = [{ width: 12 }, { width: 56 }, { width: 15 }, { width: 15 }, { width: 15 }]

  let fila = 1

  hoja.mergeCells(fila, 1, fila, COLUMNAS_HOJA_MEDIO)
  const celdaTitulo = hoja.getCell(fila, 1)
  celdaTitulo.value = `${medio.descripcion} — ${periodoTexto}`
  celdaTitulo.font = { bold: true, size: 15, color: { argb: COLOR_BLANCO } }
  celdaTitulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_MARCA } }
  celdaTitulo.alignment = { vertical: 'middle', horizontal: 'center' }
  hoja.getRow(fila).height = 28
  fila += 2

  const encabezados = ['Fecha', 'Detalle', 'Ingreso', 'Egreso', 'Saldo']
  encabezados.forEach((texto, i) => {
    const celda = hoja.getCell(fila, i + 1)
    celda.value = texto
    celda.font = { bold: true, color: { argb: COLOR_BLANCO } }
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_TEXTO } }
    celda.border = BORDE_FINO
    if (i >= 2) celda.alignment = { horizontal: 'right' }
  })
  hoja.getRow(fila).height = 20
  fila++

  hoja.getCell(fila, 2).value = 'Saldo inicial'
  hoja.getCell(fila, 2).font = { bold: true, color: { argb: COLOR_TEXTO } }
  hoja.getCell(fila, 5).value = saldoInicial
  hoja.getCell(fila, 5).numFmt = '#,##0.00'
  hoja.getCell(fila, 5).font = { bold: true, color: { argb: COLOR_TEXTO } }
  for (let c = 1; c <= COLUMNAS_HOJA_MEDIO; c++) {
    hoja.getCell(fila, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_CREMA } }
    hoja.getCell(fila, c).border = BORDE_FINO
  }
  fila++

  if (movimientos.length === 0) {
    hoja.mergeCells(fila, 1, fila, COLUMNAS_HOJA_MEDIO)
    const celda = hoja.getCell(fila, 1)
    celda.value = 'Sin movimientos en el período.'
    celda.font = { italic: true, color: { argb: COLOR_TEXTO_SUAVE } }
    fila++
  } else {
    let saldoAcumulado = saldoInicial
    movimientos.forEach((m, idx) => {
      saldoAcumulado += (m.ingreso || 0) - (m.egreso || 0)
      const valores = [formatearFechaCorta(m.fecha), m.detalle, m.ingreso, m.egreso, saldoAcumulado]
      valores.forEach((v, i) => {
        const celda = hoja.getCell(fila, i + 1)
        if (v !== null && v !== undefined) celda.value = v
        celda.border = BORDE_FINO
        if (i >= 2) celda.numFmt = '#,##0.00'
        if (i === 2 && m.ingreso) celda.font = { color: { argb: COLOR_VERDE } }
        if (i === 3 && m.egreso) celda.font = { color: { argb: COLOR_ROJO } }
        if (i === 4 && saldoAcumulado < 0) celda.font = { color: { argb: COLOR_ROJO } }
        if (idx % 2 === 1) celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_CREMA } }
      })
      fila++
    })

    const totalIngresos = movimientos.reduce((acc, m) => acc + (m.ingreso || 0), 0)
    const totalEgresos = movimientos.reduce((acc, m) => acc + (m.egreso || 0), 0)
    hoja.getCell(fila, 2).value = `Totales del período (${movimientos.length} movimientos)`
    hoja.getCell(fila, 2).font = { bold: true, color: { argb: COLOR_TEXTO } }
    hoja.getCell(fila, 3).value = totalIngresos
    hoja.getCell(fila, 4).value = totalEgresos
    for (const c of [3, 4]) {
      hoja.getCell(fila, c).numFmt = '#,##0.00'
      hoja.getCell(fila, c).font = { bold: true, color: { argb: COLOR_TEXTO } }
    }
    for (let c = 1; c <= COLUMNAS_HOJA_MEDIO; c++) {
      hoja.getCell(fila, c).border = { top: { style: 'thin', color: { argb: COLOR_MARCA } } }
    }
    fila++
  }

  hoja.getCell(fila, 2).value = 'Saldo final'
  hoja.getCell(fila, 2).font = { bold: true, size: 13, color: { argb: COLOR_BLANCO } }
  for (let c = 1; c <= COLUMNAS_HOJA_MEDIO; c++) {
    hoja.getCell(fila, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_MARCA_OSCURO } }
  }
  const celdaSaldoFinalValor = hoja.getCell(fila, 5)
  celdaSaldoFinalValor.value = saldoFinal
  celdaSaldoFinalValor.numFmt = '#,##0.00'
  celdaSaldoFinalValor.font = { bold: true, size: 13, color: { argb: COLOR_BLANCO } }
  hoja.getRow(fila).height = 24
}

function construirHojaConsolidado(libro, datosPorMedio, periodoTexto) {
  const hoja = libro.addWorksheet('Consolidado', {
    properties: { tabColor: { argb: COLOR_TEXTO } },
    views: [{ showGridLines: false }],
  })

  hoja.columns = [{ width: 22 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }]

  hoja.mergeCells(1, 1, 1, 6)
  const titulo = hoja.getCell(1, 1)
  titulo.value = `Resultados consolidados — ${periodoTexto}`
  titulo.font = { bold: true, size: 15, color: { argb: COLOR_BLANCO } }
  titulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_TEXTO } }
  titulo.alignment = { vertical: 'middle', horizontal: 'center' }
  hoja.getRow(1).height = 28

  const filaEncabezado = 3
  const encabezados = ['Medio de pago', 'Saldo inicial', 'Ingresos', 'Gastos', 'Retiros', 'Saldo final']
  encabezados.forEach((texto, i) => {
    const celda = hoja.getCell(filaEncabezado, i + 1)
    celda.value = texto
    celda.font = { bold: true, color: { argb: COLOR_BLANCO } }
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_MARCA } }
    celda.alignment = { horizontal: 'center' }
    celda.border = BORDE_FINO
  })

  let fila = filaEncabezado + 1
  let totInicial = 0, totIngresos = 0, totGastos = 0, totRetiros = 0, totFinal = 0

  datosPorMedio.forEach((d, idx) => {
    const valores = [d.medio.descripcion, d.saldoInicial, d.totalIngresos, d.totalGastos, d.totalRetiros, d.saldoFinal]
    valores.forEach((v, i) => {
      const celda = hoja.getCell(fila, i + 1)
      celda.value = v
      celda.border = BORDE_FINO
      if (i > 0) celda.numFmt = '#,##0.00'
      if (idx % 2 === 1) celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_CREMA } }
    })
    totInicial += d.saldoInicial
    totIngresos += d.totalIngresos
    totGastos += d.totalGastos
    totRetiros += d.totalRetiros
    totFinal += d.saldoFinal
    fila++
  })

  const valoresTotal = ['TOTAL', totInicial, totIngresos, totGastos, totRetiros, totFinal]
  valoresTotal.forEach((v, i) => {
    const celda = hoja.getCell(fila, i + 1)
    celda.value = v
    celda.font = { bold: true, color: { argb: COLOR_TEXTO } }
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_CREMA } }
    celda.border = { ...BORDE_FINO, top: { style: 'double', color: { argb: COLOR_MARCA } } }
    if (i > 0) celda.numFmt = '#,##0.00'
  })
}

function Resultados() {
  const { mostrarToast, confirmar } = useNotificaciones()
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const [tab, setTab] = useState('abiertos')

  const [filasAbiertas, setFilasAbiertas] = useState([])
  const [periodosCerrados, setPeriodosCerrados] = useState([])
  const [saldos, setSaldos] = useState([])

  const [periodosSeleccionados, setPeriodosSeleccionados] = useState([])
  const [filaExpandida, setFilaExpandida] = useState(null)
  const [datosCrudos, setDatosCrudos] = useState({ ingresos: [], gastos: [], retiros: [] })
  const [cerrandoPeriodo, setCerrandoPeriodo] = useState(false)

  const [saldosNuevos, setSaldosNuevos] = useState({})
  const [guardandoSaldo, setGuardandoSaldo] = useState(null)

  const [periodoReporte, setPeriodoReporte] = useState('')
  const [generandoReportePeriodo, setGenerandoReportePeriodo] = useState(false)

  useEffect(() => {
    cargarDatos()
  }, [])

  function formatearMoneda(valor) {
    if (valor === null || valor === undefined || isNaN(valor)) return '0,00'
    return new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(valor)
  }

  function formatearPorcentaje(valor) {
    if (valor === null || valor === undefined || isNaN(valor)) return '0,0'
    return new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(valor)
  }

  function formatearPeriodo(periodoStr) {
    const [anio, mes] = periodoStr.split('-')
    const nombresMes = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ]
    return `${nombresMes[parseInt(mes) - 1]} ${anio}`
  }

  function mesAnterior(periodoStr) {
    const [anio, mes] = periodoStr.split('-').map(Number)
    const d = new Date(anio, mes - 1, 1)
    d.setMonth(d.getMonth() - 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  function periodoDeFecha(fechaStr) {
    return fechaStr.slice(0, 7)
  }

  async function cargarDatos() {
    setCargando(true)
    setError(null)

    try {
      const { data: resultadosExistentes, error: errorResultados } = await supabase
        .from('resultados')
        .select('*, medios_pagos(descripcion)')
        .order('periodo', { ascending: false })

      if (errorResultados) throw errorResultados

      setPeriodosCerrados(resultadosExistentes || [])

      const { data: saldosData, error: errorSaldos } = await supabase
        .from('saldos')
        .select('*')
        .order('periodo', { ascending: false })

      if (errorSaldos) throw errorSaldos

      setSaldos(saldosData || [])

      const periodosCerradosSet = new Set(
        (resultadosExistentes || []).map((r) => r.periodo.slice(0, 7))
      )

      const { data: ingresos, error: errorIngresos } = await supabase
        .from('ingresos')
        .select('*, medios_pagos(descripcion), conceptos(descripcion), pedidos(fecha_pedido, fecha_entrega, descripcion)')

      if (errorIngresos) throw errorIngresos

      const { data: gastos, error: errorGastos } = await supabase
        .from('gastos')
        .select('*, medios_pagos(descripcion), conceptos(descripcion), proveedores(descripcion)')

      if (errorGastos) throw errorGastos

      const { data: retiros, error: errorRetiros } = await supabase
        .from('retiros')
        .select('*, origen:medios_pagos!retiros_id_medio_pago_origen_fkey(descripcion)')

      if (errorRetiros) throw errorRetiros

      const agrupado = {}

      function agregar(periodo, origen, idMedioPago, descMedioPago, importe) {
        const clave = `${periodo}|${origen}|${idMedioPago}`
        if (!agrupado[clave]) {
          agrupado[clave] = {
            periodo,
            origen,
            id_medio_pago: idMedioPago,
            medio_pago: descMedioPago,
            importe: 0,
          }
        }
        agrupado[clave].importe += parseFloat(importe)
      }

      ;(ingresos || []).forEach((i) => {
        const periodo = periodoDeFecha(i.fecha)
        if (periodosCerradosSet.has(periodo)) return
        agregar(periodo, 'Ingreso', i.id_medio_pago, i.medios_pagos?.descripcion || i.id_medio_pago, i.importe)
      })

      ;(gastos || []).forEach((g) => {
        const periodo = periodoDeFecha(g.fecha)
        if (periodosCerradosSet.has(periodo)) return
        agregar(periodo, 'Gasto', g.id_medio_pago, g.medios_pagos?.descripcion || g.id_medio_pago, g.importe)
      })

      ;(retiros || []).forEach((r) => {
        const periodo = periodoDeFecha(r.fecha)
        if (periodosCerradosSet.has(periodo)) return
        agregar(periodo, 'Retiro', r.id_medio_pago_origen, r.origen?.descripcion || r.id_medio_pago_origen, r.importe)
      })

      // Períodos abiertos: el más antiguo primero (es el próximo que corresponde cerrar)
      const filas = Object.values(agrupado).sort((a, b) => a.periodo.localeCompare(b.periodo))

      setFilasAbiertas(filas)
      setDatosCrudos({ ingresos: ingresos || [], gastos: gastos || [], retiros: retiros || [] })
    } catch (err) {
      setError('Error al cargar los datos: ' + err.message)
    }

    setCargando(false)
  }

  function obtenerDetalle(fila) {
    if (fila.origen === 'Ingreso') {
      return datosCrudos.ingresos.filter(
        (i) => periodoDeFecha(i.fecha) === fila.periodo && i.id_medio_pago === fila.id_medio_pago
      )
    }
    if (fila.origen === 'Gasto') {
      return datosCrudos.gastos.filter(
        (g) => periodoDeFecha(g.fecha) === fila.periodo && g.id_medio_pago === fila.id_medio_pago
      )
    }
    if (fila.origen === 'Retiro') {
      return datosCrudos.retiros.filter(
        (r) => periodoDeFecha(r.fecha) === fila.periodo && r.id_medio_pago_origen === fila.id_medio_pago
      )
    }
    return []
  }

  function togglePeriodo(periodo) {
    setPeriodosSeleccionados((prev) => (prev.includes(periodo) ? [] : [periodo]))
  }

  function periodoMasAntiguoAbierto() {
    if (filasAbiertas.length === 0) return null
    return filasAbiertas[0].periodo
  }

  function saldoAnteriorDeMedio(idMedioPago, periodoLimite) {
    const limite = periodoLimite + '-01'
    return saldos.find((s) => s.id_medio_pago === idMedioPago && s.periodo < limite) || null
  }

  async function obtenerSaldoAnterior(idMedioPago, periodoStr) {
    const primerDiaPeriodo = periodoStr + '-01'
    const { data, error } = await supabase
      .from('saldos')
      .select('*')
      .eq('id_medio_pago', idMedioPago)
      .lt('periodo', primerDiaPeriodo)
      .order('periodo', { ascending: false })
      .limit(1)

    if (error || !data || data.length === 0) return null
    return data[0]
  }

  async function guardarSaldoInicial(idMedioPago) {
    const valor = parseFloat(saldosNuevos[idMedioPago])
    if (isNaN(valor)) {
      mostrarToast('Ingresá un importe válido', 'error')
      return
    }

    const masAntiguo = periodoMasAntiguoAbierto()
    if (!masAntiguo) return

    const periodoBase = mesAnterior(masAntiguo) + '-01'

    setGuardandoSaldo(idMedioPago)

    const { error } = await supabase
      .from('saldos')
      .upsert(
        { periodo: periodoBase, id_medio_pago: idMedioPago, importe: valor },
        { onConflict: 'periodo,id_medio_pago' }
      )

    if (error) {
      mostrarToast('Error al guardar el saldo inicial: ' + error.message, 'error')
    } else {
      mostrarToast('Saldo inicial guardado correctamente.')
      setSaldosNuevos((prev) => ({ ...prev, [idMedioPago]: '' }))
      await cargarDatos()
    }

    setGuardandoSaldo(null)
  }

  async function handleCerrarPeriodo() {
    if (periodosSeleccionados.length === 0) return

    const periodo = periodosSeleccionados[0]

    const masAntiguo = periodoMasAntiguoAbierto()
    if (periodo !== masAntiguo) {
      mostrarToast(
        `No se puede cerrar ${formatearPeriodo(periodo)} porque el período ${formatearPeriodo(masAntiguo)} todavía tiene movimientos sin cerrar. Los períodos se cierran en orden, uno por uno.`,
        'error'
      )
      return
    }

    const hoy = new Date()
    const periodoActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`

    if (periodo >= periodoActual) {
      const confirmadoAdelantado = await confirmar(
        `El período seleccionado aún no llegó al final del mes. ¿Seguro quiere realizar el cierre?`
      )
      if (!confirmadoAdelantado) return
    }

    const confirmado = await confirmar(
      `Se realizará el cierre del período ${formatearPeriodo(periodo)}. ¿Confirma?`
    )
    if (!confirmado) return

    setCerrandoPeriodo(true)

    try {
      const filasDelPeriodo = filasAbiertas.filter((f) => f.periodo === periodo)
      const mediosPagoDelPeriodo = [...new Set(filasDelPeriodo.map((f) => f.id_medio_pago))]

      const saldosAnteriores = {}
      const mediosSinSaldo = []

      for (const idMedioPago of mediosPagoDelPeriodo) {
        const saldo = await obtenerSaldoAnterior(idMedioPago, periodo)
        if (!saldo) {
          mediosSinSaldo.push(idMedioPago)
        } else {
          saldosAnteriores[idMedioPago] = parseFloat(saldo.importe)
        }
      }

      if (mediosSinSaldo.length > 0) {
        mostrarToast(
          'No se puede cerrar el período porque falta el saldo inicial para uno o más medios de pago: ' +
            mediosSinSaldo.join(', ') +
            '. Cargalo en el chip correspondiente, arriba de la tabla.',
          'error'
        )
        setCerrandoPeriodo(false)
        return
      }

      const primerDiaPeriodo = periodo + '-01'

      for (const idMedioPago of mediosPagoDelPeriodo) {
        const filaIngreso = filasDelPeriodo.find((f) => f.origen === 'Ingreso' && f.id_medio_pago === idMedioPago)
        const filaGasto = filasDelPeriodo.find((f) => f.origen === 'Gasto' && f.id_medio_pago === idMedioPago)
        const filaRetiro = filasDelPeriodo.find((f) => f.origen === 'Retiro' && f.id_medio_pago === idMedioPago)

        const totalIngresos = filaIngreso ? filaIngreso.importe : 0
        const totalGastos = filaGasto ? filaGasto.importe : 0
        const totalRetiros = filaRetiro ? filaRetiro.importe : 0

        const importeResultado = totalIngresos - totalGastos
        const importeDisponible = importeResultado - totalRetiros

        const saldoInicial = saldosAnteriores[idMedioPago]
        const saldoNuevo = saldoInicial + importeDisponible

        const { error: errorResultado } = await supabase
          .from('resultados')
          .upsert(
            {
              periodo: primerDiaPeriodo,
              id_medio_pago: idMedioPago,
              importe_ingresos: totalIngresos,
              importe_gastos: totalGastos,
              importe_retiro: totalRetiros,
              importe_resultado: importeResultado,
              importe_disponible: importeDisponible,
            },
            { onConflict: 'periodo,id_medio_pago' }
          )

        if (errorResultado) {
          throw new Error(`Falló al guardar el resultado del medio de pago "${idMedioPago}": ${errorResultado.message}`)
        }

        const { error: errorSaldo } = await supabase
          .from('saldos')
          .upsert(
            {
              periodo: primerDiaPeriodo,
              id_medio_pago: idMedioPago,
              importe: saldoNuevo,
            },
            { onConflict: 'periodo,id_medio_pago' }
          )

        if (errorSaldo) {
          throw new Error(`Falló al guardar el saldo del medio de pago "${idMedioPago}": ${errorSaldo.message}`)
        }
      }

      mostrarToast(`Período ${formatearPeriodo(periodo)} cerrado correctamente.`)
      setPeriodosSeleccionados([])
      await cargarDatos()
    } catch (err) {
      mostrarToast('Error al cerrar el período: ' + err.message, 'error')
    }

    setCerrandoPeriodo(false)
  }

  const periodoMasAntiguo = periodoMasAntiguoAbierto()
  const periodoSeleccionado = periodosSeleccionados[0] || null

  const mediosParaChips = []
  const mediosVistos = new Set()
  filasAbiertas.forEach((f) => {
    if (!mediosVistos.has(f.id_medio_pago)) {
      mediosVistos.add(f.id_medio_pago)
      mediosParaChips.push({ id: f.id_medio_pago, desc: f.medio_pago })
    }
  })
  mediosParaChips.sort((a, b) => a.desc.localeCompare(b.desc))

  function totalesDePeriodo(periodo) {
    const ingresos = filasAbiertas
      .filter((f) => f.periodo === periodo && f.origen === 'Ingreso')
      .reduce((acc, f) => acc + f.importe, 0)
    const gastos = filasAbiertas
      .filter((f) => f.periodo === periodo && f.origen === 'Gasto')
      .reduce((acc, f) => acc + f.importe, 0)
    const retiros = filasAbiertas
      .filter((f) => f.periodo === periodo && f.origen === 'Retiro')
      .reduce((acc, f) => acc + f.importe, 0)
    const resultado = ingresos - gastos
    const disponible = resultado - retiros
    const pctUtilidad = ingresos !== 0 ? (resultado / ingresos) * 100 : 0
    return { ingresos, gastos, retiros, resultado, disponible, pctUtilidad }
  }

  const periodosDistintos = [...new Set(filasAbiertas.map((f) => f.periodo))]
  let periodoAnteriorRender = null

  function exportarExcel() {
    const saldoAnteriorTotal = mediosParaChips.reduce((acc, m) => {
      const saldo = saldoAnteriorDeMedio(m.id, periodoMasAntiguo)
      return acc + (saldo ? parseFloat(saldo.importe) : 0)
    }, 0)

    const filas = periodosDistintos.map((periodo) => {
      const ingresosPeriodo = filasAbiertas
        .filter((f) => f.periodo === periodo && f.origen === 'Ingreso')
        .reduce((acc, f) => acc + f.importe, 0)

      const retirosPeriodo = filasAbiertas
        .filter((f) => f.periodo === periodo && f.origen === 'Retiro')
        .reduce((acc, f) => acc + f.importe, 0)

      const gastosDelPeriodo = datosCrudos.gastos.filter((g) => periodoDeFecha(g.fecha) === periodo)

      let gastosMateriaPrima = 0
      let gastosPapeleria = 0
      let otrosGastos = 0

      gastosDelPeriodo.forEach((g) => {
        const categoria = clasificarGasto(g.conceptos?.descripcion)
        const importe = parseFloat(g.importe)
        if (categoria === 'Materia Prima') gastosMateriaPrima += importe
        else if (categoria === 'Papelería') gastosPapeleria += importe
        else otrosGastos += importe
      })

      const gastosPeriodo = gastosMateriaPrima + gastosPapeleria + otrosGastos
      const resultadoPeriodo = ingresosPeriodo - gastosPeriodo
      const disponiblePeriodo = resultadoPeriodo - retirosPeriodo
      const pctUtilidadPeriodo = ingresosPeriodo !== 0 ? resultadoPeriodo / ingresosPeriodo : 0

      return {
        Período: formatearPeriodo(periodo),
        'Saldo anterior': saldoAnteriorTotal,
        Ingresos: ingresosPeriodo,
        'Gastos Materia Prima': gastosMateriaPrima,
        'Gastos Papelería': gastosPapeleria,
        'Otros Gastos': otrosGastos,
        Resultado: resultadoPeriodo,
        Disponible: disponiblePeriodo,
        '% Utilidad': pctUtilidadPeriodo,
      }
    })

    const hoja = XLSX.utils.json_to_sheet(filas)

    const formatoMoneda = '#,##0.00'
    const rango = XLSX.utils.decode_range(hoja['!ref'])
    for (let fila = rango.s.r + 1; fila <= rango.e.r; fila++) {
      for (let col = 1; col <= 7; col++) {
        const celda = hoja[XLSX.utils.encode_cell({ r: fila, c: col })]
        if (celda) celda.z = formatoMoneda
      }
      const celdaPct = hoja[XLSX.utils.encode_cell({ r: fila, c: 8 })]
      if (celdaPct) celdaPct.z = '0.0%'
    }

    hoja['!cols'] = [
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 18 },
      { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
    ]

    const libro = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(libro, hoja, 'Períodos abiertos')

    const hoy = new Date()
    const nombreArchivo = `resultados_periodos_abiertos_${hoy.getFullYear()}${String(hoy.getMonth() + 1).padStart(2, '0')}${String(hoy.getDate()).padStart(2, '0')}.xlsx`

    XLSX.writeFile(libro, nombreArchivo)
  }

  async function generarExcelPeriodo() {
    if (!periodoReporte) {
      mostrarToast('Elegí un período para generar el reporte', 'error')
      return
    }

    setGenerandoReportePeriodo(true)

    try {
      const [anioSel, mesSel] = periodoReporte.split('-').map(Number)
      const primerDia = periodoReporte + '-01'
      const ultimoDia = new Date(anioSel, mesSel, 0).toISOString().slice(0, 10)

      const [
        { data: medios, error: errorMedios },
        { data: saldosData, error: errorSaldos },
        { data: ingresosData, error: errorIngresos },
        { data: gastosData, error: errorGastos },
        { data: retirosData, error: errorRetiros },
      ] = await Promise.all([
        supabase.from('medios_pagos').select('*').order('id_medio_pago'),
        supabase.from('saldos').select('*').order('periodo', { ascending: false }),
        supabase
          .from('ingresos')
          .select('*, conceptos(descripcion), pedidos(fecha_pedido, fecha_entrega, descripcion)')
          .gte('fecha', primerDia)
          .lte('fecha', ultimoDia),
        supabase
          .from('gastos')
          .select('*, conceptos(descripcion), proveedores(descripcion)')
          .gte('fecha', primerDia)
          .lte('fecha', ultimoDia),
        supabase.from('retiros').select('*').gte('fecha', primerDia).lte('fecha', ultimoDia),
      ])

      const primerError = errorMedios || errorSaldos || errorIngresos || errorGastos || errorRetiros
      if (primerError) throw new Error(primerError.message)

      function saldoAnteriorFresco(idMedioPago) {
        const encontrado = (saldosData || []).find((s) => s.id_medio_pago === idMedioPago && s.periodo < primerDia)
        return encontrado ? parseFloat(encontrado.importe) : 0
      }

      const descPorMedio = {}
      ;(medios || []).forEach((m) => {
        descPorMedio[m.id_medio_pago] = m.descripcion
      })

      const datosPorMedio = (medios || []).map((medio) => {
        const ingresosMedio = (ingresosData || []).filter((i) => i.id_medio_pago === medio.id_medio_pago)
        const gastosMedio = (gastosData || []).filter((g) => g.id_medio_pago === medio.id_medio_pago)
        const retirosMedio = (retirosData || []).filter((r) => r.id_medio_pago_origen === medio.id_medio_pago)

        const movimientos = [
          ...ingresosMedio.map((i) => ({
            fecha: i.fecha,
            detalle: i.id_pedido
              ? [
                  `Pedido #${i.id_pedido}`,
                  i.pedidos?.descripcion,
                  i.pedidos?.fecha_pedido ? `pedido ${formatearFechaCorta(i.pedidos.fecha_pedido)}` : null,
                  i.pedidos?.fecha_entrega ? `entrega ${formatearFechaCorta(i.pedidos.fecha_entrega)}` : null,
                ].filter(Boolean).join(' · ')
              : ['Ingreso', i.conceptos?.descripcion, i.observaciones].filter(Boolean).join(' · '),
            ingreso: parseFloat(i.importe),
            egreso: null,
          })),
          ...gastosMedio.map((g) => ({
            fecha: g.fecha,
            detalle: [
              'Gasto',
              g.conceptos?.descripcion,
              g.id_proveedor != null ? g.proveedores?.descripcion : null,
              g.observaciones,
            ].filter(Boolean).join(' · '),
            ingreso: null,
            egreso: parseFloat(g.importe),
          })),
          ...retirosMedio.map((r) => ({
            fecha: r.fecha,
            detalle: [
              `Retiro → ${descPorMedio[r.id_medio_pago_destino] || r.id_medio_pago_destino}`,
              r.observaciones,
            ].filter(Boolean).join(' · '),
            ingreso: null,
            egreso: parseFloat(r.importe),
          })),
        ].sort((a, b) => a.fecha.localeCompare(b.fecha))

        const totalIngresos = ingresosMedio.reduce((acc, i) => acc + parseFloat(i.importe), 0)
        const totalGastos = gastosMedio.reduce((acc, g) => acc + parseFloat(g.importe), 0)
        const totalRetiros = retirosMedio.reduce((acc, r) => acc + parseFloat(r.importe), 0)

        const saldoInicial = saldoAnteriorFresco(medio.id_medio_pago)
        const saldoFinal = saldoInicial + totalIngresos - totalGastos - totalRetiros

        return {
          medio,
          movimientos,
          saldoInicial,
          totalIngresos,
          totalGastos,
          totalRetiros,
          saldoFinal,
        }
      })

      const libro = new ExcelJS.Workbook()
      libro.creator = 'Gime Burello Pastelería'
      libro.created = new Date()

      const periodoTexto = formatearPeriodo(periodoReporte)

      construirHojaConsolidado(libro, datosPorMedio, periodoTexto)

      datosPorMedio.forEach((d) => {
        construirHojaMedio(libro, d, periodoTexto)
      })

      const buffer = await libro.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const enlace = document.createElement('a')
      enlace.href = url
      enlace.download = `resultados_${periodoReporte}.xlsx`
      enlace.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      mostrarToast('Error al generar el reporte: ' + err.message, 'error')
    }

    setGenerandoReportePeriodo(false)
  }

  return (
    <div className="modulo modulo-compacto">
      <h2>Resultados</h2>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          borderBottom: '1px solid #E8D5CF',
          marginBottom: 14,
        }}
      >
        <div className="tabs-detalle" style={{ border: 'none', marginBottom: 0 }}>
          <button className={tab === 'abiertos' ? 'tab-btn activo' : 'tab-btn'} onClick={() => setTab('abiertos')}>
            Períodos abiertos <span className="contador">{periodosDistintos.length}</span>
          </button>
          <button className={tab === 'cerrados' ? 'tab-btn activo' : 'tab-btn'} onClick={() => setTab('cerrados')}>
            Períodos cerrados <span className="contador">{periodosCerrados.length}</span>
          </button>
        </div>

        {tab === 'abiertos' && (
          <button
            className="btn-secundario"
            style={{ whiteSpace: 'nowrap' }}
            disabled={filasAbiertas.length === 0}
            onClick={exportarExcel}
          >
            📊 Exportar Excel
          </button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: '#8A6A66' }}>Reporte por período (todos los medios de pago):</span>
        <input
          type="month"
          value={periodoReporte}
          onChange={(e) => setPeriodoReporte(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #E8D5CF', borderRadius: 7, fontFamily: 'Poppins, sans-serif', fontSize: 12.5 }}
        />
        <button
          className="btn-secundario"
          style={{ whiteSpace: 'nowrap' }}
          disabled={!periodoReporte || generandoReportePeriodo}
          onClick={generarExcelPeriodo}
        >
          {generandoReportePeriodo ? 'Generando...' : '🎨 Excel del período'}
        </button>
      </div>

      {cargando && <p>Cargando...</p>}
      {error && <p className="mensaje-error">{error}</p>}

      {!cargando && !error && tab === 'abiertos' && (
        <>
          {mediosParaChips.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '14px 0 12px' }}>
              {mediosParaChips.map((m) => {
                const saldo = saldoAnteriorDeMedio(m.id, periodoMasAntiguo)
                if (saldo) {
                  return (
                    <span className="stat-chip" key={m.id}>
                      {m.desc} <strong>${formatearMoneda(saldo.importe)}</strong>
                      <span style={{ color: '#A68E89', fontSize: 11 }}>
                        saldo {formatearPeriodo(saldo.periodo.slice(0, 7))}
                      </span>
                    </span>
                  )
                }
                return (
                  <span className="stat-chip chip-alerta" key={m.id}>
                    {m.desc} <strong style={{ color: '#8A6D3B' }}>sin saldo inicial</strong>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0,00"
                      value={saldosNuevos[m.id] ?? ''}
                      onChange={(e) => setSaldosNuevos((prev) => ({ ...prev, [m.id]: e.target.value }))}
                    />
                    <button
                      className="btn-mini"
                      disabled={guardandoSaldo === m.id}
                      onClick={() => guardarSaldoInicial(m.id)}
                    >
                      {guardandoSaldo === m.id ? '...' : 'Guardar'}
                    </button>
                  </span>
                )
              })}
            </div>
          )}

          {filasAbiertas.length === 0 ? (
            <p className="aviso-ok">✅ No hay movimientos pendientes de cierre.</p>
          ) : (
            <>
              {periodoSeleccionado && periodoSeleccionado === periodoMasAntiguo && (
                <p className="aviso-ok">
                  ✅ Se seleccionaron todos los medios de pago del mes de <strong>{formatearPeriodo(periodoSeleccionado)}</strong>.
                </p>
              )}
              {periodoSeleccionado && periodoSeleccionado !== periodoMasAntiguo && (
                <p className="mensaje-error">
                  🔒 No podés cerrar <strong>{formatearPeriodo(periodoSeleccionado)}</strong>: el período{' '}
                  <strong>{formatearPeriodo(periodoMasAntiguo)}</strong> todavía tiene movimientos sin cerrar. Los
                  períodos se cierran en orden, uno por uno.
                </p>
              )}

              <div className="tabla-wrapper">
                <table className="tabla tabla-compacta">
                  <thead>
                    <tr>
                      <th>Cerrar</th>
                      <th></th>
                      <th>Período</th>
                      <th>Origen</th>
                      <th>Medio de pago</th>
                      <th>Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filasAbiertas.map((fila, idx) => {
                      const grupoIdx = periodosDistintos.indexOf(fila.periodo)
                      const grupoClase = grupoIdx % 2 === 0 ? 'grupo-a' : 'grupo-b'
                      const esInicioPeriodo = fila.periodo !== periodoAnteriorRender
                      periodoAnteriorRender = fila.periodo

                      return (
                        <Fragment key={idx}>
                          <tr className={`grupo-periodo ${grupoClase}${esInicioPeriodo ? ' inicio-periodo' : ''}`}>
                            <td>
                              <input
                                type="checkbox"
                                checked={periodosSeleccionados.includes(fila.periodo)}
                                onChange={() => togglePeriodo(fila.periodo)}
                              />
                            </td>
                            <td>
                              <button
                                className="icono-accion"
                                onClick={() => setFilaExpandida(filaExpandida === idx ? null : idx)}
                              >
                                {filaExpandida === idx ? '−' : '+'}
                              </button>
                            </td>
                            <td>{formatearPeriodo(fila.periodo)}</td>
                            <td>
                              <span
                                className={
                                  'badge-origen ' +
                                  (fila.origen === 'Ingreso'
                                    ? 'badge-ingreso'
                                    : fila.origen === 'Gasto'
                                    ? 'badge-gasto'
                                    : 'badge-retiro')
                                }
                              >
                                {fila.origen}
                              </span>
                            </td>
                            <td>{fila.medio_pago}</td>
                            <td>${formatearMoneda(fila.importe)}</td>
                          </tr>
                          {filaExpandida === idx && (
                            <tr className={`grupo-periodo ${grupoClase} fila-detalle`}>
                              <td colSpan="6" style={{ padding: '12px 20px' }}>
                                <DetalleOrigen registros={obtenerDetalle(fila)} origen={fila.origen} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {periodosDistintos.map((periodo) => {
                  const t = totalesDePeriodo(periodo)
                  return (
                    <div className="tarjeta-totales" key={periodo}>
                      <div className="fila-total" style={{ fontWeight: 700, color: '#4A2C2A', marginBottom: 2 }}>
                        <span>{formatearPeriodo(periodo)}</span>
                        <span></span>
                      </div>
                      <div className="fila-total">
                        <span>Ingresos</span>
                        <span>${formatearMoneda(t.ingresos)}</span>
                      </div>
                      <div className="fila-total">
                        <span>Gastos</span>
                        <span>${formatearMoneda(t.gastos)}</span>
                      </div>
                      <div className="divisor-horizontal"></div>
                      <div className="fila-total total-fuerte">
                        <span>Resultado</span>
                        <span style={{ color: t.resultado < 0 ? '#C0392B' : undefined }}>${formatearMoneda(t.resultado)}</span>
                      </div>
                      <div className="fila-total">
                        <span>Retiros</span>
                        <span>${formatearMoneda(t.retiros)}</span>
                      </div>
                      <div className="fila-total total-fuerte destacado">
                        <span>Disponible</span>
                        <span style={{ color: t.disponible < 0 ? '#C0392B' : undefined }}>${formatearMoneda(t.disponible)}</span>
                      </div>
                      <div className="fila-total nota-utilidad">
                        <span>% Utilidad</span>
                        <span>{formatearPorcentaje(t.pctUtilidad)}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          <div className="campo-acciones" style={{ marginTop: '16px' }}>
            <button
              className="btn-primario"
              disabled={periodosSeleccionados.length === 0 || cerrandoPeriodo || periodoSeleccionado !== periodoMasAntiguo}
              onClick={handleCerrarPeriodo}
            >
              {cerrandoPeriodo ? 'Cerrando...' : 'Cerrar Período'}
            </button>
          </div>
        </>
      )}

      {!cargando && !error && tab === 'cerrados' && (
        <>
          {periodosCerrados.length === 0 ? (
            <p className="aviso-ok">Todavía no hay períodos cerrados.</p>
          ) : (
            <div className="tabla-wrapper">
              <table className="tabla tabla-compacta">
                <thead>
                  <tr>
                    <th>Período</th>
                    <th>Medio de pago</th>
                    <th>Saldo anterior</th>
                    <th>Ingresos</th>
                    <th>Gastos</th>
                    <th>Retiros</th>
                    <th>Resultado</th>
                    <th>Disponible</th>
                    <th>Fecha cierre</th>
                  </tr>
                </thead>
                <tbody>
                  {periodosCerrados.map((r) => {
                    const periodoStr = r.periodo.slice(0, 7)
                    const periodoAnteriorStr = mesAnterior(periodoStr)
                    const saldoAnterior = saldoAnteriorDeMedio(r.id_medio_pago, periodoStr)

                    return (
                      <tr key={r.id_resultado}>
                        <td>{formatearPeriodo(periodoStr)}</td>
                        <td>{r.medios_pagos?.descripcion || r.id_medio_pago}</td>
                        <td>
                          {saldoAnterior ? `$${formatearMoneda(saldoAnterior.importe)}` : '—'}
                          <span style={{ display: 'block', fontSize: '11px', color: '#A68E89' }}>
                            ({formatearPeriodo(periodoAnteriorStr)})
                          </span>
                        </td>
                        <td>${formatearMoneda(r.importe_ingresos)}</td>
                        <td>${formatearMoneda(r.importe_gastos)}</td>
                        <td>${formatearMoneda(r.importe_retiro)}</td>
                        <td style={{ fontWeight: 600, color: r.importe_resultado >= 0 ? '#2D6A35' : '#C0392B' }}>
                          ${formatearMoneda(r.importe_resultado)}
                        </td>
                        <td style={{ fontWeight: 600, color: r.importe_disponible >= 0 ? '#2D6A35' : '#C0392B' }}>
                          ${formatearMoneda(r.importe_disponible)}
                        </td>
                        <td>{new Date(r.fecha_cierre).toLocaleDateString('es-AR')}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ============================================================
// SUBCOMPONENTE: Detalle de los registros individuales de una fila agrupada
// ============================================================
function DetalleOrigen({ registros, origen }) {
  function formatearMoneda(valor) {
    if (valor === null || valor === undefined || isNaN(valor)) return '0,00'
    return new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(valor)
  }

  function formatearFecha(fecha) {
    if (!fecha) return ''
    const [anio, mes, dia] = fecha.slice(0, 10).split('-')
    return `${dia}/${mes}/${anio}`
  }

  if (registros.length === 0) {
    return <p style={{ fontSize: '13px', color: '#8A6A66' }}>Sin registros para mostrar.</p>
  }

  if (origen === 'Gasto') {
    return (
      <div className="tabla-wrapper">
        <table className="tabla tabla-compacta" style={{ fontSize: '13px' }}>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Concepto</th>
              <th>Proveedor</th>
              <th>Observaciones</th>
              <th>Importe</th>
            </tr>
          </thead>
          <tbody>
            {registros.map((r, i) => (
              <tr key={i}>
                <td>{formatearFecha(r.fecha)}</td>
                <td>{r.conceptos?.descripcion || '—'}</td>
                <td>{r.id_proveedor != null ? r.proveedores?.descripcion || '—' : '—'}</td>
                <td>{r.observaciones || '—'}</td>
                <td>${formatearMoneda(r.importe)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (origen === 'Ingreso') {
    return <DetalleIngresoPorConcepto registros={registros} />
  }

  return (
    <div className="tabla-wrapper">
      <table className="tabla tabla-compacta" style={{ fontSize: '13px' }}>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Destino</th>
            <th>Importe</th>
          </tr>
        </thead>
        <tbody>
          {registros.map((r, i) => (
            <tr key={i}>
              <td>{formatearFecha(r.fecha)}</td>
              <td>{r.observaciones || '—'}</td>
              <td>${formatearMoneda(r.importe)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================
// SUBCOMPONENTE: Detalle de Ingresos agrupados por Concepto (Nivel 2)
// ============================================================
function DetalleIngresoPorConcepto({ registros }) {
  const [conceptoExpandido, setConceptoExpandido] = useState(null)

  function formatearMoneda(valor) {
    if (valor === null || valor === undefined || isNaN(valor)) return '0,00'
    return new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(valor)
  }

  const agrupadoPorConcepto = {}
  registros.forEach((r) => {
    const concepto = r.conceptos?.descripcion || 'Sin concepto'
    if (!agrupadoPorConcepto[concepto]) {
      agrupadoPorConcepto[concepto] = { concepto, importe: 0, registros: [] }
    }
    agrupadoPorConcepto[concepto].importe += parseFloat(r.importe)
    agrupadoPorConcepto[concepto].registros.push(r)
  })

  const filasConcepto = Object.values(agrupadoPorConcepto)

  return (
    <div className="nivel-2-wrapper">
      <div className="tabla-wrapper">
        <table className="nivel-2-tabla">
          <thead>
            <tr>
              <th style={{ width: '20px' }}></th>
              <th>Concepto</th>
              <th style={{ textAlign: 'right' }}>Importe</th>
            </tr>
          </thead>
          <tbody>
            {filasConcepto.map((fc, idx) => (
              <Fragment key={idx}>
                <tr>
                  <td>
                    <button
                      className="icono-accion"
                      onClick={() => setConceptoExpandido(conceptoExpandido === idx ? null : idx)}
                    >
                      {conceptoExpandido === idx ? '−' : '+'}
                    </button>
                  </td>
                  <td>{fc.concepto}</td>
                  <td style={{ textAlign: 'right' }}>${formatearMoneda(fc.importe)}</td>
                </tr>
                {conceptoExpandido === idx && (
                  <tr>
                    <td colSpan="3" style={{ padding: 0, border: 'none' }}>
                      <div className="nivel-3-wrapper">
                        {fc.concepto === 'Pedidos' ? (
                          <DetallePedidosDeIngresos registros={fc.registros} />
                        ) : (
                          <DetalleIngresoSimple registros={fc.registros} />
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ============================================================
// SUBCOMPONENTE: Detalle simple de ingresos (Aportes, Consultoría, etc.)
// ============================================================
function DetalleIngresoSimple({ registros }) {
  function formatearMoneda(valor) {
    if (valor === null || valor === undefined || isNaN(valor)) return '0,00'
    return new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(valor)
  }

  function formatearFecha(fecha) {
    if (!fecha) return ''
    const [anio, mes, dia] = fecha.slice(0, 10).split('-')
    return `${dia}/${mes}/${anio}`
  }

  return (
    <div className="tabla-wrapper">
      <table className="nivel-3-tabla">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Observaciones</th>
            <th style={{ textAlign: 'right' }}>Importe</th>
          </tr>
        </thead>
        <tbody>
          {registros.map((r, i) => (
            <tr key={i}>
              <td>{formatearFecha(r.fecha)}</td>
              <td>{r.observaciones || '—'}</td>
              <td style={{ textAlign: 'right' }}>${formatearMoneda(r.importe)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================
// SUBCOMPONENTE: Detalle de Pedidos dentro de Ingresos (Nivel 3)
// ============================================================
function DetallePedidosDeIngresos({ registros }) {
  function formatearMoneda(valor) {
    if (valor === null || valor === undefined || isNaN(valor)) return '0,00'
    return new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(valor)
  }

  function formatearFecha(fecha) {
    if (!fecha) return ''
    const [anio, mes, dia] = fecha.slice(0, 10).split('-')
    return `${dia}/${mes}/${anio}`
  }

  return (
    <div className="tabla-wrapper">
      <table className="nivel-3-tabla">
        <thead>
          <tr>
            <th>ID Pedido</th>
            <th>Fecha pedido</th>
            <th>Fecha entrega</th>
            <th>Cliente</th>
            <th style={{ textAlign: 'right' }}>Importe</th>
          </tr>
        </thead>
        <tbody>
          {registros.map((r, i) => (
            <tr key={i}>
              <td>#{r.id_pedido}</td>
              <td>{formatearFecha(r.pedidos?.fecha_pedido)}</td>
              <td>{formatearFecha(r.pedidos?.fecha_entrega)}</td>
              <td>{r.pedidos?.descripcion || '—'}</td>
              <td style={{ textAlign: 'right' }}>${formatearMoneda(r.importe)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default Resultados
