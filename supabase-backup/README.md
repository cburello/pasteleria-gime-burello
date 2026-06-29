# Resguardo automático de Supabase — Gime Burello

Script que descarga automáticamente **todas las tablas** de tu proyecto Supabase,
las guarda en JSON y CSV, y empaqueta todo en un `.zip` con fecha y hora.

## 1. Instalación (una sola vez)

```bash
npm install
```

## 2. Configurar la conexión a tu base

1. Copiá `.env.example` y renombralo a `.env`
2. Completá con tus datos reales (Supabase Dashboard → **Settings → Data API**):
   - `SUPABASE_URL` → la "Project URL"
   - `SUPABASE_SERVICE_ROLE_KEY` → en **Settings → API**, la clave **`service_role`**
     (⚠️ NO la `anon` key — la `service_role` es la única que puede leer todas las
     tablas sin restricciones de RLS)

## 3. Habilitar la autodetección de tablas (una sola vez)

Para que el script encuentre tus 12-13 tablas solo, sin que tengas que tipearlas:

1. Entrá a tu proyecto en supabase.com → **SQL Editor → New query**
2. Pegá y ejecutá el contenido de `setup.sql` (es de solo lectura, no toca tus datos)

Si **no** querés hacer esto, podés en cambio definir en `.env`:
```
BACKUP_TABLES=clientes,productos,pedidos,combos,recetas,pagos
```
listando tus tablas a mano, separadas por coma.

## 4. Correr el backup

```bash
npm run backup
```

Vas a ver algo así:

```
🔎 Detectando tablas...
📋 Tablas encontradas (12): clientes, productos, combos, pedidos, ...

⬇️  Descargando "clientes"... ✅ 137 filas
⬇️  Descargando "productos"... ✅ 412 filas
...

📦 Resguardo completo: backups/backup_2026-06-20_14-30-00.zip
```

Cada corrida crea un `.zip` nuevo en la carpeta `backups/` con:
- Un archivo `.json` y un `.csv` por cada tabla
- Un `_resumen.json` con la cantidad de filas de cada tabla y la fecha

## 5. Guardar el backup en un lugar seguro

El `.zip` queda en `backups/`. Te recomiendo subirlo manualmente (o con un
script aparte) a Google Drive, ya que tenés esa cuenta conectada — así el
resguardo no vive solo en tu computadora.

## Seguridad — importante

- El archivo `.env` (con tus claves reales) **nunca** se sube a GitHub gracias
  al `.gitignore` incluido. Verificá esto antes de hacer tu primer commit.
- La clave `service_role` tiene acceso total a tu base. Tratala como una
  contraseña: no la compartas, no la pegues en chats ni la subas a ningún repo.

## 6. Recuperar (restaurar) datos desde un backup

Si necesitás volver atrás — se borró algo por error, se rompió una actualización,
etc. — usá `restore.js`. Está adaptado a tu esquema real (`crt_tablas.sql`):
respeta las claves primarias de cada tabla (varias son compuestas, no un simple
`id`) y el orden de las relaciones entre tablas (foreign keys), tanto para
borrar como para insertar.

### Restaurar UNA tabla puntual

```bash
node restore.js productos backups/2026-06-20_14-30-00
```

Te muestra cuántas filas tiene la tabla ahora vs. cuántas va a restaurar, y te
pide que escribas el nombre de la tabla para confirmar antes de borrar nada.

⚠️ Si esa tabla tiene "hijos" (por ejemplo, restaurás `productos` pero
`detalle_pedido` sigue como está), pueden quedar inconsistencias. Para casos
así, mejor restaurar todas las tablas relacionadas juntas con `--todas`.

### Restaurar TODAS las tablas

```bash
node restore.js --todas backups/2026-06-20_14-30-00
```

Esto:
1. Te muestra el orden en que van a procesarse las 13 tablas (respeta las
   relaciones del esquema)
2. Te pide confirmación general
3. Vacía todas las tablas en orden inverso (primero las que dependen de otras,
   como `detalle_pedido`, al final las "base" como `materias_primas`)
4. Inserta los datos del backup en orden normal (primero `materias_primas`,
   `recetas`, `clientes`, etc., al final `detalle_pedido`)

### Solo querés mirar los datos, sin restaurar nada

No hace falta ningún script: abrís el `.csv` directo con Excel/Google Sheets,
o el `.json` con cualquier editor de texto.

### Orden de dependencias de tu esquema (de referencia)

```
Nivel 1 (sin dependencias):
  materias_primas, recetas, clientes, combos, medios_pagos

Nivel 2:
  costos_materia_prima (→ materias_primas)
  productos (→ recetas)
  pedidos (→ clientes)

Nivel 3:
  detalle_receta (→ recetas, materias_primas)
  precios (→ productos)
  detalle_combo (→ combos, productos)
  pagos (→ pedidos)

Nivel 4:
  detalle_pedido (→ pedidos, productos, combos)
```


Cuando quieras que corra solo todas las semanas, en Linux/Mac podés agregar
a tu crontab (`crontab -e`):

```
0 3 * * 0 cd /ruta/a/supabase-backup && /usr/bin/node backup.js >> backup.log 2>&1
```

Esto lo corre todos los domingos a las 3 AM. Si preferís no tocar la terminal,
también se puede armar con Make o Zapier disparando un webhook — avisame si
querés que lo armemos así en vez de cron.
