# Field guide artwork — generation manifest

Approved style, decided 2026-07-27: **photorealistic, in place as the crew
actually finds it** — a driveway meeting a garage, siding on a real wall — not
an isolated product shot on white. A worker should look at it and think
"yeah, that's what I'm cleaning," not "I think that's what this is."

Two asset types:

- **`img`** — the tile in the material and surface grids. Square, 1:1. The app
  crops square from the centre, so frame the surface centrally.
- **`diagram`** — the large labelled image above the steps, for surfaces where
  knowing *which part* is the hard bit (fascia vs trim vs soffit). 4:3, bold
  arrows, printed labels.

A missing file falls back to the Font Awesome glyph, so art can land one
surface at a time without breaking anything.

---

## Use the right model

This is the single biggest lever, and the first batch got it wrong.

| Job | Model | Why |
|---|---|---|
| Surface photos (`img`) | **`kling_omni_image`** | Tagged photorealistic; built for realism. |
| Labelled diagrams (`diagram`) | **`nano_banana_pro`** | The only one that reliably renders readable text. |

The first surface batch was generated with `nano_banana_pro`, whose own
description is *"ultimate quality, text and diagrams."* It is a diagram model.
That is why those images came back looking rendered rather than photographed —
right tool for the fascia diagram, wrong tool for a brick wall.

---

## Feed it a real photo

Every model above accepts a reference image (`medias`, role `image_references`
for kling, `image` for the nano models). A real photo from one of our own jobs
as reference beats any amount of prompt wording, and it makes the output look
like *our market* — our concrete, our algae, our brick.

Workflow: `media_upload` or `media_import_url` the reference, pass the returned
`media_id` in `medias[].value`, then prompt for the framing you want.

---

## Why the first batch read as fake

Worth naming, because these are the things to prompt against:

1. **Too much background blur.** Nearly every shot had a narrow sharp band and
   heavy bokeh everywhere else. Real jobsite photos are mostly in focus —
   phones have small sensors and deep depth of field.
2. **Dirt that ignores gravity.** Grime was sprinkled evenly like noise. Real
   dirt runs *down*: streaks under seams, heavier at the bottom course, algae
   worst on the shaded north side and where the gutter overflows.
3. **Surfaces too new.** No caulk lines, no nail heads, no mismatched
   replacement panel, no fading where the sun hits. Real houses are repaired.
4. **Melted backgrounds.** In the driveway shot the neighbouring houses and the
   garage interior dissolve into mush. Keep backgrounds simple or crop them out.
5. **Repeating texture.** Woodgrain and stucco swirls tiled visibly. Ask for
   irregular, non-repeating texture.

---

## Prompt recipe — `img`

> Documentary photograph of {SUBJECT} on an ordinary suburban house,
> {ANGLE}. Shot handheld on a phone camera, wide depth of field with the whole
> surface in sharp focus — no background blur. Flat overcast daylight, no
> harsh sun, no lens flare. The surface shows honest age: {WEAR — e.g. algae
> streaking downward from the seams, heavier growth along the bottom course,
> faint rain runoff marks, a caulk line, visible nail heads, one slightly
> mismatched replacement piece}. Irregular non-repeating texture. Plain
> uncluttered background. No people, no text, no watermark, no vignette.

Model `kling_omni_image`, `aspect_ratio: "1:1"`, reference photo attached where
we have one.

Per-surface, swap in the detail that makes it unmistakably that surface and not
its neighbour:

- **Driveway** — meets a garage door, tyre marks, a control joint running across.
- **Sidewalk** — runs through grass, regular slab joints, edge crumbling slightly.
- **Vinyl siding** — corner post, J-channel, the interlocking bottom lip, gloss.
- **Wood siding** — real knots, splits, grain raised where paint has failed.
- **Fiber cement** — woodgrain embossing but butt joints with caulk, matte.
- **Stucco** — irregular hand-troweled swirl, a hairline crack, window sill.
- **Composite decking** — uniform grain, hidden fasteners, no knots.
- **Pavers** — individual units, sand joints, slight settling out of level.

## Prompt recipe — `diagram`

> Documentary photograph of {SUBJECT} on a real house, {ANGLE}. Clean bold
> black arrows point to each part with short printed labels reading exactly:
> {LABELS}. Labels large, legible, sans-serif, high contrast. Flat overcast
> daylight, sharp focus throughout, instructional reference style. No people,
> no watermark.

Model `nano_banana_pro`, `aspect_ratio: "4:3"`.

---

## Filenames

`field-guide-data.js` references these by name. Drop the file in this folder
and it appears.

| Surface | File | State |
|---|---|---|
| Trim / Fascia (labelled diagram) | `fascia-diagram.png` | In repo |
| Concrete — Driveway | `concrete-driveway.jpg` | Wired, awaiting file |
| Brick — House Siding | `brick-siding.jpg` | Wired, awaiting file |
| Vinyl — House Siding | `vinyl-siding.jpg` | Wired, awaiting file |
| Wood — House Siding | `wood-siding.jpg` | Wired, awaiting file |
| Stucco — House Siding | `stucco-siding.jpg` | Wired, awaiting file |
| Painted — Painted Wood Siding | `painted-wood-siding.jpg` | Wired, awaiting file |
| Remaining 33 surfaces + 12 material tiles | — | Not generated |

---

## Still the best option

Real photos from our own jobs. We stand in front of every one of these
surfaces every week, the phone in the app already takes and compresses photos
for job records, and a real photo cannot look fake. Generation is the fallback
for surfaces we rarely see — tile roof, storefront glass.
