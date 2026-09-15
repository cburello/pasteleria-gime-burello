-- Insertar Grupos de Personalización
INSERT INTO grupos_personalizacion (codigo, nombre, descripcion, seleccion_minima, seleccion_maxima, es_obligatorio, orden, activo) VALUES
('bizcocho', 'Bizcochuelo Base', 'Elegí el sabor del bizcocho horneado artesanalmente', 1, 1, TRUE, 1, TRUE),
('rellenos', 'Rellenos Artesanales', 'Podés elegir hasta 2 cortes de relleno para combinar', 1, 2, TRUE, 2, TRUE),
('cobertura_estilo', 'Estilo de Cobertura y Acabado', 'Técnicas y acabados del atelier de Gime', 1, 1, TRUE, 3, TRUE);

-- Insertar Items del Grupo 1 (Bizcochuelo)
INSERT INTO items_personalizacion (grupo_id, nombre, descripcion, foto_url, es_destacado, activo, orden) 
SELECT id, 'Vainilla Bourbon Natural', 'Bizcocho húmedo perfumado con chaucha de vainilla natural', NULL, FALSE, TRUE, 1 
FROM grupos_personalizacion WHERE codigo = 'bizcocho'
UNION ALL
SELECT id, 'Chocolate Húmedo Intenso', 'Cacao amargo 70% con textura extra húmeda', NULL, TRUE, TRUE, 2 
FROM grupos_personalizacion WHERE codigo = 'bizcocho'
UNION ALL
SELECT id, 'Red Velvet Tradicional', 'Terciopelo rojo con suave toque de cacao y vainilla', NULL, FALSE, TRUE, 3 
FROM grupos_personalizacion WHERE codigo = 'bizcocho'
UNION ALL
SELECT id, 'Limón & Amapolas', 'Ralladura fresca de limones y semillas de amapola tostadas', NULL, FALSE, TRUE, 4 
FROM grupos_personalizacion WHERE codigo = 'bizcocho';

-- Insertar Items del Grupo 2 (Rellenos - hasta 2 selecciones)
INSERT INTO items_personalizacion (grupo_id, nombre, descripcion, foto_url, es_destacado, activo, orden) 
SELECT id, 'Dulce de Leche Vacalin con Merenguitos', 'El clásico argentino con crocantes de merengue seco', NULL, TRUE, TRUE, 1 
FROM grupos_personalizacion WHERE codigo = 'rellenos'
UNION ALL
SELECT id, 'Crema Bariloche', 'Ganache suave de chocolate con dulce de leche', NULL, TRUE, TRUE, 2 
FROM grupos_personalizacion WHERE codigo = 'rellenos'
UNION ALL
SELECT id, 'Ganache de Chocolate Semiamargo', 'Crema de chocolate belga 54% aterciopelada', NULL, FALSE, TRUE, 3 
FROM grupos_personalizacion WHERE codigo = 'rellenos'
UNION ALL
SELECT id, 'Crema Diplomata con Frutos Rojos', 'Crema pastelera liviana con coulis de frambuesas y moras', NULL, FALSE, TRUE, 4 
FROM grupos_personalizacion WHERE codigo = 'rellenos'
UNION ALL
SELECT id, 'Nutella & Avellanas Tostadas', 'Crema de avellanas con crocante tostado', NULL, FALSE, TRUE, 5 
FROM grupos_personalizacion WHERE codigo = 'rellenos';

-- Insertar Items del Grupo 3 (Estilo & Cobertura con Fotos del Atelier)
INSERT INTO items_personalizacion (grupo_id, nombre, descripcion, foto_url, es_destacado, activo, orden) 
SELECT id, 'Buttercream Alisado Perfecto', 'Acabado minimalista satinado en tonos pastel', '/assets/atelier/buttercream-liso.jpg', TRUE, TRUE, 1 
FROM grupos_personalizacion WHERE codigo = 'cobertura_estilo'
UNION ALL
SELECT id, 'Textura Espatulada / Acuarela', 'Efecto artístico en relieve con degradé de colores', '/assets/atelier/espatulado.jpg', FALSE, TRUE, 2 
FROM grupos_personalizacion WHERE codigo = 'cobertura_estilo'
UNION ALL
SELECT id, 'Drip Cake Artesanal', 'Chorreado prolijo en chocolate blanco o semiamargo', '/assets/atelier/drip-cake.jpg', FALSE, TRUE, 3 
FROM grupos_personalizacion WHERE codigo = 'cobertura_estilo'
UNION ALL
SELECT id, 'Semi Naked Floral', 'Bizcocho semidescubierto con flores naturales comestibles', '/assets/atelier/semi-naked.jpg', TRUE, TRUE, 4 
FROM grupos_personalizacion WHERE codigo = 'cobertura_estilo';