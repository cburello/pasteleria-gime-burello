-- setup.sql
-- Corré esto UNA SOLA VEZ en el SQL Editor de Supabase (Dashboard > SQL Editor > New query).
-- Crea una función auxiliar que le permite al script de backup listar automáticamente
-- todas las tablas de tu esquema "public" sin que tengas que tipearlas a mano.
--
-- Es de solo lectura: no modifica ni borra nada, solo consulta el catálogo de Postgres.

create or replace function list_public_tables()
returns table (table_name text)
language sql
security definer
as $$
  select tablename::text
  from pg_tables
  where schemaname = 'public'
  order by tablename;
$$;

-- (Opcional) Si querés restringir quién puede llamar esta función:
-- revoke all on function list_public_tables() from public;
-- grant execute on function list_public_tables() to service_role;
