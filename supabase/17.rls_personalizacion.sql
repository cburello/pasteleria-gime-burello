-- Migración 17: RLS para grupos_personalizacion / items_personalizacion.
--
-- Las migraciones 15 y 16 crearon las tablas y los datos semilla, pero no
-- activaron Row Level Security. Estas tablas las usan DOS clientes distintos:
--   - El ABM de Personalización (Catálogo), logueado como `authenticated`:
--     necesita poder leer y escribir todo, incluidos los grupos/ítems
--     pausados (activo = false).
--   - La futura app móvil, con la clave anónima (`anon`): solo necesita
--     lectura, y solo de lo que está activo — mismo criterio que `vw_carta`
--     para la web pública.
-- Sin políticas para ninguno de los dos roles, RLS bloquea todo en silencio
-- (SELECT devuelve 0 filas, INSERT/UPDATE se rechazan con "violates row-level
-- security policy").
--
-- Aplicar primero en Pasteleria-Prueba, después en producción. Si en algún
-- ambiente ya se corrieron a mano las políticas de `anon` (lectura pública),
-- correr acá solo la parte de `authenticated` que falte — CREATE POLICY
-- falla con "already exists" si el nombre se repite.

ALTER TABLE public.grupos_personalizacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items_personalizacion ENABLE ROW LEVEL SECURITY;

-- ABM de Catálogo (admin, rol authenticated): acceso total.
CREATE POLICY "Permitir todo a usuarios autenticados" ON public.grupos_personalizacion
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Permitir todo a usuarios autenticados" ON public.items_personalizacion
  TO authenticated USING (true) WITH CHECK (true);

-- App móvil (rol anon): solo lectura de lo activo.
CREATE POLICY "lectura publica grupos" ON public.grupos_personalizacion
  FOR SELECT TO anon USING (activo = true);

CREATE POLICY "lectura publica items" ON public.items_personalizacion
  FOR SELECT TO anon USING (activo = true);
