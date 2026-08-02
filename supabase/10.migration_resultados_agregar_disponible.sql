-- Correr en Supabase (SQL editor) tanto en producción como en Pasteleria-Prueba.
-- Agrega la columna "importe_disponible" a la tabla resultados, usada por el
-- nuevo módulo de Resultados (Disponible = Resultado - Retiros, por período
-- y medio de pago).
--
-- Los períodos ya cerrados con el módulo viejo quedan en 0: en esos cierres
-- "importe_resultado" incluía el saldo anterior arrastrado (fórmula distinta
-- a la nueva), así que no hay forma de derivar el Disponible viejo con una
-- cuenta simple. No afecta los cierres nuevos, que sí van a calcular y
-- guardar este valor correctamente a partir de ahora.

ALTER TABLE public.resultados
  ADD COLUMN importe_disponible numeric(12,2) DEFAULT 0 NOT NULL;
