-- Migración: módulo de Presupuestos
-- Correr una sola vez contra la base (primero en Pasteleria-Prueba para probar,
-- después en producción). No modifica ninguna tabla existente.

CREATE TABLE public.presupuestos (
  id_presupuesto integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_cliente integer REFERENCES public.clientes(id_cliente),
  descripcion text,
  domicilio text,
  telefono text,
  fecha_presupuesto date NOT NULL DEFAULT CURRENT_DATE,
  fecha_valido_hasta date NOT NULL DEFAULT (CURRENT_DATE + 7),
  estado text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'confirmado', 'descartado')),
  observaciones text,
  total_estimado numeric NOT NULL DEFAULT 0,
  id_pedido integer REFERENCES public.pedidos(id_pedido),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.detalle_presupuesto (
  id_detalle_presupuesto integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_presupuesto integer NOT NULL REFERENCES public.presupuestos(id_presupuesto) ON DELETE CASCADE,
  secuencia integer NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('producto', 'combo')),
  id_producto integer REFERENCES public.productos(id_producto),
  id_combo integer REFERENCES public.combos(id_combo),
  descripcion text NOT NULL,
  cantidad numeric NOT NULL,
  precio_venta numeric NOT NULL
);

CREATE INDEX idx_detalle_presupuesto_id_presupuesto ON public.detalle_presupuesto(id_presupuesto);
CREATE INDEX idx_presupuestos_estado ON public.presupuestos(estado);

ALTER TABLE public.presupuestos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detalle_presupuesto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir todo a usuarios autenticados" ON public.presupuestos
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Permitir todo a usuarios autenticados" ON public.detalle_presupuesto
  TO authenticated USING (true) WITH CHECK (true);

-- Convierte un presupuesto en un pedido definitivo (atómico: todo o nada).
-- Si el presupuesto no tiene cliente cargado, reutiliza/crea el cliente
-- anónimo genérico, igual que hace la pantalla de Pedidos.
CREATE FUNCTION public.confirmar_presupuesto(p_id_presupuesto integer, p_fecha_entrega date)
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
declare
  v_presu     presupuestos%rowtype;
  v_id_cliente int;
  v_id_pedido  int;
  v_linea      detalle_presupuesto%rowtype;
begin
  select * into v_presu from presupuestos where id_presupuesto = p_id_presupuesto;
  if not found then
    raise exception 'Presupuesto no encontrado';
  end if;

  if v_presu.estado = 'confirmado' then
    raise exception 'Este presupuesto ya fue confirmado';
  end if;

  if p_fecha_entrega is null then
    raise exception 'La fecha de entrega es obligatoria';
  end if;

  v_id_cliente := v_presu.id_cliente;

  if v_id_cliente is null then
    select id_cliente into v_id_cliente from clientes where cliente_anonimo = 'S' limit 1;
    if v_id_cliente is null then
      insert into clientes (cliente_anonimo, descripcion, domicilio, telefono, tipo_cliente)
      values ('S', null, null, null, 'Minorista')
      returning id_cliente into v_id_cliente;
    end if;
  end if;

  insert into pedidos (id_cliente, descripcion, domicilio, telefono, fecha_pedido, fecha_entrega)
  values (v_id_cliente, v_presu.descripcion, v_presu.domicilio, v_presu.telefono, current_date, p_fecha_entrega)
  returning id_pedido into v_id_pedido;

  for v_linea in select * from detalle_presupuesto where id_presupuesto = p_id_presupuesto order by secuencia
  loop
    insert into detalle_pedido (id_pedido, secuencia, id_producto, id_combo, cantidad, precio_real, precio_venta)
    values (v_id_pedido, v_linea.secuencia, v_linea.id_producto, v_linea.id_combo, v_linea.cantidad, v_linea.precio_venta, v_linea.precio_venta);
  end loop;

  update presupuestos
    set estado = 'confirmado', id_pedido = v_id_pedido, actualizado_en = now()
    where id_presupuesto = p_id_presupuesto;

  return v_id_pedido;
end;
$$;
