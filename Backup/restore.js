// restore.js
// Restaura una tabla puntual (o todas) desde una carpeta de backup generada por backup.js.
// Adaptado al esquema real de Gime Burello (ver crt_tablas.sql): respeta claves
// primarias compuestas y el orden de dependencias por foreign keys.
//
// USO:
//   node restore.js <tabla> <carpeta_backup>        → restaura UNA tabla
//   node restore.js --todas <carpeta_backup>         → restaura TODAS las tablas, en el orden correcto
//
// EJEMPLOS:
//   node restore.js productos backups/2026-06-20_14-30-00
//   node restore.js --todas backups/2026-06-20_14-30-00
//
// ⚠️  IMPORTANTE: esto BORRA el contenido actual de la(s) tabla(s) en Supabase
//     antes de insertar los datos del backup. Pide confirmación escrita antes de actuar.

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import readline from "readline";

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "❌ Faltan variables de entorno. Revisá tu archivo .env (mismo que usa backup.js)."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// ---------- Esquema: claves primarias por tabla ----------
// Necesario porque varias tablas usan claves compuestas (no una columna "id" única).
const CLAVES_PRIMARIAS = {
  materias_primas: ["id_materia_prima"],
  costos_materia_prima: ["id_costo"],
  recetas: ["id_receta"],
  detalle_receta: ["id_receta", "id_materia_prima", "secuencia"],
  productos: ["id_producto"],
  precios: ["id_precio"],
  combos: ["id_combo"],
  detalle_combo: ["id_combo", "id_producto"],
  clientes: ["id_cliente"],
  pedidos: ["id_pedido"],
  detalle_pedido: ["id_pedido", "secuencia"],
  pagos: ["id_pedido", "secuencia"],
  medios_pagos: ["id_medio_pago"],
};

// ---------- Esquema: orden de restauración (padres antes que hijos) ----------
// Para INSERTAR se usa este orden tal cual.
// Para BORRAR se usa el orden inverso (hijos antes que padres).
const ORDEN_DEPENDENCIAS = [
  // Nivel 1: sin dependencias
  "materias_primas",
  "recetas",
  "clientes",
  "combos",
  "medios_pagos",
  // Nivel 2
  "costos_materia_prima", // depende de materias_primas
  "productos", // depende de recetas
  "pedidos", // depende de clientes
  // Nivel 3
  "detalle_receta", // depende de recetas, materias_primas
  "precios", // depende de productos
  "detalle_combo", // depende de combos, productos
  "pagos", // depende de pedidos
  // Nivel 4
  "detalle_pedido", // depende de pedidos, productos, combos
];

function ordenParaTablas(tablas) {
  // Devuelve las tablas pedidas, ordenadas según ORDEN_DEPENDENCIAS.
  // Tablas no reconocidas (no están en el esquema) se agregan al final, con aviso.
  const conocidas = ORDEN_DEPENDENCIAS.filter((t) => tablas.includes(t));
  const desconocidas = tablas.filter((t) => !ORDEN_DEPENDENCIAS.includes(t));
  if (desconocidas.length > 0) {
    console.log(
      `⚠️  Tabla(s) no reconocida(s) en el esquema, se procesarán al final sin garantía de orden: ${desconocidas.join(", ")}`
    );
  }
  return [...conocidas, ...desconocidas];
}

// ---------- Parseo de argumentos ----------

const args = process.argv.slice(2);

if (args.length < 2) {
  console.error(
    "Uso:\n" +
      "  node restore.js <tabla> <carpeta_backup>\n" +
      "  node restore.js --todas <carpeta_backup>\n\n" +
      "Ejemplo:\n" +
      "  node restore.js productos backups/2026-06-20_14-30-00"
  );
  process.exit(1);
}

const modoTodas = args[0] === "--todas";
const backupDir = args[1];
const tablaUnica = modoTodas ? null : args[0];

if (!fs.existsSync(backupDir)) {
  console.error(`❌ No encuentro la carpeta de backup: ${backupDir}`);
  process.exit(1);
}

// ---------- Utilidades ----------

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function listarTablasDelBackup(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json") && f !== "_resumen.json")
    .map((f) => f.replace(/\.json$/, ""));
}

async function contarFilasActuales(table) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(`No pude contar filas de "${table}": ${error.message}`);
  return count;
}

// Borra TODAS las filas de una tabla sin asumir una columna "id" particular.
// Usa la primera columna de la PK definida en CLAVES_PRIMARIAS con un filtro "siempre verdadero".
async function vaciarTabla(table) {
  const pk = CLAVES_PRIMARIAS[table];
  const columnaFiltro = pk ? pk[0] : "id"; // fallback por si la tabla no está en el mapa
  const { error } = await supabase.from(table).delete().not(columnaFiltro, "is", null);
  if (error) throw new Error(`Error al borrar "${table}": ${error.message}`);
}

