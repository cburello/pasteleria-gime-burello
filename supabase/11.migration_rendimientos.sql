-- Correr en Supabase (SQL editor), en producción y en Pasteleria-Prueba,
-- ANTES de desplegar el código nuevo de rendimientos.
--
-- Modelo nuevo: cada receta tiene N "rendimientos" (descripción + cantidad de
-- unidades que salen de la preparación), y el producto se vincula a un
-- rendimiento (que a su vez determina la receta). El costo unitario del
-- producto pasa a ser: costo receta / cantidad_unidades del rendimiento.
--
-- La migración no rompe nada: a cada receta existente se le crea un
-- rendimiento "estándar" con su rinde actual, y todos los productos quedan
-- apuntando a él.

-- 1) Tabla de rendimientos
CREATE TABLE public.rendimientos (
    id_rendimiento serial PRIMARY KEY,
    id_receta integer NOT NULL REFERENCES public.recetas(id_receta),
    descripcion character varying(200) NOT NULL,
    cantidad_unidades numeric(10,2) NOT NULL CHECK (cantidad_unidades > 0)
);

ALTER TABLE public.rendimientos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir todo a usuarios autenticados" ON public.rendimientos
    TO authenticated USING (true) WITH CHECK (true);

-- 2) Un rendimiento "estándar" por cada receta existente, con su rinde actual
INSERT INTO public.rendimientos (id_receta, descripcion, cantidad_unidades)
SELECT id_receta,
       'Rinde ' || TRIM(TRAILING '.' FROM TRIM(TRAILING '0' FROM cantidad_producto_final::text)) || ' unidad(es)',
       cantidad_producto_final
FROM public.recetas
WHERE cantidad_producto_final > 0;

-- 3) Vincular cada producto al rendimiento estándar de su receta
ALTER TABLE public.productos
    ADD COLUMN id_rendimiento integer REFERENCES public.rendimientos(id_rendimiento);

UPDATE public.productos p
SET id_rendimiento = r.id_rendimiento
FROM public.rendimientos r
WHERE r.id_receta = p.id_receta;

-- 4) "cantidad_producto_final" deja de ser obligatoria en recetas: la app ya
--    no la escribe (el rinde vive en rendimientos). No se elimina la columna
--    para poder volver atrás fácilmente si hiciera falta.
ALTER TABLE public.recetas
    ALTER COLUMN cantidad_producto_final DROP NOT NULL;
