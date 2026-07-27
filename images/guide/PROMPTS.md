# Field guide artwork — generation manifest

Approved style, decided 2026-07-27: **photorealistic, shot in place as the
crew actually finds it** — a sidewalk running through grass, siding on a real
wall — not an isolated product shot floating on white. A worker should look at
it and think "yeah, that's what I'm cleaning," not "I think that's what this
is."

Two asset types:

- **`img`** — the tile icon in the material and surface grids. Square, 1:1.
- **`diagram`** — the large labelled image above the steps, for surfaces where
  knowing *which part* is the hard bit (fascia vs trim vs soffit). 4:3, with
  bold arrows and printed labels.

Filenames are referenced from `field-guide-data.js` as `img:` and `diagram:`.
A missing file falls back to the Font Awesome glyph, so these can land one at
a time without breaking anything.

## Shared prompt template — `img`

> Photorealistic photograph of {SUBJECT} in place on a real residential
> property, {ANGLE}. {DISTINGUISHING DETAIL — the thing that makes it
> unmistakably this surface and not a similar one}. Natural daylight, shallow
> depth of field, sharp focus on the subject, realistic materials and wear.
> No people, no text, no watermarks.

Generated with `nano_banana_pro`, `aspect_ratio: "1:1"`. Cut the background
after approval with `remove_background`, or leave the scene if in-place reads
better at tile size — decide per image once a few are in.

## Shared prompt template — `diagram`

> Photorealistic photograph of {SUBJECT} on a real house, {ANGLE}. Clean bold
> black arrows point to each part with short printed labels reading exactly:
> {LABELS}. Labels large, legible, sans-serif, high contrast. Natural
> daylight, sharp focus, instructional reference style. No people, no
> watermarks.

`aspect_ratio: "4:3"`.

## Status

| Asset | File | State |
|---|---|---|
| Trim / Fascia diagram | `fascia-diagram.png` | **Done** — arrows read FASCIA / SOFFIT / GUTTER / TRIM |
| Everything else | — | Not generated (out of credits 2026-07-27) |

## To generate

12 material tiles: concrete, brick, vinyl, wood, stucco, metal, composite
decking, roofing, pavers/stone, painted surfaces, glass/windows, gutters.

38 surface tiles — the `surfaces` arrays in `field-guide-data.js` are the
source of truth for the list. The ones worth extra care, because crew mix
them up:

- **Concrete driveway vs sidewalk vs patio** — sidewalk needs its joint lines
  and a run through grass; driveway needs to meet a garage; patio needs to sit
  against a house with furniture nearby.
- **Brick house siding vs brick walkway** — the whole method changes between
  them, so the images must not look alike.
- **Vinyl siding vs wood siding vs stucco** — three "walls" that take three
  different rules. Shoot each close enough to see the material.
- **Composite decking vs wood decking** — composite should show the uniform
  grain and hidden fasteners.
- **Pavers vs stamped concrete** — pavers need visible individual units and
  sand joints.

Additional diagrams worth doing while the labelled style is set up:

- Gutter exterior vs interior/downspout.
- Deck: boards vs railings vs joists.
- Window: glass vs frame vs seal, since chemical is allowed on one and not the
  others.
