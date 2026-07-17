--
-- PostgreSQL database dump
--

\restrict mqCdotIpGOSxXazd9SuYleYvLGO0AfutBF0suU0B0NFofkV88uKD8gmMU8GqX1M

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: backup_list_tables(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.backup_list_tables() RETURNS TABLE(table_name text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select t.table_name::text
  from information_schema.tables t
  where t.table_schema = 'public'
    and t.table_type = 'BASE TABLE'
  order by t.table_name;
$$;


--
-- Name: backup_resync_sequences(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.backup_resync_sequences() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  r record;
begin
  for r in
    select c.relname as tabla,
           a.attname as columna,
           pg_get_serial_sequence(quote_ident(c.relname), a.attname) as seq
    from pg_class c
    join pg_attribute a on a.attrelid = c.oid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and pg_get_serial_sequence(quote_ident(c.relname), a.attname) is not null
  loop
    execute format(
      'select setval(%L, coalesce((select max(%I) from %I), 1))',
      r.seq, r.columna, r.tabla
    );
  end loop;
end;
$$;


--
-- Name: confirmar_pedido_web(integer, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirmar_pedido_web(p_id_pedido_web integer, p_fecha_entrega date) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_cab       pedido_web%rowtype;
  v_fecha_ped date;
  v_periodo   date;
  v_id_cli    int;
  v_id_ped    int;
  v_seq       int := 0;
  v_lin       record;
  v_items     int;
begin
  -- 1) cabecera del pedido web
  select * into v_cab from pedido_web where id_pedido_web = p_id_pedido_web;
  if not found then
    raise exception 'El pedido web no existe';
  end if;
  if v_cab.estado <> 'pendiente' then
    raise exception 'El pedido web ya fue procesado (estado: %)', v_cab.estado;
  end if;

  -- 2) validaciones
  if p_fecha_entrega is null then
    raise exception 'La fecha de entrega es obligatoria';
  end if;

  select count(*) into v_items from detalle_pedido_web where id_pedido_web = p_id_pedido_web;
  if v_items = 0 then
    raise exception 'El pedido web no tiene items';
  end if;

  -- 3) fecha de pedido en hora de Argentina y control de periodo cerrado
  v_fecha_ped := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_periodo   := date_trunc('month', v_fecha_ped)::date;   -- dia 1 del mes

  if exists (select 1 from resultados where periodo = v_periodo) then
    raise exception 'El periodo de la fecha de pedido (%) ya fue cerrado en Resultados', v_periodo;
  end if;

  -- 4) cliente anonimo generico (igual que en la carga manual)
  select id_cliente into v_id_cli from clientes where cliente_anonimo = 'S' limit 1;
  if v_id_cli is null then
    insert into clientes (cliente_anonimo, descripcion, domicilio, telefono)
    values ('S', null, null, null)
    returning id_cliente into v_id_cli;
  end if;

  -- 5) cabecera del pedido definitivo
  insert into pedidos (id_cliente, descripcion, domicilio, telefono, fecha_pedido, fecha_entrega)
  values (v_id_cli, v_cab.nombre, v_cab.domicilio, v_cab.telefono, v_fecha_ped, p_fecha_entrega)
  returning id_pedido into v_id_ped;

  -- 6) detalle (secuencia recalculada 1..n; precio_real = precio_venta)
  for v_lin in
    select * from detalle_pedido_web where id_pedido_web = p_id_pedido_web order by secuencia
  loop
    v_seq := v_seq + 1;
    insert into detalle_pedido
      (id_pedido, secuencia, id_producto, id_combo, cantidad, precio_real, precio_venta)
    values
      (v_id_ped, v_seq, v_lin.id_producto, v_lin.id_combo, v_lin.cantidad, v_lin.precio_venta, v_lin.precio_venta);
  end loop;

  -- 7) marcar el pedido web como confirmado
  update pedido_web set estado = 'confirmado' where id_pedido_web = p_id_pedido_web;

  return v_id_ped;
end;
$$;


