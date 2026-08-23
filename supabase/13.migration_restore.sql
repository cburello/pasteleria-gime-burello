-- Migración 13: soporte para restaurar backups desde la app (Mantenimiento).
--
-- Agrega:
--   - columna backups_log.archivo: nombre del archivo en Storage (bucket
--     "backups") asociado a ese renglón. Antes había que parsearlo del texto
--     libre de "detalle"; ahora el backup lo guarda directo en esta columna.
--     Los renglones viejos quedan con archivo = NULL (no se pueden usar para
--     restaurar, pero siguen sirviendo como historial).
--   - funcion restaurar_vaciar_tabla(p_tabla text): borra TODAS las filas de
--     una tabla del esquema public. La usa la funcion de restore antes de
--     reinsertar los datos del backup, tabla por tabla y en el orden correcto
--     (definido en el codigo, no acá) para no romper claves foraneas.
--     Es un helper deliberadamente simple (un DELETE sin condiciones) — no
--     hace TRUNCATE ... CASCADE para no arrastrar borrados en tablas que no
--     se pidió restaurar.
--   - funcion restaurar_resincronizar_secuencias(p_tabla text): despues de
--     reinsertar filas con sus IDs originales (columnas serial/identity), la
--     secuencia interna de Postgres queda desactualizada y el proximo INSERT
--     "normal" (sin ID explicito) puede chocar contra un ID que ya existe.
--     Esta funcion recorre las columnas de la tabla, encuentra las que tienen
--     una secuencia asociada, y la reacomoda al maximo valor actual.
--
-- Aplicar primero en Pasteleria-Prueba, despues en produccion.

ALTER TABLE public.backups_log ADD COLUMN IF NOT EXISTS archivo text;

CREATE OR REPLACE FUNCTION public.restaurar_vaciar_tabla(p_tabla text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = p_tabla
  ) THEN
    RAISE EXCEPTION 'Tabla "%" no existe en el esquema public', p_tabla;
  END IF;
  EXECUTE format('DELETE FROM public.%I', p_tabla);
END;
$$;

CREATE OR REPLACE FUNCTION public.restaurar_resincronizar_secuencias(p_tabla text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  columna record;
  secuencia text;
  maximo bigint;
BEGIN
  FOR columna IN
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_tabla
  LOOP
    secuencia := pg_get_serial_sequence('public.' || p_tabla, columna.column_name);
    IF secuencia IS NOT NULL THEN
      EXECUTE format('SELECT COALESCE(MAX(%I), 0) FROM public.%I', columna.column_name, p_tabla) INTO maximo;
      PERFORM setval(secuencia, GREATEST(maximo, 1), maximo > 0);
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.restaurar_vaciar_tabla(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurar_resincronizar_secuencias(text) TO authenticated;
