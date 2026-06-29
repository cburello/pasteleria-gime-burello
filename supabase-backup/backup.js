// backup.js
// Resguardo automatico de todas las tablas de un proyecto Supabase.
// Genera JSON + CSV por tabla y empaqueta todo en un .zip con fecha/hora.
//
// USO:
//   npm run backup
//
// Requiere un archivo .env con:
//   SUPABASE_URL=https://xxxxxxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY=xxxxxxxx   (Settings > API > service_role)
//
// Opcional, en .env:
//   BACKUP_TABLES=clientes,productos,pedidos   (si NO querés autodetección)

import { createClient } from "@supabase/supabase-js";
import * as archiverModule from "archiver";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

// Compatibilidad con distintas versiones de "archiver": algunas exportan una
// función default (archiver("zip", opts)), otras exportan la clase ZipArchive.
function createZipArchive(opts) {
  if (typeof archiverModule.default === "function") {
    return archiverModule.default("zip", opts);
  }
  if (typeof archiverModule.ZipArchive === "function") {
    return new archiverModule.ZipArchive(opts);
  }
  throw new Error("No pude inicializar el módulo 'archiver' (versión no compatible).");
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "❌ Faltan variables de entorno. Creá un archivo .env con SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.\n" +
      "   Mirá el archivo .env.example para el formato."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// ---------- Utilidades ----------

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(
    d.getHours()
  )}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

// Convierte un array de objetos a CSV (maneja comas, comillas, saltos de linea, null/objetos anidados)
function toCSV(rows) {
  if (!rows || rows.length === 0) return "";

  const headers = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((k) => set.add(k));
      return set;
    }, new Set())
  );

  const escape = (val) => {
    if (val === null || val === undefined) return "";
    let str;
    if (typeof val === "object") {
      str = JSON.stringify(val);
    } else {
      str = String(val);
    }
    if (/[",\n;]/.test(str)) {
      str = `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }
  return lines.join("\n");
}

// Descubre automaticamente las tablas del esquema "public" usando information_schema
// via una funcion RPC. Si no existe la funcion auxiliar, cae a BACKUP_TABLES del .env.
async function discoverTables() {
  const manualList = process.env.BACKUP_TABLES;
  if (manualList && manualList.trim().length > 0) {
    return manualList.split(",").map((t) => t.trim()).filter(Boolean);
  }

  const { data, error } = await supabase.rpc("list_public_tables");

  if (error) {
    console.error(
      "⚠️  No pude autodetectar las tablas (falta la función auxiliar en tu base).\n" +
        "   Corré el SQL de setup que te paso en las instrucciones, o definí BACKUP_TABLES en .env.\n" +
        "   Detalle:",
      error.message
    );
    process.exit(1);
  }

  return data.map((r) => r.table_name);
}

// Descarga TODAS las filas de una tabla, paginando de a 1000 (límite de Supabase por request)
async function fetchAllRows(table) {
  const pageSize = 1000;
  let from = 0;
  let allRows = [];

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`Tabla "${table}": ${error.message}`);
    }

    allRows = allRows.concat(data);

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return allRows;
}

// ---------- Proceso principal ----------

async function main() {
  console.log("🔎 Detectando tablas...");
  const tables = await discoverTables();

  if (tables.length === 0) {
    console.error("❌ No se encontraron tablas para resguardar.");
    process.exit(1);
  }

  console.log(`📋 Tablas encontradas (${tables.length}): ${tables.join(", ")}\n`);

  const stamp = timestamp();
  const outDir = path.join("backups", stamp);
  fs.mkdirSync(outDir, { recursive: true });

  const summary = [];

  for (const table of tables) {
    process.stdout.write(`⬇️  Descargando "${table}"... `);
    try {
      const rows = await fetchAllRows(table);

      const jsonPath = path.join(outDir, `${table}.json`);
      const csvPath = path.join(outDir, `${table}.csv`);

      fs.writeFileSync(jsonPath, JSON.stringify(rows, null, 2), "utf-8");
      fs.writeFileSync(csvPath, toCSV(rows), "utf-8");

      console.log(`✅ ${rows.length} filas`);
      summary.push({ table, rows: rows.length, status: "ok" });
    } catch (err) {
      console.log(`❌ ERROR: ${err.message}`);
      summary.push({ table, rows: 0, status: "error", error: err.message });
    }
  }

  // Resumen del resguardo
  const summaryPath = path.join(outDir, "_resumen.json");
  fs.writeFileSync(
    summaryPath,
    JSON.stringify(
      { fecha: new Date().toISOString(), supabase_url: SUPABASE_URL, tablas: summary },
      null,
      2
    ),
    "utf-8"
  );

  // Comprimir todo en un .zip
  const zipPath = path.join("backups", `backup_${stamp}.zip`);
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = createZipArchive({ zlib: { level: 9 } });

    output.on("close", resolve);
    archive.on("error", reject);

    archive.pipe(output);
    archive.directory(outDir, false);
    archive.finalize();
  });

  console.log(`\n📦 Resguardo completo: ${zipPath}`);
  console.log(`   (también queda la carpeta sin comprimir en ${outDir})`);

  const errores = summary.filter((s) => s.status === "error");
  if (errores.length > 0) {
    console.log(`\n⚠️  ${errores.length} tabla(s) con error, revisá _resumen.json`);
  }
}

main().catch((err) => {
  console.error("❌ Error inesperado:", err);
  process.exit(1);
});
