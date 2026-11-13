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
