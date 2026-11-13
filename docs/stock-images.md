# Stand-in stock images

These are used only for the local design preview, until the client sends real photos. The site has no video. They are listed in `scripts/stock/stock-images.json`, downloaded and converted by `npm run stock`, and stored in `public/demo/`. The local demo database (`seeds/demo-local.sql`) points the Home page at them. Replace them from the admin dashboard before launch.

Licences:
- **Pexels** photos: [Pexels License](https://www.pexels.com/license/). Free to use, including commercially, with no attribution required. Not allowed: selling unaltered copies, or implying the people shown endorse the business.
- **William Morris** wallpaper designs ("Willow", "Trellis", "Fruit or Pomegranate", "Wild Tulip", "Blackthorn"), Metropolitan Museum of Art: CC0 (public domain), via Wikimedia Commons ([Willow](https://commons.wikimedia.org/wiki/File:Willow_MET_DP306739.jpg), [Trellis](https://commons.wikimedia.org/wiki/File:Trellis_MET_DP306738.jpg), [Fruit](https://commons.wikimedia.org/wiki/File:Fruit_or_Pomegranate_MET_DP109416.jpg), [Wild Tulip](https://commons.wikimedia.org/wiki/File:Wild_Tulip_MET_DP146520.jpg), [Blackthorn](https://commons.wikimedia.org/wiki/File:Blackthorn_MET_ES8433.jpg)).

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
| decor-velvet, swatch-velvet | Décor: Green velvet; also the "Velvet lounge" look | [Pexels 1918291](https://www.pexels.com/photo/1918291/) |
| decor-leather, swatch-leather | Décor: Tan leather | [Pexels 1866149](https://www.pexels.com/photo/1866149/) |
| decor-grey, swatch-grey | Décor: Grey weave | [Pexels 1571471](https://www.pexels.com/photo/1571471/) |
| decor-ivory, swatch-ivory | Décor: Ivory linen | [Pexels 4352247](https://www.pexels.com/photo/4352247/) |
| look-living | Our looks: "Living room" | [Pexels 1571460](https://www.pexels.com/photo/1571460/) |
| look-bedroom | Our looks: "Bedroom" | [Pexels 6782567](https://www.pexels.com/photo/6782567/) |
| enquiry-showroom | Spare, not shown on the page since the enquiry form replaced the photo | [Pexels 2079249](https://www.pexels.com/photo/2079249/) |

## Gallery

Gallery photos are resized but never cropped (`"aspect": "original"` in the manifest), so the whole frame shows.

| File in `public/demo/` | Gallery category | Source |
|---|---|---|
| gal-curtains-sheer | Curtains & Blinds | [Pexels 14095427](https://www.pexels.com/photo/14095427/) |
| gal-curtains-print | Curtains & Blinds | [Pexels 9298743](https://www.pexels.com/photo/9298743/) |
| gal-curtains-white | Curtains & Blinds | [Pexels 9980246](https://www.pexels.com/photo/9980246/) |
| gal-curtains-amber | Curtains & Blinds | [Pexels 18252187](https://www.pexels.com/photo/18252187/) |
| gal-blinds-wood | Curtains & Blinds | [Pexels 18622213](https://www.pexels.com/photo/18622213/) |
| gal-blinds-vertical | Curtains & Blinds | [Pexels 4220436](https://www.pexels.com/photo/4220436/) |
| gal-fabric-swatches | Upholstery Fabric | [Pexels 6766365](https://www.pexels.com/photo/6766365/) |
| gal-fabric-rolls | Upholstery Fabric | [Pexels 10579084](https://www.pexels.com/photo/10579084/) |
| gal-fabric-weave | Upholstery Fabric | [Pexels 6634450](https://www.pexels.com/photo/6634450/) |
| gal-fabric-stack | Upholstery Fabric | [Pexels 365067](https://www.pexels.com/photo/365067/) |
| gal-carpet-pattern | Carpets & Mats | [Pexels 36687249](https://www.pexels.com/photo/36687249/) |
| gal-carpet-room | Carpets & Mats | [Pexels 1571468](https://www.pexels.com/photo/1571468/) (same photo as the category tile, uncropped) |
| gal-carpet-large | Carpets & Mats | [Pexels 6969866](https://www.pexels.com/photo/6969866/) (same photo as hero slide 3, uncropped) |
| gal-cushion-mustard | Cushions | [Pexels 6312024](https://www.pexels.com/photo/6312024/) |
| gal-cushion-lounge | Cushions | [Pexels 17331180](https://www.pexels.com/photo/17331180/) |
| gal-cushion-sofa | Cushions | [Pexels 5490356](https://www.pexels.com/photo/5490356/) (same photo as the category tile, uncropped) |
| gal-wallpaper-trellis | Wallpaper | William Morris, Trellis (Met Museum, CC0) |
| gal-wallpaper-fruit | Wallpaper | William Morris, Fruit or Pomegranate (Met Museum, CC0) |
| gal-wallpaper-tulip | Wallpaper | William Morris, Wild Tulip (Met Museum, CC0) |
| gal-wallpaper-blackthorn | Wallpaper | William Morris, Blackthorn (Met Museum, CC0) |

The décor stand-ins show four different sofas. For the real feature, the client photographs one product (for example, one sofa) in each fabric, so only the fabric changes when a visitor taps a swatch.
