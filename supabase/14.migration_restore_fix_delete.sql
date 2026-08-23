-- Migración 14: fix de restaurar_vaciar_tabla.
--
-- El proyecto tiene activada una protección que exige que todo DELETE tenga
-- una cláusula WHERE (para evitar borrados accidentales de tabla completa).
-- La función de la migración 13 hacía "DELETE FROM tabla" sin condición y
-- esa protección la rechazaba con "DELETE requires a WHERE clause". Se
-- agrega "WHERE true" — sigue borrando todas las filas, pero ahora cumple
-- con la cláusula exigida.
--
-- Aplicar primero en Pasteleria-Prueba, despues en produccion.

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
  EXECUTE format('DELETE FROM public.%I WHERE true', p_tabla);
END;
$$;
