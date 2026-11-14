# Stand-in stock images

These are used only for the local design preview, until the client sends real photos. The site has no video. They are listed in `scripts/stock/stock-images.json`, downloaded and converted by `npm run stock`, and stored in `public/demo/`. The local demo database (`seeds/demo-local.sql`) points the Home page at them. Replace them from the admin dashboard before launch.

Licences:
- **Pexels** photos: [Pexels License](https://www.pexels.com/license/). Free to use, including commercially, with no attribution required. Not allowed: selling unaltered copies, or implying the people shown endorse the business.
- **William Morris** wallpaper designs ("Willow"), Metropolitan Museum of Art: CC0 (public domain), via Wikimedia Commons ([Willow](https://commons.wikimedia.org/wiki/File:Willow_MET_DP306739.jpg)).

| File in `public/demo/` | Used for | Source |
|---|---|---|
| hero-upholstery | Hero slide 1 | [Pexels 1866149](https://www.pexels.com/photo/1866149/) |
| hero-curtains | Hero slide 2 | [Pexels 18228697](https://www.pexels.com/photo/18228697/) |
| hero-carpets | Hero slide 3 | [Pexels 6969866](https://www.pexels.com/photo/6969866/) |
| cat-upholstery | Category: Upholstery Fabric | [Pexels 5824901](https://www.pexels.com/photo/5824901/) |
| cat-curtains | Category: Curtains & Blinds | [Pexels 19300022](https://www.pexels.com/photo/19300022/) |
| cat-carpets | Category: Carpets & Mats | [Pexels 1571468](https://www.pexels.com/photo/1571468/) |
| cat-cushions | Category: Cushions | [Pexels 5490356](https://www.pexels.com/photo/5490356/) |
| cat-wallpaper | Category: Wallpaper | William Morris, Willow (Met Museum, CC0) |
| enquiry-showroom | Spare, not shown on the page since the enquiry form replaced the photo | [Pexels 2079249](https://www.pexels.com/photo/2079249/) |

## About Us and Contact

| File in `public/demo/` | Used for | Source |
|---|---|---|
| about-hero | About Us: header photo | [Pexels 365067](https://www.pexels.com/photo/365067/) |
| about-story | About Us: "Who we are" photo | [Pexels 6766365](https://www.pexels.com/photo/6766365/) |
| about-showroom | About Us: "Visit us" photo; Contact: showroom card | [Pexels 17331180](https://www.pexels.com/photo/17331180/) (not the client's showroom) |
| about-band | About Us: closing photo band | [Pexels 18252187](https://www.pexels.com/photo/18252187/) |
| contact-hero | Contact: header photo | [Pexels 9980246](https://www.pexels.com/photo/9980246/) |

The Gallery page was removed on 13 Nov 2026 (replaced by About Us), with its photos.

## Interactive room textures

The interactive room on the Home page (13 Nov 2026) replaced the photo-swap décor section and "Our looks", and their photos were removed. The room is drawn in code (`components/home/room/shapes.tsx`); only the materials are images:

| Files in `public/demo/` | Used for | Source |
|---|---|---|
| tex-cur-*, tex-bl-*, tex-sofa-*, tex-arm-*, tex-cush-*, tex-wall-* | Fabrics and wallpapers: square tiles, 320 px, repeated across the element | Drawn by `node scripts/stock/make-textures.mjs` (no third-party content) |
| rug-* | Rugs: one top-down picture of the whole rug | Same script |
| tex-floor-oak | The wooden floor (not changeable) | Same script |

For the real room, each option needs:
- **Fabric or wallpaper:** one straight-on, evenly lit photo of the material, cut square (about 1000 x 1000 px), showing a few repeats of any pattern. It is repeated across the element, so a photo whose edges match up looks best.
- **Rug:** one photo of the whole rug from directly above, edges straight.
- A name and a one-line description.

## Collection pages (15 Nov 2026)

Stand-in catalogue: about 80 products across the client's category tree, one photo each. Listed in `scripts/stock/catalogue-demo.json`; `node scripts/stock/make-catalogue.mjs` downloads the originals (cached in `.stock/originals/`), cuts each to 4:5 (sometimes recoloured to show a colour range), writes `public/demo/p-<category id>-<slug>-{480,800,1200}.webp` and the header photos `sc-*`, and writes `seeds/demo-catalogue.sql` (loaded by `npm run db:seed:demo`, and by the live preview build). The category pages reuse the Home hero photos as headers for Upholstery, Curtains & Blinds and Carpets & Mats.

Licences: Pexels photos under the [Pexels License](https://www.pexels.com/license/). Wikimedia Commons items are The Met Open Access (CC0) or Cooper Hewitt (public domain). None show the client's products; the client's real products replace them from the admin dashboard.

| Source | Used for |
|---|---|
| [Pexels 34563915](https://www.pexels.com/photo/34563915/) | Suede, Tan; Suede, Mocha; Suede, Stone |
| [Pexels 4394231](https://www.pexels.com/photo/4394231/) | Velvet, Forest; Velvet, Midnight; Velvet, Wine; Velvet, Teal |
| [Pexels 5806986](https://www.pexels.com/photo/5806986/) | Boucle, Ivory; Boucle, Berry; Boucle, Pebble |
| [Pexels 6850485](https://www.pexels.com/photo/6850485/) | Tweed, Blue; Tweed, Grey |
| [Pexels 36025523](https://www.pexels.com/photo/36025523/) | Jute, Natural; Jute, Sand; Mat, Coir |
| [Pexels 1866149](https://www.pexels.com/photo/1866149/) | Leatherite, Cognac; Leatherite, Black; Leatherite, Olive |
| [Pexels 4352247](https://www.pexels.com/photo/4352247/) | Boucle, Cream |
| [Pexels 6496460](https://www.pexels.com/photo/6496460/) | Linen, White; Linen, Flax; Roman, Natural Linen; Roman, Sage Linen |
| [Pexels 5908313](https://www.pexels.com/photo/5908313/) | Linen, Natural |
| [Pexels 9298743](https://www.pexels.com/photo/9298743/) | Velvet, Bronze; Velvet, Plum |
| [Pexels 4814046](https://www.pexels.com/photo/4814046/) | Polyester, Blush; Polyester, Silver |
| [Pexels 4814049](https://www.pexels.com/photo/4814049/) | Polyester, Champagne |
| [Pexels 17082005](https://www.pexels.com/photo/17082005/) | Blackout, Charcoal |
| [Pexels 12214094](https://www.pexels.com/photo/12214094/) | Blackout, Espresso |
| [Pexels 17081981](https://www.pexels.com/photo/17081981/) | Dimout, Walnut |
| [Pexels 19929940](https://www.pexels.com/photo/19929940/) | Dimout, Taupe |
| [Pexels 35321639](https://www.pexels.com/photo/35321639/) | Sheer Linen, White |
| [Pexels 14095427](https://www.pexels.com/photo/14095427/) | Sheer Linen, Warm |
| [Pexels 19432744](https://www.pexels.com/photo/19432744/) | Embroidered Sheer, Floral |
| [Pexels 15819881](https://www.pexels.com/photo/15819881/) | Embroidered Sheer, Lace |
| [Pexels 30519220](https://www.pexels.com/photo/30519220/) | Tissue, Amber |
| [Pexels 11849111](https://www.pexels.com/photo/11849111/) | Tissue, Mist |
| [Pexels 6843262](https://www.pexels.com/photo/6843262/) | Organza, Peach; Organza, Blush; Organza, Ivory |
| [Pexels 27050608](https://www.pexels.com/photo/27050608/) | Print, Bright Floral |
| [Pexels 19304053](https://www.pexels.com/photo/19304053/) | Roller, Graphite |
| [Pexels 7046155](https://www.pexels.com/photo/7046155/) | Roller, Red |
| [Pexels 13137129](https://www.pexels.com/photo/13137129/) | Zebra, Black and White |
| [Pexels 18622213](https://www.pexels.com/photo/18622213/) | Wooden Blinds, Honey |
| [Pexels 36197104](https://www.pexels.com/photo/36197104/) | Wooden Blinds, Light |
| [Pexels 36687249](https://www.pexels.com/photo/36687249/) | Carpet, Persian Red |
| [Pexels 18498244](https://www.pexels.com/photo/18498244/) | Carpet, Tree of Life |
| [Pexels 1571468](https://www.pexels.com/photo/1571468/) | Carpet, Grey Trellis |
| [Pexels 6969866](https://www.pexels.com/photo/6969866/) | Carpet, Patterned |
| [Pexels 11731930](https://www.pexels.com/photo/11731930/) | Mat, Woven Stack |
| [Pexels 6312024](https://www.pexels.com/photo/6312024/) | Cushion, Mustard |
| [Pexels 7873247](https://www.pexels.com/photo/7873247/) | Cushion, Diamond Print; header photo (sc-cushions) |
| [Pexels 9462191](https://www.pexels.com/photo/9462191/) | Cushion, Black and White Check |
| [Pexels 5490356](https://www.pexels.com/photo/5490356/) | Cushion, Stripe |
| [Pexels 1571460](https://www.pexels.com/photo/1571460/) | header photo (sc-collection) |
| [Woven silk damask, The Met (CC0)](https://commons.wikimedia.org/wiki/File:Woven_silk_damask_MET_DP-12900-004.jpg) | Jacquard, Sage Damask; Jacquard, Rose |
| [Woven silk damask, The Met (CC0)](https://commons.wikimedia.org/wiki/File:Woven_silk_damask_MET_DP-12900-003.jpg) | Jacquard, Blue Damask; Jacquard, Celadon |
| [Woven silk damask, The Met (CC0)](https://commons.wikimedia.org/wiki/File:Woven_silk_damask_MET_DP-12900-001.jpg) | Jacquard, Gold Damask |
| [Printed textile piece, The Met (CC0)](https://commons.wikimedia.org/wiki/File:Piece_MET_DP293367.jpg) | Print, Floral; Print, Botanical Blind |
| [Les Travaux de la Manufacture, The Met (CC0)](https://commons.wikimedia.org/wiki/File:%22Les_Travaux_de_la_Manufacture%22_MET_DP266937.jpg) | Print, Red Toile; Print, Blue Toile |
| [Les Travaux de la Manufacture, The Met (CC0)](https://commons.wikimedia.org/wiki/File:%22Les_Travaux_de_la_Manufacture%22_MET_DP266935.jpg) | Print, Manufacture Toile |
| [Les Travaux de la Manufacture, The Met (CC0)](https://commons.wikimedia.org/wiki/File:%22Les_Travaux_de_la_Manufacture%22_MET_DP266936.jpg) | Print, Toile Blind |
| [La Maison Brulante, The Met (CC0)](https://commons.wikimedia.org/wiki/File:%22La_Maison_Brulante%22_MET_DP5331_31.130.5.jpg) | Print, Rose Toile |
| [Fringe, The Met (CC0)](https://commons.wikimedia.org/wiki/File:Fringe_MET_DP5691_36.90.2048.jpg) | Trim, Gold Fringe |
| [Fringe, The Met (CC0)](https://commons.wikimedia.org/wiki/File:Fringe_MET_DP5623_36.90.1858.jpg) | Trim, Tassel Fringe |
| [William Morris, Willow, The Met (CC0)](https://commons.wikimedia.org/wiki/File:Willow_MET_DP306739.jpg) | Wallpaper, Willow |
| [Alfred Peats wallpaper sample book, Cooper Hewitt (public domain)](https://commons.wikimedia.org/wiki/File:Sample_Book%2C_Alfred_Peats_Prize_Wallpaper%2C_ca._1910_%28CH_18623261%29.jpg) | Wallpaper, Rose Scroll |
| [Alfred Peats wallpaper sample book, Cooper Hewitt (public domain)](https://commons.wikimedia.org/wiki/File:Sample_Book%2C_Alfred_Peats_Prize_Wallpaper%2C_ca._1910_%28CH_18623261-4%29.jpg) | Wallpaper, Lilac Trellis |
| [Alfred Peats wallpaper sample book, Cooper Hewitt (public domain)](https://commons.wikimedia.org/wiki/File:Sample_Book%2C_Alfred_Peats_Prize_Wallpaper%2C_ca._1910_%28CH_18623261-5%29.jpg) | Wallpaper, Garland |
| [Alfred Peats wallpaper sample book, Cooper Hewitt (public domain)](https://commons.wikimedia.org/wiki/File:Sample_Book%2C_Alfred_Peats_Prize_Wallpaper%2C_ca._1910_%28CH_18623261-27%29.jpg) | Wallpaper, Blue Medallion |
| [Alfred Peats wallpaper sample book, Cooper Hewitt (public domain)](https://commons.wikimedia.org/wiki/File:Sample_Book%2C_Alfred_Peats_Prize_Wallpaper%2C_ca._1910_%28CH_18623261-29%29.jpg) | Wallpaper, Rose Border; header photo (sc-wallpapers) |
| [Alfred Peats wallpaper sample book, Cooper Hewitt (public domain)](https://commons.wikimedia.org/wiki/File:Sample_Book%2C_Alfred_Peats_Prize_Wallpaper%2C_ca._1910_%28CH_18623261-31%29.jpg) | Wallpaper, Yellow Floral |