--
-- Name: crear_pedido_web(text, text, text, date, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crear_pedido_web(p_nombre text, p_telefono text, p_domicilio text, p_fecha_entrega date, p_nota text, p_lineas jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_id     int;
  v_total  numeric := 0;
  v_linea  jsonb;
  v_seq    int := 0;
begin
  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'El nombre y apellido es obligatorio';
  end if;

  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then
    raise exception 'El pedido no tiene items';
  end if;

  select coalesce(sum((l->>'cantidad')::numeric * (l->>'precio_venta')::numeric), 0)
    into v_total
    from jsonb_array_elements(p_lineas) as l;

  insert into pedido_web (nombre, telefono, domicilio, fecha_entrega, nota, total_estimado)
  values (
    btrim(p_nombre),
    nullif(btrim(coalesce(p_telefono, '')), ''),
    nullif(btrim(coalesce(p_domicilio, '')), ''),
    p_fecha_entrega,
    nullif(btrim(coalesce(p_nota, '')), ''),
    v_total
  )
  returning id_pedido_web into v_id;

  for v_linea in select * from jsonb_array_elements(p_lineas)
  loop
    v_seq := v_seq + 1;
    insert into detalle_pedido_web
      (id_pedido_web, secuencia, tipo, id_producto, id_combo, descripcion, cantidad, precio_venta)
    values (
      v_id,
      v_seq,
      v_linea->>'tipo',
      case when v_linea->>'tipo' = 'producto' then (v_linea->>'id')::int else null end,
      case when v_linea->>'tipo' = 'combo'    then (v_linea->>'id')::int else null end,
      v_linea->>'nombre',
      (v_linea->>'cantidad')::numeric,
      (v_linea->>'precio_venta')::numeric
    );
  end loop;

  return v_id;
end;
$$;


--
-- Name: fn_eliminar_ingreso_desde_pago(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_eliminar_ingreso_desde_pago() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    DELETE FROM ingresos
    WHERE id_pedido = OLD.id_pedido
      AND id_pago_pedido_secuencia = OLD.secuencia;

    RETURN OLD;
END;
$$;


--
-- Name: fn_generar_ingreso_desde_pago(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_generar_ingreso_desde_pago() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_id_concepto_pedidos INTEGER;
    v_id_medio_pago VARCHAR(50);
BEGIN
    SELECT id_concepto INTO v_id_concepto_pedidos
    FROM conceptos
    WHERE descripcion = 'Pedidos' AND indicador = 'Ingreso'
    LIMIT 1;

    IF v_id_concepto_pedidos IS NULL THEN
        RAISE EXCEPTION 'No se encontró el concepto "Pedidos" en la tabla conceptos';
    END IF;

    SELECT id_medio_pago INTO v_id_medio_pago
    FROM medios_pagos
    WHERE descripcion = NEW.medio_pago
    LIMIT 1;

    IF v_id_medio_pago IS NULL THEN
        RAISE EXCEPTION 'No se encontró el medio de pago "%" en la tabla medios_pagos', NEW.medio_pago;
    END IF;

    INSERT INTO ingresos (
        id_concepto,
        fecha,
        importe,
        id_medio_pago,
        id_pedido,
        id_pago_pedido_secuencia,
        observaciones
    ) VALUES (
        v_id_concepto_pedidos,
        (NEW.fecha_pago AT TIME ZONE 'UTC' AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
        NEW.importe,
        v_id_medio_pago,
        NEW.id_pedido,
        NEW.secuencia,
        'Registrado a través del pago del Pedido'
    );

    RETURN NEW;
END;
$$;


--
-- Name: fn_validar_concepto_gasto(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_validar_concepto_gasto() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_indicador VARCHAR(10);
BEGIN
    SELECT indicador INTO v_indicador FROM conceptos WHERE id_concepto = NEW.id_concepto;
    IF v_indicador IS DISTINCT FROM 'Gasto' THEN
        RAISE EXCEPTION 'El concepto seleccionado no es de tipo Gasto';
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: fn_validar_concepto_ingreso(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_validar_concepto_ingreso() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_indicador VARCHAR(10);
BEGIN
    SELECT indicador INTO v_indicador FROM conceptos WHERE id_concepto = NEW.id_concepto;
    IF v_indicador IS DISTINCT FROM 'Ingreso' THEN
        RAISE EXCEPTION 'El concepto seleccionado no es de tipo Ingreso';
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: list_public_tables(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_public_tables() RETURNS TABLE(table_name text)
    LANGUAGE sql SECURITY DEFINER
    AS $$
  select tablename::text
  from pg_tables
  where schemaname = 'public'
  order by tablename;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: caratula_imagenes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.caratula_imagenes (
    id_caratula_imagen integer NOT NULL,
    imagen_url text NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    visible boolean DEFAULT true NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: caratula_imagenes_id_caratula_imagen_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.caratula_imagenes ALTER COLUMN id_caratula_imagen ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.caratula_imagenes_id_caratula_imagen_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: clientes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clientes (
    id_cliente integer NOT NULL,
    descripcion character varying(200) NOT NULL,
    domicilio character varying(300),
    telefono character varying(50),
    cliente_anonimo character(1) DEFAULT NULL::bpchar,
    tipo_cliente character varying(20) DEFAULT 'Minorista'::character varying
);


--
-- Name: clientes_id_cliente_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clientes_id_cliente_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clientes_id_cliente_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clientes_id_cliente_seq OWNED BY public.clientes.id_cliente;


--
-- Name: combos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.combos (
    id_combo integer NOT NULL,
    descripcion character varying(200) NOT NULL,
    precio numeric(12,2),
    fecha_inicio timestamp with time zone NOT NULL,
    fecha_fin timestamp with time zone DEFAULT '3000-12-31 00:00:00+00'::timestamp with time zone NOT NULL,
    id_seccion integer,
    frase_venta text,
    texto_web text,
    imagen_url text,
    visible_web boolean DEFAULT false NOT NULL,
    orden_web integer
);


--
-- Name: combos_id_combo_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.combos_id_combo_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: combos_id_combo_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.combos_id_combo_seq OWNED BY public.combos.id_combo;


--
-- Name: conceptos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conceptos (
    id_concepto integer NOT NULL,
    descripcion character varying(100) NOT NULL,
    indicador character varying(10) NOT NULL,
    CONSTRAINT chk_indicador_concepto CHECK (((indicador)::text = ANY ((ARRAY['Gasto'::character varying, 'Ingreso'::character varying])::text[])))
);


--
-- Name: conceptos_id_concepto_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.conceptos_id_concepto_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: conceptos_id_concepto_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.conceptos_id_concepto_seq OWNED BY public.conceptos.id_concepto;


--
-- Name: costos_materia_prima; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.costos_materia_prima (
    id_costo integer NOT NULL,
    id_materia_prima integer NOT NULL,
    fecha_inicio timestamp with time zone NOT NULL,
    fecha_fin timestamp with time zone NOT NULL,
    presentacion character varying(100) NOT NULL,
    unidad_medida character varying(50) NOT NULL,
    precio numeric(12,2) NOT NULL
);


--
-- Name: costos_materia_prima_id_costo_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.costos_materia_prima_id_costo_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: costos_materia_prima_id_costo_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.costos_materia_prima_id_costo_seq OWNED BY public.costos_materia_prima.id_costo;


--
-- Name: detalle_combo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.detalle_combo (
    id_combo integer NOT NULL,
    id_producto integer NOT NULL,
    cantidad numeric(10,2) DEFAULT 1 NOT NULL
);


--
-- Name: detalle_pedido; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.detalle_pedido (
    id_pedido integer NOT NULL,
    secuencia smallint NOT NULL,
    id_producto integer,
    id_combo integer,
    cantidad numeric(10,2) DEFAULT 1 NOT NULL,
    precio_real numeric(12,2) NOT NULL,
    precio_venta numeric(12,2) NOT NULL,
    CONSTRAINT chk_producto_o_combo CHECK ((((id_producto IS NOT NULL) AND (id_combo IS NULL)) OR ((id_producto IS NULL) AND (id_combo IS NOT NULL))))
);


--
-- Name: detalle_pedido_web; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.detalle_pedido_web (
    id_detalle_web integer NOT NULL,
    id_pedido_web integer NOT NULL,
    secuencia integer NOT NULL,
    tipo text NOT NULL,
    id_producto integer,
    id_combo integer,
    descripcion text,
    cantidad numeric NOT NULL,
    precio_venta numeric NOT NULL
);


--
-- Name: detalle_pedido_web_id_detalle_web_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.detalle_pedido_web ALTER COLUMN id_detalle_web ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.detalle_pedido_web_id_detalle_web_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: detalle_receta; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.detalle_receta (
    id_receta integer NOT NULL,
    id_materia_prima integer NOT NULL,
    secuencia smallint NOT NULL,
    cantidad numeric(12,4) NOT NULL,
    unidad_medida character varying(50) NOT NULL
);


--
-- Name: gastos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gastos (
    id_gasto integer NOT NULL,
    id_concepto integer NOT NULL,
    fecha date NOT NULL,
    importe numeric(12,2) NOT NULL,
    id_medio_pago character varying(50) NOT NULL,
    comprobante character varying(100),
    id_proveedor integer,
    observaciones text
);


--
-- Name: gastos_id_gasto_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gastos_id_gasto_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gastos_id_gasto_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gastos_id_gasto_seq OWNED BY public.gastos.id_gasto;


--
-- Name: ingresos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ingresos (
    id_ingreso integer NOT NULL,
    id_concepto integer NOT NULL,
    fecha date NOT NULL,
    importe numeric(12,2) NOT NULL,
    id_medio_pago character varying(50) NOT NULL,
    id_pedido integer,
    id_pago_pedido_secuencia integer,
    observaciones text
);


--
-- Name: ingresos_id_ingreso_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ingresos_id_ingreso_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ingresos_id_ingreso_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ingresos_id_ingreso_seq OWNED BY public.ingresos.id_ingreso;


--
-- Name: materias_primas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.materias_primas (
    id_materia_prima integer NOT NULL,
    descripcion character varying(200) NOT NULL
);


--
-- Name: materias_primas_id_materia_prima_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.materias_primas_id_materia_prima_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: materias_primas_id_materia_prima_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.materias_primas_id_materia_prima_seq OWNED BY public.materias_primas.id_materia_prima;


--
-- Name: medios_pagos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medios_pagos (
    id_medio_pago character varying(2) NOT NULL,
    descripcion character varying(100) NOT NULL
);


--
-- Name: pagos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pagos (
    id_pedido integer NOT NULL,
    secuencia smallint NOT NULL,
    tipo character(2) NOT NULL,
    importe numeric(12,2) NOT NULL,
    medio_pago character varying(50) NOT NULL,
    fecha_pago timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_tipo_pago CHECK ((tipo = ANY (ARRAY['PT'::bpchar, 'SE'::bpchar, 'PP'::bpchar])))
);


--
-- Name: pedido_web; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pedido_web (
    id_pedido_web integer NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    nombre text NOT NULL,
    telefono text,
    domicilio text,
    fecha_entrega date,
    nota text,
    estado text DEFAULT 'pendiente'::text NOT NULL,
    total_estimado numeric DEFAULT 0 NOT NULL
);


--
-- Name: pedido_web_id_pedido_web_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.pedido_web ALTER COLUMN id_pedido_web ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.pedido_web_id_pedido_web_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: pedidos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pedidos (
    id_pedido integer NOT NULL,
    id_cliente integer NOT NULL,
    descripcion character varying(300),
    domicilio character varying(300),
    telefono character varying(50),
    fecha_pedido timestamp with time zone DEFAULT now() NOT NULL,
    fecha_entrega timestamp with time zone NOT NULL
);


--
-- Name: pedidos_id_pedido_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pedidos_id_pedido_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pedidos_id_pedido_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pedidos_id_pedido_seq OWNED BY public.pedidos.id_pedido;


--
-- Name: precios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.precios (
    id_precio integer NOT NULL,
    id_producto integer NOT NULL,
    fecha_inicio timestamp with time zone NOT NULL,
    fecha_fin timestamp with time zone DEFAULT '3000-12-31 00:00:00+00'::timestamp with time zone NOT NULL,
    precio_venta numeric(12,2) NOT NULL,
    precio_teorico numeric(12,2),
    precio_mayorista numeric
);


--
-- Name: precios_id_precio_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.precios_id_precio_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: precios_id_precio_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.precios_id_precio_seq OWNED BY public.precios.id_precio;


--
-- Name: productos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.productos (
    id_producto integer NOT NULL,
    id_receta integer NOT NULL,
    descripcion character varying(200) NOT NULL,
    coeficiente_ganancia numeric(8,4) DEFAULT 1.0 NOT NULL,
    id_seccion integer,
    frase_venta text,
    texto_web text,
    imagen_url text,
    visible_web boolean DEFAULT false NOT NULL,
    orden_web integer
);


--
-- Name: productos_id_producto_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.productos_id_producto_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: productos_id_producto_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.productos_id_producto_seq OWNED BY public.productos.id_producto;


--
-- Name: promo_inicio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promo_inicio (
    id_promo integer NOT NULL,
    activo boolean DEFAULT false NOT NULL,
    tipo text DEFAULT 'foto'::text NOT NULL,
    url text,
    segundos integer DEFAULT 5 NOT NULL,
    texto text,
    fecha_desde date,
    fecha_hasta date,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: promo_inicio_id_promo_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.promo_inicio ALTER COLUMN id_promo ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.promo_inicio_id_promo_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: proveedores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proveedores (
    id_proveedor integer NOT NULL,
    descripcion character varying(200) NOT NULL
);


--
-- Name: proveedores_id_proveedor_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.proveedores_id_proveedor_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: proveedores_id_proveedor_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.proveedores_id_proveedor_seq OWNED BY public.proveedores.id_proveedor;


--
-- Name: recetas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recetas (
    id_receta integer NOT NULL,
    descripcion character varying(200) NOT NULL,
    cantidad_producto_final numeric(10,2) NOT NULL,
    fecha_inicio timestamp with time zone NOT NULL,
    fecha_fin timestamp with time zone DEFAULT '3000-12-31 00:00:00+00'::timestamp with time zone NOT NULL
);


--
-- Name: recetas_id_receta_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.recetas_id_receta_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: recetas_id_receta_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.recetas_id_receta_seq OWNED BY public.recetas.id_receta;


--
-- Name: resultados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resultados (
    id_resultado integer NOT NULL,
    periodo date NOT NULL,
    id_medio_pago character varying(50) NOT NULL,
    importe_ingresos numeric(12,2) DEFAULT 0 NOT NULL,
    importe_gastos numeric(12,2) DEFAULT 0 NOT NULL,
    importe_retiro numeric(12,2) DEFAULT 0 NOT NULL,
    importe_resultado numeric(12,2) DEFAULT 0 NOT NULL,
    fecha_cierre timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: resultados_id_resultado_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.resultados_id_resultado_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: resultados_id_resultado_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.resultados_id_resultado_seq OWNED BY public.resultados.id_resultado;


--
-- Name: retiros; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retiros (
    id_retiro integer NOT NULL,
    fecha date NOT NULL,
    importe numeric(12,2) NOT NULL,
    id_medio_pago_origen character varying(50) NOT NULL,
    id_medio_pago_destino character varying(50) NOT NULL,
    observaciones text
);


--
-- Name: retiros_id_retiro_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retiros_id_retiro_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retiros_id_retiro_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retiros_id_retiro_seq OWNED BY public.retiros.id_retiro;


--
-- Name: saldos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saldos (
    id_saldo integer NOT NULL,
    periodo date NOT NULL,
    id_medio_pago character varying(50) NOT NULL,
    importe numeric(12,2) NOT NULL
);


--
-- Name: saldos_id_saldo_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.saldos_id_saldo_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: saldos_id_saldo_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.saldos_id_saldo_seq OWNED BY public.saldos.id_saldo;


--
-- Name: secciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.secciones (
    id_seccion integer NOT NULL,
    id_padre integer,
    nivel text NOT NULL,
    slug text NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    imagen_url text,
    orden integer DEFAULT 0 NOT NULL,
    visible boolean DEFAULT true NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    carrusel_segundos integer DEFAULT 5 NOT NULL,
    CONSTRAINT secciones_nivel_check CHECK ((nivel = ANY (ARRAY['caratula'::text, 'rubro'::text])))
);


--
-- Name: secciones_id_seccion_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.secciones ALTER COLUMN id_seccion ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.secciones_id_seccion_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: vw_carta; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_carta AS
 WITH hoy AS (
         SELECT ((now() AT TIME ZONE 'America/Argentina/Buenos_Aires'::text))::date AS d
        )
 SELECT 'producto'::text AS tipo,
    p.id_producto AS id,
    p.id_seccion,
    p.descripcion AS nombre,
    p.frase_venta,
    p.texto_web,
    p.imagen_url,
    COALESCE(p.orden_web, 0) AS orden_web,
    ( SELECT pr.precio_venta
           FROM public.precios pr
          WHERE ((pr.id_producto = p.id_producto) AND ((pr.fecha_inicio)::date <= ( SELECT hoy.d
                   FROM hoy)) AND ((pr.fecha_fin IS NULL) OR ((pr.fecha_fin)::date >= ( SELECT hoy.d
                   FROM hoy))))
          ORDER BY pr.fecha_inicio DESC
         LIMIT 1) AS precio
   FROM public.productos p
  WHERE (p.visible_web = true)
UNION ALL
 SELECT 'combo'::text AS tipo,
    c.id_combo AS id,
    c.id_seccion,
    c.descripcion AS nombre,
    c.frase_venta,
    c.texto_web,
    c.imagen_url,
    COALESCE(c.orden_web, 0) AS orden_web,
        CASE
            WHEN (((c.fecha_inicio)::date <= ( SELECT hoy.d
               FROM hoy)) AND ((c.fecha_fin IS NULL) OR ((c.fecha_fin)::date >= ( SELECT hoy.d
               FROM hoy)))) THEN c.precio
            ELSE NULL::numeric
        END AS precio
   FROM public.combos c
  WHERE (c.visible_web = true);


--
-- Name: clientes id_cliente; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes ALTER COLUMN id_cliente SET DEFAULT nextval('public.clientes_id_cliente_seq'::regclass);


--
-- Name: combos id_combo; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.combos ALTER COLUMN id_combo SET DEFAULT nextval('public.combos_id_combo_seq'::regclass);


--
-- Name: conceptos id_concepto; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conceptos ALTER COLUMN id_concepto SET DEFAULT nextval('public.conceptos_id_concepto_seq'::regclass);


--
-- Name: costos_materia_prima id_costo; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.costos_materia_prima ALTER COLUMN id_costo SET DEFAULT nextval('public.costos_materia_prima_id_costo_seq'::regclass);


--
-- Name: gastos id_gasto; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gastos ALTER COLUMN id_gasto SET DEFAULT nextval('public.gastos_id_gasto_seq'::regclass);


--
-- Name: ingresos id_ingreso; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingresos ALTER COLUMN id_ingreso SET DEFAULT nextval('public.ingresos_id_ingreso_seq'::regclass);


--
-- Name: materias_primas id_materia_prima; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materias_primas ALTER COLUMN id_materia_prima SET DEFAULT nextval('public.materias_primas_id_materia_prima_seq'::regclass);


--
-- Name: pedidos id_pedido; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos ALTER COLUMN id_pedido SET DEFAULT nextval('public.pedidos_id_pedido_seq'::regclass);


--
-- Name: precios id_precio; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.precios ALTER COLUMN id_precio SET DEFAULT nextval('public.precios_id_precio_seq'::regclass);


--
-- Name: productos id_producto; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.productos ALTER COLUMN id_producto SET DEFAULT nextval('public.productos_id_producto_seq'::regclass);


--
-- Name: proveedores id_proveedor; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proveedores ALTER COLUMN id_proveedor SET DEFAULT nextval('public.proveedores_id_proveedor_seq'::regclass);


--
-- Name: recetas id_receta; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recetas ALTER COLUMN id_receta SET DEFAULT nextval('public.recetas_id_receta_seq'::regclass);


--
-- Name: resultados id_resultado; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resultados ALTER COLUMN id_resultado SET DEFAULT nextval('public.resultados_id_resultado_seq'::regclass);


--
-- Name: retiros id_retiro; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retiros ALTER COLUMN id_retiro SET DEFAULT nextval('public.retiros_id_retiro_seq'::regclass);


--
-- Name: saldos id_saldo; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saldos ALTER COLUMN id_saldo SET DEFAULT nextval('public.saldos_id_saldo_seq'::regclass);


--
-- Data for Name: caratula_imagenes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.caratula_imagenes (id_caratula_imagen, imagen_url, orden, visible, creado_en) FROM stdin;
1	https://vldcybydrxekwrqibbjt.supabase.co/storage/v1/object/public/catalogo/caratula/carrusel-1783717018561.png	1	t	2026-07-10 20:57:04.375831+00
2	https://vldcybydrxekwrqibbjt.supabase.co/storage/v1/object/public/catalogo/caratula/carrusel-1783717026268.png	2	t	2026-07-10 20:57:13.786813+00
3	https://vldcybydrxekwrqibbjt.supabase.co/storage/v1/object/public/catalogo/caratula/carrusel-1783717042561.png	3	t	2026-07-10 20:58:34.053689+00
4	https://vldcybydrxekwrqibbjt.supabase.co/storage/v1/object/public/catalogo/caratula/carrusel-1783717121700.png	4	t	2026-07-10 20:58:51.560768+00
5	https://vldcybydrxekwrqibbjt.supabase.co/storage/v1/object/public/catalogo/caratula/carrusel-1783717136491.png	5	t	2026-07-10 20:59:02.494329+00
6	https://vldcybydrxekwrqibbjt.supabase.co/storage/v1/object/public/catalogo/caratula/carrusel-1783717149252.png	6	t	2026-07-10 20:59:14.335198+00
7	https://vldcybydrxekwrqibbjt.supabase.co/storage/v1/object/public/catalogo/caratula/carrusel-1783717160670.png	7	t	2026-07-10 20:59:25.580829+00
8	https://vldcybydrxekwrqibbjt.supabase.co/storage/v1/object/public/catalogo/caratula/carrusel-1783717172306.png	8	t	2026-07-10 20:59:40.316721+00
9	https://vldcybydrxekwrqibbjt.supabase.co/storage/v1/object/public/catalogo/caratula/carrusel-1783717190944.png	9	t	2026-07-10 20:59:57.689766+00
10	https://vldcybydrxekwrqibbjt.supabase.co/storage/v1/object/public/catalogo/caratula/carrusel-1783717208475.png	10	t	2026-07-10 21:00:13.115672+00
11	https://vldcybydrxekwrqibbjt.supabase.co/storage/v1/object/public/catalogo/caratula/carrusel-1783717234185.png	11	t	2026-07-10 21:00:38.711913+00
12	https://vldcybydrxekwrqibbjt.supabase.co/storage/v1/object/public/catalogo/caratula/carrusel-1783717243267.png	12	t	2026-07-10 21:00:48.32706+00
13	https://vldcybydrxekwrqibbjt.supabase.co/storage/v1/object/public/catalogo/caratula/carrusel-1783717254052.png	13	t	2026-07-10 21:00:59.530715+00
14	https://vldcybydrxekwrqibbjt.supabase.co/storage/v1/object/public/catalogo/caratula/carrusel-1783717266456.png	14	t	2026-07-10 21:01:13.116874+00
15	https://vldcybydrxekwrqibbjt.supabase.co/storage/v1/object/public/catalogo/caratula/carrusel-1783717280716.png	15	t	2026-07-10 21:01:25.598774+00
\.


--
-- Data for Name: clientes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.clientes (id_cliente, descripcion, domicilio, telefono, cliente_anonimo, tipo_cliente) FROM stdin;
99999	ANONIMO	\N	\N	S	Minorista
7	Mundo Petra	Lomas	1159596847	N	Mayorista
1	Casa Negra Turdera	Reconquista 9999	11 5898 9999	N	Mayorista
\.


--
-- Data for Name: combos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.combos (id_combo, descripcion, precio, fecha_inicio, fecha_fin, id_seccion, frase_venta, texto_web, imagen_url, visible_web, orden_web) FROM stdin;
\.


--
-- Data for Name: conceptos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.conceptos (id_concepto, descripcion, indicador) FROM stdin;
1	Mercaderias/Materia prima	Gasto
2	Papeleria	Gasto
3	Ayudante de Cocina	Gasto
4	Impuestos	Gasto
5	Materiales	Gasto
6	Transporte	Gasto
7	Pedidos	Ingreso
8	Consultoria	Ingreso
9	Aportes	Ingreso
10	Cobros Pedidos Anteriores	Ingreso
\.


--
-- Data for Name: costos_materia_prima; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.costos_materia_prima (id_costo, id_materia_prima, fecha_inicio, fecha_fin, presentacion, unidad_medida, precio) FROM stdin;
20	1	2026-07-17 00:00:00+00	3000-12-31 00:00:00+00	10000	Gramos	58500.00
\.


--
-- Data for Name: detalle_combo; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.detalle_combo (id_combo, id_producto, cantidad) FROM stdin;
\.


--
-- Data for Name: detalle_pedido; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.detalle_pedido (id_pedido, secuencia, id_producto, id_combo, cantidad, precio_real, precio_venta) FROM stdin;
\.


--
-- Data for Name: detalle_pedido_web; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.detalle_pedido_web (id_detalle_web, id_pedido_web, secuencia, tipo, id_producto, id_combo, descripcion, cantidad, precio_venta) FROM stdin;
1	1	1	producto	6	\N	Dulce para venta	2	70
2	2	1	producto	6	\N	Dulce para venta	1	70
3	3	1	producto	6	\N	Dulce para venta	5	70
4	4	1	producto	6	\N	Dulce para venta	2	80000
\.


--
-- Data for Name: detalle_receta; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.detalle_receta (id_receta, id_materia_prima, secuencia, cantidad, unidad_medida) FROM stdin;
\.


--
-- Data for Name: gastos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.gastos (id_gasto, id_concepto, fecha, importe, id_medio_pago, comprobante, id_proveedor, observaciones) FROM stdin;
\.


--
-- Data for Name: ingresos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.ingresos (id_ingreso, id_concepto, fecha, importe, id_medio_pago, id_pedido, id_pago_pedido_secuencia, observaciones) FROM stdin;
\.


--
-- Data for Name: materias_primas; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.materias_primas (id_materia_prima, descripcion) FROM stdin;
2	Azucar  Blanco
3	Harina 0000
5	Huevos
6	Harina 000
8	Crema
9	Crema de Leche
10	Chocolate Blanco
7	Chocolate Negro
11	Pistacho en pasta
12	Pistacho en granos
13	Nueces
14	Almendras
15	Avellanas
16	Chocolate con Almendras
17	Vainillin
18	Queso Crema
19	Queso Sardo
1	Dulce de Leche Repostero
20	Dulce de Leche Clasico
\.


--
-- Data for Name: medios_pagos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.medios_pagos (id_medio_pago, descripcion) FROM stdin;
EF	Efectivo
MP	Mercado Pago
GA	Galicia
BB	Brubank
\.


--
-- Data for Name: pagos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.pagos (id_pedido, secuencia, tipo, importe, medio_pago, fecha_pago) FROM stdin;
\.


--
-- Data for Name: pedido_web; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.pedido_web (id_pedido_web, creado_en, nombre, telefono, domicilio, fecha_entrega, nota, estado, total_estimado) FROM stdin;
1	2026-07-11 21:23:02.541759+00	Claudio	59596847	\N	2026-07-12	\N	descartado	140
3	2026-07-11 23:28:08.757144+00	Claudio	1159596847	\N	2026-07-14	Por favor, lo necesito para esa fecha	confirmado	350
2	2026-07-11 21:50:28.303594+00	CLAUDIO RICARDO BURELLO	1155553333	\N	\N	\N	descartado	70
4	2026-07-14 12:50:27.093977+00	CLAUDIO RICARDO BURELLO	+541159596847	\N	2026-07-16	\N	descartado	160000
\.


--
-- Data for Name: pedidos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.pedidos (id_pedido, id_cliente, descripcion, domicilio, telefono, fecha_pedido, fecha_entrega) FROM stdin;
\.


--
-- Data for Name: precios; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.precios (id_precio, id_producto, fecha_inicio, fecha_fin, precio_venta, precio_teorico, precio_mayorista) FROM stdin;
\.


--
-- Data for Name: productos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.productos (id_producto, id_receta, descripcion, coeficiente_ganancia, id_seccion, frase_venta, texto_web, imagen_url, visible_web, orden_web) FROM stdin;
\.


--
-- Data for Name: promo_inicio; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.promo_inicio (id_promo, activo, tipo, url, segundos, texto, fecha_desde, fecha_hasta, actualizado_en) FROM stdin;
1	t	video	https://vldcybydrxekwrqibbjt.supabase.co/storage/v1/object/public/catalogo/promo/1783729926599.MOV	15	\N	2026-07-10	2026-07-19	2026-07-16 18:14:44.509+00
\.


--
-- Data for Name: proveedores; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.proveedores (id_proveedor, descripcion) FROM stdin;
1	Harinas & Co
2	Dacal
3	Aparicio
4	Verduleria
5	Los Lecheros
6	Papelera
7	Cotillon
\.


--
-- Data for Name: recetas; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.recetas (id_receta, descripcion, cantidad_producto_final, fecha_inicio, fecha_fin) FROM stdin;
\.


--
-- Data for Name: resultados; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.resultados (id_resultado, periodo, id_medio_pago, importe_ingresos, importe_gastos, importe_retiro, importe_resultado, fecha_cierre) FROM stdin;
\.


--
-- Data for Name: retiros; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.retiros (id_retiro, fecha, importe, id_medio_pago_origen, id_medio_pago_destino, observaciones) FROM stdin;
\.


--
-- Data for Name: saldos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.saldos (id_saldo, periodo, id_medio_pago, importe) FROM stdin;
1	2026-05-01	EF	80000.00
3	2026-05-01	GA	100000.00
2	2026-05-01	MP	1530000.00
4	2026-05-01	BB	2500000.00
14	2026-06-01	BB	2372000.00
15	2026-06-01	EF	-1507450.00
16	2026-06-01	MP	2598663.00
17	2026-06-01	GA	95556.00
\.


--
-- Data for Name: secciones; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.secciones (id_seccion, id_padre, nivel, slug, nombre, descripcion, imagen_url, orden, visible, creado_en, carrusel_segundos) FROM stdin;
6	1	rubro	coffee-break	Coffee break	Ideal para reuniones y oficinas.	\N	5	f	2026-07-05 20:49:09.706867+00	5
8	1	rubro	especial-dial-del-padre	Especial dial del Padre	Para festejar en fechas especiales	https://vldcybydrxekwrqibbjt.supabase.co/storage/v1/object/public/catalogo/rubros/8-1783721951546.png	0	t	2026-07-05 21:39:39.346146+00	5
2	1	rubro	tortas	Tortas	Para soplar las velitas en tus cumples!	https://vldcybydrxekwrqibbjt.supabase.co/storage/v1/object/public/catalogo/rubros/2-1783721978623.png	1	t	2026-07-05 20:49:09.706867+00	5
3	1	rubro	tartas	Tartas	De frutas, chocolate o lemon pie.	https://vldcybydrxekwrqibbjt.supabase.co/storage/v1/object/public/catalogo/rubros/3-1783722035653.png	2	t	2026-07-05 20:49:09.706867+00	5
4	1	rubro	mesas-dulces	Mesas dulces	El centro de todo festejo.	https://vldcybydrxekwrqibbjt.supabase.co/storage/v1/object/public/catalogo/rubros/4-1783722075322.png	3	t	2026-07-05 20:49:09.706867+00	5
5	1	rubro	brunch	Brunch	Para las mañanas de fin de semana.	\N	4	f	2026-07-05 20:49:09.706867+00	5
7	1	rubro	desayunos	Desayunos	Para empezar el día con algo rico.	https://vldcybydrxekwrqibbjt.supabase.co/storage/v1/object/public/catalogo/rubros/7-1783722135271.png	6	t	2026-07-05 20:49:09.706867+00	5
1	\N	caratula	inicio	Gime Burello Pastelería	Pastelería para esos momentos especiales.	https://vldcybydrxekwrqibbjt.supabase.co/storage/v1/object/public/catalogo/caratula/1-1783722152921.png	0	t	2026-07-05 20:49:09.706867+00	1
\.


--
-- Name: caratula_imagenes_id_caratula_imagen_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.caratula_imagenes_id_caratula_imagen_seq', 15, true);


--
-- Name: clientes_id_cliente_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.clientes_id_cliente_seq', 7, true);


--
-- Name: combos_id_combo_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.combos_id_combo_seq', 2, true);


--
-- Name: conceptos_id_concepto_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.conceptos_id_concepto_seq', 10, true);


--
-- Name: costos_materia_prima_id_costo_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.costos_materia_prima_id_costo_seq', 20, true);


--
-- Name: detalle_pedido_web_id_detalle_web_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.detalle_pedido_web_id_detalle_web_seq', 4, true);


--
-- Name: gastos_id_gasto_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.gastos_id_gasto_seq', 1, true);


--
-- Name: ingresos_id_ingreso_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.ingresos_id_ingreso_seq', 1, true);


--
-- Name: materias_primas_id_materia_prima_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.materias_primas_id_materia_prima_seq', 20, true);


--
-- Name: pedido_web_id_pedido_web_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.pedido_web_id_pedido_web_seq', 4, true);


--
-- Name: pedidos_id_pedido_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.pedidos_id_pedido_seq', 3, true);


--
-- Name: precios_id_precio_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.precios_id_precio_seq', 14, true);


--
-- Name: productos_id_producto_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.productos_id_producto_seq', 6, true);


--
-- Name: promo_inicio_id_promo_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.promo_inicio_id_promo_seq', 1, true);


--
-- Name: proveedores_id_proveedor_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.proveedores_id_proveedor_seq', 7, true);


--
-- Name: recetas_id_receta_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.recetas_id_receta_seq', 9, true);


--
-- Name: resultados_id_resultado_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.resultados_id_resultado_seq', 1, false);


--
-- Name: retiros_id_retiro_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.retiros_id_retiro_seq', 1, false);


--
-- Name: saldos_id_saldo_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.saldos_id_saldo_seq', 20, true);


--
-- Name: secciones_id_seccion_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.secciones_id_seccion_seq', 10, true);


--
-- Name: caratula_imagenes caratula_imagenes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caratula_imagenes
    ADD CONSTRAINT caratula_imagenes_pkey PRIMARY KEY (id_caratula_imagen);


--
-- Name: clientes clientes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_pkey PRIMARY KEY (id_cliente);


--
-- Name: combos combos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.combos
    ADD CONSTRAINT combos_pkey PRIMARY KEY (id_combo);


--
-- Name: conceptos conceptos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conceptos
    ADD CONSTRAINT conceptos_pkey PRIMARY KEY (id_concepto);


--
-- Name: costos_materia_prima costos_materia_prima_id_materia_prima_fecha_inicio_fecha_fi_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.costos_materia_prima
    ADD CONSTRAINT costos_materia_prima_id_materia_prima_fecha_inicio_fecha_fi_key UNIQUE (id_materia_prima, fecha_inicio, fecha_fin);


--
-- Name: costos_materia_prima costos_materia_prima_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.costos_materia_prima
    ADD CONSTRAINT costos_materia_prima_pkey PRIMARY KEY (id_costo);


--
-- Name: detalle_combo detalle_combo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detalle_combo
    ADD CONSTRAINT detalle_combo_pkey PRIMARY KEY (id_combo, id_producto);


--
-- Name: detalle_pedido detalle_pedido_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detalle_pedido
    ADD CONSTRAINT detalle_pedido_pkey PRIMARY KEY (id_pedido, secuencia);


--
-- Name: detalle_pedido_web detalle_pedido_web_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detalle_pedido_web
    ADD CONSTRAINT detalle_pedido_web_pkey PRIMARY KEY (id_detalle_web);


--
-- Name: detalle_receta detalle_receta_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detalle_receta
    ADD CONSTRAINT detalle_receta_pkey PRIMARY KEY (id_receta, id_materia_prima, secuencia);


--
-- Name: gastos gastos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gastos
    ADD CONSTRAINT gastos_pkey PRIMARY KEY (id_gasto);


--
-- Name: ingresos ingresos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingresos
    ADD CONSTRAINT ingresos_pkey PRIMARY KEY (id_ingreso);


--
-- Name: materias_primas materias_primas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materias_primas
    ADD CONSTRAINT materias_primas_pkey PRIMARY KEY (id_materia_prima);


--
-- Name: medios_pagos medios_pagos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medios_pagos
    ADD CONSTRAINT medios_pagos_pkey PRIMARY KEY (id_medio_pago);


--
-- Name: pagos pagos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_pkey PRIMARY KEY (id_pedido, secuencia);


--
-- Name: pedido_web pedido_web_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedido_web
    ADD CONSTRAINT pedido_web_pkey PRIMARY KEY (id_pedido_web);


--
-- Name: pedidos pedidos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_pkey PRIMARY KEY (id_pedido);


--
-- Name: precios precios_id_producto_fecha_inicio_fecha_fin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.precios
    ADD CONSTRAINT precios_id_producto_fecha_inicio_fecha_fin_key UNIQUE (id_producto, fecha_inicio, fecha_fin);


--
-- Name: precios precios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.precios
    ADD CONSTRAINT precios_pkey PRIMARY KEY (id_precio);


--
-- Name: productos productos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_pkey PRIMARY KEY (id_producto);


--
-- Name: promo_inicio promo_inicio_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_inicio
    ADD CONSTRAINT promo_inicio_pkey PRIMARY KEY (id_promo);


--
-- Name: proveedores proveedores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proveedores
    ADD CONSTRAINT proveedores_pkey PRIMARY KEY (id_proveedor);


--
-- Name: recetas recetas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recetas
    ADD CONSTRAINT recetas_pkey PRIMARY KEY (id_receta);


--
-- Name: resultados resultados_periodo_id_medio_pago_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resultados
    ADD CONSTRAINT resultados_periodo_id_medio_pago_key UNIQUE (periodo, id_medio_pago);


--
-- Name: resultados resultados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resultados
    ADD CONSTRAINT resultados_pkey PRIMARY KEY (id_resultado);


--
-- Name: retiros retiros_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retiros
    ADD CONSTRAINT retiros_pkey PRIMARY KEY (id_retiro);


--
-- Name: saldos saldos_periodo_id_medio_pago_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saldos
    ADD CONSTRAINT saldos_periodo_id_medio_pago_key UNIQUE (periodo, id_medio_pago);


--
-- Name: saldos saldos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saldos
    ADD CONSTRAINT saldos_pkey PRIMARY KEY (id_saldo);


--
-- Name: secciones secciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.secciones
    ADD CONSTRAINT secciones_pkey PRIMARY KEY (id_seccion);


--
-- Name: secciones secciones_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.secciones
    ADD CONSTRAINT secciones_slug_key UNIQUE (slug);


--
-- Name: idx_costos_materia_prima_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_costos_materia_prima_id ON public.costos_materia_prima USING btree (id_materia_prima);


--
-- Name: idx_detalle_combo_combo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_detalle_combo_combo ON public.detalle_combo USING btree (id_combo);


--
-- Name: idx_detalle_combo_producto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_detalle_combo_producto ON public.detalle_combo USING btree (id_producto);


--
-- Name: idx_detalle_pedido_combo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_detalle_pedido_combo ON public.detalle_pedido USING btree (id_combo);


--
-- Name: idx_detalle_pedido_pedido; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_detalle_pedido_pedido ON public.detalle_pedido USING btree (id_pedido);


--
-- Name: idx_detalle_pedido_producto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_detalle_pedido_producto ON public.detalle_pedido USING btree (id_producto);


--
-- Name: idx_detalle_receta_materia; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_detalle_receta_materia ON public.detalle_receta USING btree (id_materia_prima);


--
-- Name: idx_detalle_receta_receta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_detalle_receta_receta ON public.detalle_receta USING btree (id_receta);


--
-- Name: idx_gastos_concepto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gastos_concepto ON public.gastos USING btree (id_concepto);


--
-- Name: idx_gastos_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gastos_fecha ON public.gastos USING btree (fecha);


--
-- Name: idx_gastos_medio_pago; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gastos_medio_pago ON public.gastos USING btree (id_medio_pago);


--
-- Name: idx_gastos_proveedor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gastos_proveedor ON public.gastos USING btree (id_proveedor);


--
-- Name: idx_ingresos_concepto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ingresos_concepto ON public.ingresos USING btree (id_concepto);


--
-- Name: idx_ingresos_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ingresos_fecha ON public.ingresos USING btree (fecha);


--
-- Name: idx_ingresos_medio_pago; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ingresos_medio_pago ON public.ingresos USING btree (id_medio_pago);


--
-- Name: idx_ingresos_pedido; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ingresos_pedido ON public.ingresos USING btree (id_pedido);


--
-- Name: idx_pagos_pedido; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pagos_pedido ON public.pagos USING btree (id_pedido);


--
-- Name: idx_pedidos_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pedidos_cliente ON public.pedidos USING btree (id_cliente);


--
-- Name: idx_pedidos_fecha_entrega; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pedidos_fecha_entrega ON public.pedidos USING btree (fecha_entrega);


--
-- Name: idx_precios_producto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_precios_producto ON public.precios USING btree (id_producto);


--
-- Name: idx_productos_receta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_productos_receta ON public.productos USING btree (id_receta);


--
-- Name: idx_resultados_periodo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_resultados_periodo ON public.resultados USING btree (periodo);


--
-- Name: idx_retiros_destino; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retiros_destino ON public.retiros USING btree (id_medio_pago_destino);


--
-- Name: idx_retiros_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retiros_fecha ON public.retiros USING btree (fecha);


--
-- Name: idx_retiros_origen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retiros_origen ON public.retiros USING btree (id_medio_pago_origen);


--
-- Name: idx_saldos_periodo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_saldos_periodo ON public.saldos USING btree (periodo);


--
-- Name: ix_caratula_img_orden; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_caratula_img_orden ON public.caratula_imagenes USING btree (orden);


--
-- Name: ix_detalle_web_cab; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_detalle_web_cab ON public.detalle_pedido_web USING btree (id_pedido_web);


--
-- Name: ix_pedido_web_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_pedido_web_estado ON public.pedido_web USING btree (estado);


--
-- Name: pagos trg_eliminar_ingreso_desde_pago; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_eliminar_ingreso_desde_pago AFTER DELETE ON public.pagos FOR EACH ROW EXECUTE FUNCTION public.fn_eliminar_ingreso_desde_pago();


--
-- Name: pagos trg_generar_ingreso_desde_pago; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_generar_ingreso_desde_pago AFTER INSERT ON public.pagos FOR EACH ROW EXECUTE FUNCTION public.fn_generar_ingreso_desde_pago();


--
-- Name: gastos trg_validar_concepto_gasto; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validar_concepto_gasto BEFORE INSERT OR UPDATE ON public.gastos FOR EACH ROW EXECUTE FUNCTION public.fn_validar_concepto_gasto();


--
-- Name: ingresos trg_validar_concepto_ingreso; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validar_concepto_ingreso BEFORE INSERT OR UPDATE ON public.ingresos FOR EACH ROW EXECUTE FUNCTION public.fn_validar_concepto_ingreso();


--
-- Name: combos combos_id_seccion_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.combos
    ADD CONSTRAINT combos_id_seccion_fkey FOREIGN KEY (id_seccion) REFERENCES public.secciones(id_seccion) ON DELETE SET NULL;


--
-- Name: costos_materia_prima costos_materia_prima_id_materia_prima_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.costos_materia_prima
    ADD CONSTRAINT costos_materia_prima_id_materia_prima_fkey FOREIGN KEY (id_materia_prima) REFERENCES public.materias_primas(id_materia_prima);


--
-- Name: detalle_combo detalle_combo_id_combo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detalle_combo
    ADD CONSTRAINT detalle_combo_id_combo_fkey FOREIGN KEY (id_combo) REFERENCES public.combos(id_combo);


--
-- Name: detalle_combo detalle_combo_id_producto_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detalle_combo
    ADD CONSTRAINT detalle_combo_id_producto_fkey FOREIGN KEY (id_producto) REFERENCES public.productos(id_producto);


--
-- Name: detalle_pedido detalle_pedido_id_combo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detalle_pedido
    ADD CONSTRAINT detalle_pedido_id_combo_fkey FOREIGN KEY (id_combo) REFERENCES public.combos(id_combo);


--
-- Name: detalle_pedido detalle_pedido_id_pedido_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detalle_pedido
    ADD CONSTRAINT detalle_pedido_id_pedido_fkey FOREIGN KEY (id_pedido) REFERENCES public.pedidos(id_pedido);


--
-- Name: detalle_pedido detalle_pedido_id_producto_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detalle_pedido
    ADD CONSTRAINT detalle_pedido_id_producto_fkey FOREIGN KEY (id_producto) REFERENCES public.productos(id_producto);


--
-- Name: detalle_pedido_web detalle_pedido_web_id_pedido_web_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detalle_pedido_web
    ADD CONSTRAINT detalle_pedido_web_id_pedido_web_fkey FOREIGN KEY (id_pedido_web) REFERENCES public.pedido_web(id_pedido_web) ON DELETE CASCADE;


--
-- Name: detalle_receta detalle_receta_id_materia_prima_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detalle_receta
    ADD CONSTRAINT detalle_receta_id_materia_prima_fkey FOREIGN KEY (id_materia_prima) REFERENCES public.materias_primas(id_materia_prima);


--
-- Name: detalle_receta detalle_receta_id_receta_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detalle_receta
    ADD CONSTRAINT detalle_receta_id_receta_fkey FOREIGN KEY (id_receta) REFERENCES public.recetas(id_receta);


--
-- Name: gastos gastos_id_concepto_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gastos
    ADD CONSTRAINT gastos_id_concepto_fkey FOREIGN KEY (id_concepto) REFERENCES public.conceptos(id_concepto);


--
-- Name: gastos gastos_id_medio_pago_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gastos
    ADD CONSTRAINT gastos_id_medio_pago_fkey FOREIGN KEY (id_medio_pago) REFERENCES public.medios_pagos(id_medio_pago);


--
-- Name: gastos gastos_id_proveedor_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gastos
    ADD CONSTRAINT gastos_id_proveedor_fkey FOREIGN KEY (id_proveedor) REFERENCES public.proveedores(id_proveedor);


--
-- Name: ingresos ingresos_id_concepto_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingresos
    ADD CONSTRAINT ingresos_id_concepto_fkey FOREIGN KEY (id_concepto) REFERENCES public.conceptos(id_concepto);


--
-- Name: ingresos ingresos_id_medio_pago_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingresos
    ADD CONSTRAINT ingresos_id_medio_pago_fkey FOREIGN KEY (id_medio_pago) REFERENCES public.medios_pagos(id_medio_pago);


--
-- Name: ingresos ingresos_id_pedido_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingresos
    ADD CONSTRAINT ingresos_id_pedido_fkey FOREIGN KEY (id_pedido) REFERENCES public.pedidos(id_pedido);


--
-- Name: pagos pagos_id_pedido_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_id_pedido_fkey FOREIGN KEY (id_pedido) REFERENCES public.pedidos(id_pedido);


--
-- Name: pedidos pedidos_id_cliente_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_id_cliente_fkey FOREIGN KEY (id_cliente) REFERENCES public.clientes(id_cliente);


--
-- Name: precios precios_id_producto_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.precios
    ADD CONSTRAINT precios_id_producto_fkey FOREIGN KEY (id_producto) REFERENCES public.productos(id_producto);


--
-- Name: productos productos_id_receta_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_id_receta_fkey FOREIGN KEY (id_receta) REFERENCES public.recetas(id_receta);


--
-- Name: productos productos_id_seccion_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_id_seccion_fkey FOREIGN KEY (id_seccion) REFERENCES public.secciones(id_seccion) ON DELETE SET NULL;


--
-- Name: resultados resultados_id_medio_pago_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resultados
    ADD CONSTRAINT resultados_id_medio_pago_fkey FOREIGN KEY (id_medio_pago) REFERENCES public.medios_pagos(id_medio_pago);


--
-- Name: retiros retiros_id_medio_pago_destino_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retiros
    ADD CONSTRAINT retiros_id_medio_pago_destino_fkey FOREIGN KEY (id_medio_pago_destino) REFERENCES public.medios_pagos(id_medio_pago);


--
-- Name: retiros retiros_id_medio_pago_origen_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retiros
    ADD CONSTRAINT retiros_id_medio_pago_origen_fkey FOREIGN KEY (id_medio_pago_origen) REFERENCES public.medios_pagos(id_medio_pago);


--
-- Name: saldos saldos_id_medio_pago_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saldos
    ADD CONSTRAINT saldos_id_medio_pago_fkey FOREIGN KEY (id_medio_pago) REFERENCES public.medios_pagos(id_medio_pago);


--
-- Name: secciones secciones_id_padre_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.secciones
    ADD CONSTRAINT secciones_id_padre_fkey FOREIGN KEY (id_padre) REFERENCES public.secciones(id_seccion) ON DELETE SET NULL;


--
-- Name: clientes Permitir todo a usuarios autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir todo a usuarios autenticados" ON public.clientes TO authenticated USING (true) WITH CHECK (true);


--
-- Name: combos Permitir todo a usuarios autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir todo a usuarios autenticados" ON public.combos TO authenticated USING (true) WITH CHECK (true);


--
-- Name: conceptos Permitir todo a usuarios autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir todo a usuarios autenticados" ON public.conceptos TO authenticated USING (true) WITH CHECK (true);


--
-- Name: costos_materia_prima Permitir todo a usuarios autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir todo a usuarios autenticados" ON public.costos_materia_prima TO authenticated USING (true) WITH CHECK (true);


--
-- Name: detalle_combo Permitir todo a usuarios autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir todo a usuarios autenticados" ON public.detalle_combo TO authenticated USING (true) WITH CHECK (true);


--
-- Name: detalle_pedido Permitir todo a usuarios autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir todo a usuarios autenticados" ON public.detalle_pedido TO authenticated USING (true) WITH CHECK (true);


--
-- Name: detalle_receta Permitir todo a usuarios autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir todo a usuarios autenticados" ON public.detalle_receta TO authenticated USING (true) WITH CHECK (true);


--
-- Name: gastos Permitir todo a usuarios autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir todo a usuarios autenticados" ON public.gastos TO authenticated USING (true) WITH CHECK (true);


--
-- Name: ingresos Permitir todo a usuarios autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir todo a usuarios autenticados" ON public.ingresos TO authenticated USING (true) WITH CHECK (true);


--
-- Name: materias_primas Permitir todo a usuarios autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir todo a usuarios autenticados" ON public.materias_primas TO authenticated USING (true) WITH CHECK (true);


--
-- Name: medios_pagos Permitir todo a usuarios autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir todo a usuarios autenticados" ON public.medios_pagos TO authenticated USING (true) WITH CHECK (true);


--
-- Name: pagos Permitir todo a usuarios autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir todo a usuarios autenticados" ON public.pagos TO authenticated USING (true) WITH CHECK (true);


--
-- Name: pedidos Permitir todo a usuarios autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir todo a usuarios autenticados" ON public.pedidos TO authenticated USING (true) WITH CHECK (true);


--
-- Name: precios Permitir todo a usuarios autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir todo a usuarios autenticados" ON public.precios TO authenticated USING (true) WITH CHECK (true);


--
-- Name: productos Permitir todo a usuarios autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir todo a usuarios autenticados" ON public.productos TO authenticated USING (true) WITH CHECK (true);


--
-- Name: proveedores Permitir todo a usuarios autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir todo a usuarios autenticados" ON public.proveedores TO authenticated USING (true) WITH CHECK (true);


--
-- Name: recetas Permitir todo a usuarios autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir todo a usuarios autenticados" ON public.recetas TO authenticated USING (true) WITH CHECK (true);


--
-- Name: resultados Permitir todo a usuarios autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir todo a usuarios autenticados" ON public.resultados TO authenticated USING (true) WITH CHECK (true);


--
-- Name: retiros Permitir todo a usuarios autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir todo a usuarios autenticados" ON public.retiros TO authenticated USING (true) WITH CHECK (true);


--
-- Name: saldos Permitir todo a usuarios autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir todo a usuarios autenticados" ON public.saldos TO authenticated USING (true) WITH CHECK (true);


--
-- Name: caratula_imagenes admin caratula_imagenes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin caratula_imagenes" ON public.caratula_imagenes TO authenticated USING (true) WITH CHECK (true);


--
-- Name: detalle_pedido_web admin detalle_web; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin detalle_web" ON public.detalle_pedido_web TO authenticated USING (true) WITH CHECK (true);


--
-- Name: pedido_web admin pedido_web; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin pedido_web" ON public.pedido_web TO authenticated USING (true) WITH CHECK (true);


--
-- Name: promo_inicio admin promo_inicio; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin promo_inicio" ON public.promo_inicio TO authenticated USING (true) WITH CHECK (true);


--
-- Name: caratula_imagenes anon lee caratula_imagenes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anon lee caratula_imagenes" ON public.caratula_imagenes FOR SELECT TO anon USING ((visible = true));


--
-- Name: promo_inicio anon lee promo_inicio; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anon lee promo_inicio" ON public.promo_inicio FOR SELECT TO anon USING ((activo = true));


--
-- Name: caratula_imagenes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.caratula_imagenes ENABLE ROW LEVEL SECURITY;

--
-- Name: clientes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

--
-- Name: combos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.combos ENABLE ROW LEVEL SECURITY;

--
-- Name: conceptos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conceptos ENABLE ROW LEVEL SECURITY;

--
-- Name: costos_materia_prima; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.costos_materia_prima ENABLE ROW LEVEL SECURITY;

--
-- Name: detalle_combo; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.detalle_combo ENABLE ROW LEVEL SECURITY;

--
-- Name: detalle_pedido; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.detalle_pedido ENABLE ROW LEVEL SECURITY;

--
-- Name: detalle_pedido_web; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.detalle_pedido_web ENABLE ROW LEVEL SECURITY;

--
-- Name: detalle_receta; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.detalle_receta ENABLE ROW LEVEL SECURITY;

--
-- Name: gastos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gastos ENABLE ROW LEVEL SECURITY;

--
-- Name: ingresos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ingresos ENABLE ROW LEVEL SECURITY;

--
-- Name: materias_primas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.materias_primas ENABLE ROW LEVEL SECURITY;

--
-- Name: medios_pagos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.medios_pagos ENABLE ROW LEVEL SECURITY;

--
-- Name: pagos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pagos ENABLE ROW LEVEL SECURITY;

--
-- Name: pedido_web; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pedido_web ENABLE ROW LEVEL SECURITY;

--
-- Name: pedidos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;

--
-- Name: precios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.precios ENABLE ROW LEVEL SECURITY;

--
-- Name: productos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;

--
-- Name: promo_inicio; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.promo_inicio ENABLE ROW LEVEL SECURITY;

--
-- Name: proveedores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;

--
-- Name: recetas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recetas ENABLE ROW LEVEL SECURITY;

--
-- Name: resultados; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.resultados ENABLE ROW LEVEL SECURITY;

--
-- Name: retiros; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.retiros ENABLE ROW LEVEL SECURITY;

--
-- Name: saldos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.saldos ENABLE ROW LEVEL SECURITY;

--
-- Name: secciones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.secciones ENABLE ROW LEVEL SECURITY;

--
-- Name: secciones secciones_anon_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY secciones_anon_read ON public.secciones FOR SELECT TO anon USING ((visible = true));


--
-- Name: secciones secciones_auth_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY secciones_auth_all ON public.secciones TO authenticated USING (true) WITH CHECK (true);


--
-- PostgreSQL database dump complete
--

\unrestrict mqCdotIpGOSxXazd9SuYleYvLGO0AfutBF0suU0B0NFofkV88uKD8gmMU8GqX1M

