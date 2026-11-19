-- LOCAL DESIGN PREVIEW ONLY. Never run this against the client's database.
--
-- The stand-in content of the interactive room on the Home page. It is not
-- edited from the dashboard, so it is also loaded into builds that take their
-- other content from the dashboard (scripts/build-db.mjs).
--
-- Apply with: npm run db:seed:demo
-- Interactive room: stand-in fabrics, drawn by scripts/stock/make-textures.mjs.
-- Names and descriptions only say how each stand-in looks; the client's
-- real fabrics (photo, name, description) replace them.
-- Elements: 1 curtains, 2 blind, 3 sofa, 4 armchair, 5 cushions, 6 rug, 7 wall.
DELETE FROM room_options;
INSERT INTO room_options (element_id, name, description, texture_key, tile, colour, position) VALUES
  (1, 'Ivory linen',      'A plain ivory with a soft, slubbed weave.',        'demo/tex-cur-ivory-linen',   150, '#ebe4d4', 1),
  (1, 'Sage linen',       'A muted sage green with a linen weave.',           'demo/tex-cur-sage-linen',    150, '#a8b399', 2),
  (1, 'Rust velvet',      'A deep rust with a smooth velvet pile.',           'demo/tex-cur-rust-velvet',   150, '#8e4a34', 3),
  (1, 'Navy velvet',      'A dark navy with a smooth velvet pile.',           'demo/tex-cur-navy-velvet',   150, '#2c3651', 4),
  (1, 'Grey stripe',      'Fine grey stripes on a pale ground.',              'demo/tex-cur-grey-stripe',   150, '#d4d1ca', 5),
  (2, 'Natural weave',    'A woven natural tone with a basket texture.',      'demo/tex-bl-natural-weave',  90,  '#c4ac83', 1),
  (2, 'White linen',      'A clean white with a light linen weave.',          'demo/tex-bl-white-linen',    120, '#f1ede4', 2),
  (2, 'Charcoal linen',   'A dark charcoal with a linen weave.',              'demo/tex-bl-charcoal-linen', 120, '#4b4a48', 3),
  (2, 'Mustard',          'A warm mustard yellow.',                           'demo/tex-bl-mustard',        120, '#c79d3f', 4),
  (3, 'Green velvet',     'A forest green with a smooth velvet pile.',        'demo/tex-sofa-green-velvet', 130, '#3e5a45', 1),
  (3, 'Grey weave',       'A mid grey with a close, flecked weave.',          'demo/tex-sofa-grey-weave',   110, '#8f908c', 2),
  (3, 'Ivory bouclé',     'A soft ivory with a looped, nubby texture.',       'demo/tex-sofa-ivory-boucle', 120, '#e5ddcf', 3),
  (3, 'Tan leather',      'A warm tan with a natural leather grain.',         'demo/tex-sofa-tan-leather',  160, '#a76a3e', 4),
  (3, 'Blue linen',       'A dusty blue with a linen weave.',                 'demo/tex-sofa-blue-linen',   120, '#5d7187', 5),
  (4, 'Mustard velvet',   'A golden mustard with a smooth velvet pile.',      'demo/tex-arm-mustard-velvet', 120, '#bf8e2f', 1),
  (4, 'Floral print',     'Small red flowers and green leaves on cream.',     'demo/tex-arm-floral-print',  110, '#ece2cf', 2),
  (4, 'Grey herringbone', 'A grey zigzag herringbone weave.',                 'demo/tex-arm-grey-herringbone', 90, '#928f89', 3),
  (4, 'Blush linen',      'A soft blush pink with a linen weave.',            'demo/tex-arm-blush-linen',   120, '#d9b3a5', 4),
  (5, 'Terracotta',       'A warm terracotta with a linen weave.',            'demo/tex-cush-terracotta',   80,  '#b5603f', 1),
  (5, 'Zigzag print',     'Black zigzags on an ivory ground.',                'demo/tex-cush-geometric',    80,  '#d9d2c3', 2),
  (5, 'Navy stripe',      'Navy stripes on cream.',                           'demo/tex-cush-stripe',       80,  '#c9c3b6', 3),
  (5, 'Olive velvet',     'A deep olive with a smooth velvet pile.',          'demo/tex-cush-olive-velvet', 90,  '#6c6a38', 4),
  (5, 'Brown check',      'A brown check on a sand ground.',                  'demo/tex-cush-check',        80,  '#c7b394', 5),
  (6, 'Classic red',      'A red field with a navy border and a centre medallion.', 'demo/rug-classic-red', 120, '#8c2f2a', 1),
  (6, 'Natural jute',     'A natural woven look with a darker border.',       'demo/rug-jute',              120, '#c3a575', 2),
  (6, 'Grey lattice',     'A grey diamond lattice with a dark border.',       'demo/rug-grey-geometric',    120, '#c9c4bc', 3),
  (6, 'Ivory soft pile',  'A plain ivory with a deep, soft pile.',            'demo/rug-ivory-shag',        120, '#ebe4d7', 4),
  (7, 'Sage trellis',     'A pale sage with a fine diamond trellis.',         'demo/tex-wall-sage-trellis', 200, '#cfd3c3', 1),
  (7, 'Ivory damask',     'A tone-on-tone medallion pattern on ivory.',       'demo/tex-wall-ivory-damask', 260, '#e8e0d2', 2),
  (7, 'Terracotta stripe', 'Wide soft terracotta stripes.',                   'demo/tex-wall-terracotta-stripe', 220, '#e3c8b8', 3),
  (7, 'Navy floral',      'Small gold flowers on a dark navy ground.',        'demo/tex-wall-navy-floral',  200, '#2f3a4c', 4),
  (7, 'Plain plaster',    'A plain warm white with a soft plaster texture.',  'demo/tex-wall-plaster',      500, '#e8e0d3', 5);
