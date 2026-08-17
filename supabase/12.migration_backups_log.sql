-- Migración 12: registro de backups manuales.
--
-- Agrega:
--   - tabla backups_log: un renglón por cada backup hecho (manual, desde el
--     boton del header/Dashboard). Guarda cuántas filas tenía cada tabla en
--     ese momento, para poder comparar despues y avisar si hay datos nuevos
--     sin respaldar.
--   - funcion listar_tablas_publicas(): devuelve el nombre de todas las
--     tablas del esquema public. La usa la funcion de backup para saber que
--     tablas exportar sin tener que mantener una lista a mano en el codigo
--     (si se agrega una tabla nueva mas adelante, se respalda sola).
--   - funcion contar_filas_por_tabla(): devuelve, en una sola consulta,
--     cuantas filas tiene cada tabla. La usa el Dashboard para el aviso de
--     "hay datos nuevos sin respaldar", sin tener que hacer una consulta por
--     tabla.
--
-- Aplicar primero en Pasteleria-Prueba, despues en produccion.

CREATE TABLE public.backups_log (
    id_backup integer NOT NULL,
    fecha timestamp with time zone NOT NULL DEFAULT now(),
    estado character varying(20) NOT NULL,
    conteo_filas jsonb NOT NULL DEFAULT '{}'::jsonb,
    detalle text
);

CREATE SEQUENCE public.backups_log_id_backup_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.backups_log_id_backup_seq OWNED BY public.backups_log.id_backup;
ALTER TABLE ONLY public.backups_log ALTER COLUMN id_backup SET DEFAULT nextval('public.backups_log_id_backup_seq'::regclass);
ALTER TABLE ONLY public.backups_log ADD CONSTRAINT backups_log_pkey PRIMARY KEY (id_backup);

ALTER TABLE public.backups_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir todo a usuarios autenticados" ON public.backups_log TO authenticated USING (true) WITH CHECK (true);

-- Lista los nombres de tabla del esquema public (para que el backup los
-- descubra solo, sin lista fija en el codigo).
CREATE OR REPLACE FUNCTION public.listar_tablas_publicas()
RETURNS TABLE(tabla text)
LANGUAGE sql
STABLE
AS $$
  SELECT tablename::text
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename NOT IN ('backups_log')
  ORDER BY tablename;
$$;

-- Cuenta las filas de cada tabla del esquema public en una sola llamada.
CREATE OR REPLACE FUNCTION public.contar_filas_por_tabla()
RETURNS TABLE(tabla text, cantidad bigint)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  fila record;
BEGIN
  FOR fila IN
    SELECT tablename::text AS nombre
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN ('backups_log')
    ORDER BY tablename
  LOOP
    RETURN QUERY EXECUTE format('SELECT %L::text, count(*) FROM public.%I', fila.nombre, fila.nombre);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.contar_filas_por_tabla() TO authenticated;
GRANT EXECUTE ON FUNCTION public.listar_tablas_publicas() TO authenticated;
