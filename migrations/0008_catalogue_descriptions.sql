-- Migration number: 0008 	 2026-11-15
-- Clear descriptions for the five categories and every subcategory, shown
-- under each Collection page's title and on its cards (15 Nov 2026: "add a
-- clear description"). Plain descriptions of what each type is, with no
-- claims about stock, prices or service. Editable later from the admin
-- dashboard. The category description is stored in categories.tagline.

UPDATE categories SET tagline = 'Fabrics and leatherite for covering sofas, chairs and headboards.' WHERE id = 1;
UPDATE categories SET tagline = 'Curtains and blinds for every window. Curtains come as main fabrics, blackouts and dimouts, sheers, prints and trims; blinds as roller, Roman, zebra, wooden and printed.' WHERE id = 2;
UPDATE categories SET tagline = 'Carpets for living rooms and bedrooms, and mats for doorways and everyday use.' WHERE id = 3;
UPDATE categories SET tagline = 'Cushions to finish a sofa, bed or chair.' WHERE id = 4;
UPDATE categories SET tagline = 'Wallpapers in patterns and textures, for a feature wall or a whole room.' WHERE id = 5;

-- Upholstery
UPDATE subcategories SET description = 'Upholstery fabrics, by type: suede, velvet, boucle, jacquard, jute, prints and tweed.' WHERE id = 10;
UPDATE subcategories SET description = 'A soft fabric with a fine, brushed surface and a matt look.' WHERE id = 11;
UPDATE subcategories SET description = 'A fabric with a short, dense pile that feels soft and catches the light.' WHERE id = 12;
UPDATE subcategories SET description = 'A fabric woven from looped yarn, with a soft, nubby texture.' WHERE id = 13;
UPDATE subcategories SET description = 'A fabric with the pattern woven into it rather than printed on top.' WHERE id = 14;
UPDATE subcategories SET description = 'A natural plant fibre with a coarse, woven look.' WHERE id = 15;
UPDATE subcategories SET description = 'Upholstery fabrics with a printed pattern.' WHERE id = 16;
UPDATE subcategories SET description = 'A tightly woven fabric with a textured, flecked look.' WHERE id = 17;
UPDATE subcategories SET description = 'A leather-look upholstery material for sofas and chairs.' WHERE id = 20;

-- Curtains
UPDATE subcategories SET description = 'Curtain fabrics, by type: main fabrics, blackouts and dimouts, sheers, prints and trims.' WHERE id = 100;
UPDATE subcategories SET description = 'Everyday curtain fabrics in linen, jacquard, boucle, velvet and polyester.' WHERE id = 110;
UPDATE subcategories SET description = 'Curtain fabrics with a natural, slightly uneven linen weave.' WHERE id = 111;
UPDATE subcategories SET description = 'Curtain fabrics with the pattern woven in.' WHERE id = 112;
UPDATE subcategories SET description = 'Curtain fabrics woven from looped yarn, with a soft texture.' WHERE id = 113;
UPDATE subcategories SET description = 'Heavier curtain fabrics with a soft pile and a rich look.' WHERE id = 114;
UPDATE subcategories SET description = 'Smooth curtain fabrics that hang evenly.' WHERE id = 115;
UPDATE subcategories SET description = 'Curtains that keep a room dark or dim: 100% blackout or 80% blackout.' WHERE id = 120;
UPDATE subcategories SET description = 'Curtains made to block out the light, for bedrooms and media rooms.' WHERE id = 121;
UPDATE subcategories SET description = 'Curtains that dim a room while letting a little light through.' WHERE id = 122;
UPDATE subcategories SET description = 'Light, see-through curtains that soften daylight: linen, embroidery, tissue and organza.' WHERE id = 130;
UPDATE subcategories SET description = 'Sheer curtains with a light, linen-look weave.' WHERE id = 131;
UPDATE subcategories SET description = 'Sheer curtains with embroidered patterns.' WHERE id = 132;
UPDATE subcategories SET description = 'Fine, light sheer curtains with a soft sheen.' WHERE id = 133;
UPDATE subcategories SET description = 'Crisp, see-through sheer curtains.' WHERE id = 134;
UPDATE subcategories SET description = 'Curtain fabrics with a printed pattern.' WHERE id = 140;
UPDATE subcategories SET description = 'Fringes, tassels and edgings to finish curtains.' WHERE id = 150;

-- Blinds
UPDATE subcategories SET description = 'Blinds, by type: roller, Roman, zebra, wooden and printed.' WHERE id = 200;
UPDATE subcategories SET description = 'A flat fabric blind that rolls up at the top of the window.' WHERE id = 201;
UPDATE subcategories SET description = 'A fabric blind that folds into soft pleats as it is raised.' WHERE id = 202;
UPDATE subcategories SET description = 'A blind with alternating sheer and solid bands, lined up to let light in or shut it out.' WHERE id = 203;
UPDATE subcategories SET description = 'Blinds with wooden slats that tilt to control the light.' WHERE id = 204;
UPDATE subcategories SET description = 'Blinds with a printed pattern.' WHERE id = 205;

-- Carpets & Mats
UPDATE subcategories SET description = 'Carpets and rugs for living rooms and bedrooms.' WHERE id = 300;
UPDATE subcategories SET description = 'Mats for doorways and everyday use.' WHERE id = 301;
