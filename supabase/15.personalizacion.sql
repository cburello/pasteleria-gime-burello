-- 1. Tabla de Grupos o Pasos de Personalización
CREATE TABLE grupos_personalizacion (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo VARCHAR(50) NOT NULL UNIQUE,       -- ej: 'bizcocho', 'rellenos', 'cobertura_estilo'
    nombre VARCHAR(100) NOT NULL,             -- ej: 'Bizcochuelo Base', 'Rellenos (hasta 2)', 'Estilo & Cobertura'
    descripcion TEXT NULL,                    -- Instrucción o nota orientativa para el cliente en la app
    seleccion_minima INT DEFAULT 1,          -- 0 si es opcional, 1 si es obligatorio
    seleccion_maxima INT DEFAULT 1,          -- 1 para selección única, 2 o más para múltiple (ej. 2 rellenos)
    es_obligatorio BOOLEAN DEFAULT TRUE,
    orden INT DEFAULT 0,                     -- Orden del paso en el asistente móvil
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabla de Items / Opciones dentro de cada Grupo
CREATE TABLE items_personalizacion (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    grupo_id INT NOT NULL,
    nombre VARCHAR(120) NOT NULL,             -- ej: 'Vainilla Bourbon Natural', 'Dulce de Leche con Merenguitos'
    descripcion TEXT NULL,                    -- Notas de sabor, alérgenos o características
    foto_url VARCHAR(255) NULL,               -- URL de la imagen de muestra (fundamental para técnicas/coberturas)
    es_destacado BOOLEAN DEFAULT FALSE,       -- Para resaltar favoritos de la pastelera
    activo BOOLEAN DEFAULT TRUE,              -- Para pausar por falta de insumo sin borrar el registro
    orden INT DEFAULT 0,                     -- Posición visual dentro del grupo
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_item_grupo FOREIGN KEY (grupo_id) 
        REFERENCES grupos_personalizacion(id) 
        ON DELETE CASCADE
);

-- Índices recomendados para consultas rápidas desde la API móvil
CREATE INDEX idx_items_grupo_activo ON items_personalizacion(grupo_id, activo, orden);
CREATE INDEX idx_grupos_activo_orden ON grupos_personalizacion(activo, orden);