async function restaurarTabla(table, dir, { pedirConfirmacion = true } = {}) {
  const jsonPath = path.join(dir, `${table}.json`);
  if (!fs.existsSync(jsonPath)) {
    console.log(`⚠️  No existe ${jsonPath}, salteo "${table}".`);
    return;
  }

  const rows = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  const filasActuales = await contarFilasActuales(table);

  console.log(`\n📋 Tabla: ${table}`);
  console.log(`   Filas actuales en Supabase: ${filasActuales}`);
  console.log(`   Filas en el backup a restaurar: ${rows.length}`);

  if (pedirConfirmacion) {
    const confirmacion = await ask(
      `\n⚠️  Esto va a BORRAR las ${filasActuales} filas actuales de "${table}" y reemplazarlas por las ${rows.length} del backup.\n` +
        `   Escribí el nombre de la tabla ("${table}") para confirmar, o cualquier otra cosa para cancelar: `
    );

    if (confirmacion !== table) {
      console.log(`❌ Cancelado. "${table}" no fue modificada.`);
      return;
    }
  }

  await vaciarTabla(table);

  if (rows.length === 0) {
    console.log(`✅ "${table}" quedó vacía (el backup no tenía filas).`);
    return;
  }

  // Insertamos en lotes de 500 para no exceder límites de la API
  const batchSize = 500;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error: insertError } = await supabase.from(table).insert(batch);
    if (insertError) {
      throw new Error(`Error al insertar en "${table}" (lote ${i}): ${insertError.message}`);
    }
  }

  console.log(`✅ "${table}" restaurada con ${rows.length} filas.`);
}

// ---------- Proceso principal ----------

async function main() {
  if (modoTodas) {
    const tablasEnBackup = listarTablasDelBackup(backupDir);
    if (tablasEnBackup.length === 0) {
      console.error("❌ No encontré archivos .json en esa carpeta de backup.");
      process.exit(1);
    }

    const tablasOrdenadas = ordenParaTablas(tablasEnBackup);

    console.log(`📦 Backup: ${backupDir}`);
    console.log(`📋 Tablas a restaurar, en orden (${tablasOrdenadas.length}):`);
    tablasOrdenadas.forEach((t, i) => console.log(`   ${i + 1}. ${t}`));

    const confirmacionGeneral = await ask(
      `\n⚠️  Vas a restaurar TODAS estas tablas en el orden mostrado arriba (respeta las relaciones entre ellas).\n` +
        `   Escribí "continuar" para empezar, o cualquier otra cosa para cancelar todo: `
    );

    if (confirmacionGeneral !== "continuar") {
      console.log("❌ Cancelado. Ninguna tabla fue modificada.");
      return;
    }

    // Paso 1: vaciar TODAS las tablas en orden inverso (hijos primero, padres al final)
    // Esto evita errores de foreign key al borrar.
    console.log("\n🗑️  Vaciando tablas (orden inverso, para no violar relaciones)...");
    const ordenBorrado = [...tablasOrdenadas].reverse();
    for (const tabla of ordenBorrado) {
      try {
        await vaciarTabla(tabla);
        console.log(`   ✅ "${tabla}" vaciada.`);
      } catch (err) {
        console.error(`   ❌ Error vaciando "${tabla}": ${err.message}`);
        process.exit(1);
      }
    }

    // Paso 2: insertar en orden normal (padres primero, hijos al final)
    console.log("\n⬆️  Insertando datos del backup (orden de dependencias)...");
    for (const tabla of tablasOrdenadas) {
      try {
        await restaurarTabla(tabla, backupDir, { pedirConfirmacion: false });
      } catch (err) {
        console.error(`❌ Error restaurando "${tabla}": ${err.message}`);
        const seguir = await ask(`   ¿Continuar con las demás tablas? (si/no): `);
        if (seguir.toLowerCase() !== "si") {
          console.log("Restauración detenida. Algunas tablas pueden haber quedado vacías o incompletas.");
          process.exit(1);
        }
      }
    }

    console.log("\n🎉 Restauración completa.");
  } else {
    if (!CLAVES_PRIMARIAS[tablaUnica]) {
      console.log(
        `⚠️  "${tablaUnica}" no está en el esquema conocido (crt_tablas.sql). Voy a intentar con una columna "id" genérica.`
      );
    }
    try {
      await restaurarTabla(tablaUnica, backupDir);
    } catch (err) {
      console.error(`❌ Error: ${err.message}`);
      process.exit(1);
    }
  }
}

main();
