# Hermes: field guide artwork

50 images for the Clearline crew field guide. A worker standing in front of a
surface taps through the guide and should look at the picture and think *"yeah,
that's what I'm cleaning"* — not *"I think that's what this is."*

Save every file into `Clearline/images/guide/` with the **exact filename** from
the tables below. Nothing else needs wiring — the app already references these
names, and any file that isn't there yet falls back to an icon.

---

## Settings

| | |
|---|---|
| Model | `kling_omni_image` |
| Aspect ratio | `1:1` |
| Size | 1024×1024 is fine; they display at ~84px so don't go bigger |
| Format | `.jpg` |

**Do not use `nano_banana_pro` for these.** It is a text-and-diagram model —
that's what the first batch used and why those came back looking rendered
rather than photographed.

If you can attach a reference photo (`medias`, role `image_references`), do it.
A real photo as reference beats any prompt wording.

---

## The prompt

Paste this, swapping in the SUBJECT and WEAR for each row:

> Documentary photograph of {SUBJECT} on an ordinary suburban house, shot
> handheld on a phone camera. Wide depth of field — the whole surface sharp
> front to back, no background blur, no bokeh. Flat overcast daylight, no
> harsh sun, no lens flare, no vignette. Honest age and wear: {WEAR}. Irregular
> non-repeating texture. Plain uncluttered background. No people, no text, no
> watermark.

**Five rules that make or break it** — the first batch failed on all of these:

1. **No background blur.** Phones have deep focus. A blurred background is the
   single biggest tell.
2. **Dirt runs downward.** Streaks below seams, heaviest along the bottom
   course, algae worst on the shaded side and under an overflowing gutter.
   Never sprinkle grime evenly.
3. **Houses have been repaired.** Caulk lines, nail heads, one mismatched
   replacement piece, sun fade on the exposed side.
4. **Backgrounds must not melt.** Keep them simple or crop them out.
5. **Texture must not tile.** No repeating woodgrain or stucco swirl.

**Frame the surface centrally** — the app crops a square from the centre.

---

## Two that were wrong and need redoing

| File | What went wrong | Prompt notes |
|---|---|---|
| `stucco-house-siding.jpg` | Previous attempt was lap siding with woodgrain — boards and a corner trim board. That is fiber cement, not stucco. | One **continuous hand-troweled cement wall, no boards, no seams, no corner trim**. Irregular swirl texture, a hairline crack, weep screed at the base, a window with a sill, grey-green algae streaking down below the sill. |
| `wood-house-siding.jpg` | Previous attempt was painted wood with peeling paint — that's already used for `painted-wood-siding.jpg`. | **Bare or semi-transparent-stained cedar/pine lap siding, no paint.** Visible knots, grain raised and greyed with age, a split board, grey-black mildew low on the wall. |

---

## Surface tiles

| File | Subject and the detail that makes it unmistakable |
|---|---|
| `concrete-sidewalk.jpg` | Sidewalk running through a front lawn, regular slab joints across it, edges crumbling slightly, grass growing in one joint |
| `concrete-patio.jpg` | Back patio slab against a house, patio furniture at the edge, leaf staining, a downspout discharging onto it |
| `concrete-pool-deck.jpg` | Broom-finish concrete around a pool edge, coping visible, water line, faint algae in the texture |
| `concrete-garage-floor.jpg` | Inside a garage looking down, oil drip stains, a control joint, the bottom of the garage door |
| `brick-walkway.jpg` | Brick laid flat as a path through a lawn, running-bond pattern, moss in the joints, slight settling |
| `brick-retaining-wall.jpg` | Low brick retaining wall holding a garden bed, capstones on top, efflorescence and moss at the base |
| `brick-chimney.jpg` | Brick chimney rising past a roofline, flashing at the base, dark staining on the weather side |
| `vinyl-fence.jpg` | White vinyl privacy fence, flat panels between posts, post caps, green algae along the bottom rail |
| `vinyl-shutters.jpg` | Vinyl louvered shutters flanking a window, faded on the sun side, cobwebs and pollen in the louvres |
| `wood-deck.jpg` | Wood deck boards from standing height, visible gaps, screw heads, grey weathering, green mildew in the shaded corner |
| `wood-fence.jpg` | Wood privacy fence, pickets with visible grain and knots, greyed and mildewed near the ground |
| `wood-pergola.jpg` | Wood pergola over a patio, cross beams overhead, weathered grey, mildew on the shaded underside |
| `stucco-retaining-wall.jpg` | Stucco-finished retaining wall, continuous troweled surface, capstone, dirt splash and algae at the base |
| `metal-siding.jpg` | Painted aluminium lap siding, chalking paint, a shallow dent, faded on the sun side |
| `metal-gutters.jpg` | Aluminium gutter along a roof edge from the ground, dark tiger-stripe staining on the face, a downspout elbow |
| `metal-awnings.jpg` | Metal awning over a window or door, ribbed panels, dirt and leaf debris on top, faded paint |
| `metal-railings.jpg` | Painted metal railing on porch steps, rust bleeding at a weld, chipped paint |
| `composite-deck-boards.jpg` | Composite decking — uniform manufactured grain, **hidden fasteners so no screw heads**, no knots, green mildew in the shade |
| `composite-railings.jpg` | Composite railing system, smooth manufactured posts and top rail, uniform colour, no wood grain variation |
| `roof-shingle.jpg` | Asphalt shingle roof from ground level at an angle, staggered courses, granular texture, black algae streaks running down the slope |
| `roof-metal.jpg` | Standing-seam metal roof, raised seams, faded panels, streaking down the slope |
| `roof-tile.jpg` | Clay or concrete barrel tile roof, overlapping curved tiles, moss growing in the channels |
| `pavers-driveway.jpg` | Interlocking paver driveway, individual units, sand joints, slight settling out of level, weeds in a joint |
| `pavers-patio.jpg` | Paver patio, herringbone or running bond, moss between units, a settled low spot |
| `pavers-walkway.jpg` | Paver path through a lawn, edge restraint visible, grass encroaching on the edges |
| `pavers-retaining-wall.jpg` | Stacked block retaining wall, individual units and capstones, efflorescence and moss low down |
| `painted-trim-fascia.jpg` | Painted trim and fascia board along a roof edge, paint failing at a joint, dark streak below the gutter |
| `painted-brick.jpg` | Painted brick wall, white or light paint over brick, mortar joints showing through, paint peeling low down, algae at grade |
| `glass-windows.jpg` | Residential window from outside, glass with water spotting and pollen, painted frame, sill with dirt on it |
| `glass-storefront.jpg` | Commercial storefront glass, large panes, aluminium frames, hand and water marks low down |
| `gutters-exterior.jpg` | Gutter face along a roof edge, classic tiger-striping, downspout, roof shingles above |
| `gutters-downspout.jpg` | Looking down into an open gutter trough, packed with leaves and grit, downspout opening visible |

## Material tiles

One representative image for each of the twelve top-level buttons. Any strong
example of that material works — same rules, same prompt.

`material-concrete.jpg` · `material-brick.jpg` · `material-vinyl.jpg` ·
`material-wood.jpg` · `material-stucco.jpg` · `material-metal.jpg` ·
`material-composite.jpg` · `material-roof.jpg` · `material-pavers.jpg` ·
`material-painted.jpg` · `material-glass.jpg` · `material-gutters.jpg`

---

## Already done — don't regenerate

`concrete-driveway.jpg` · `brick-house-siding.jpg` · `vinyl-house-siding.jpg` ·
`painted-wood-siding.jpg` · `fascia-diagram.png`

---

## The pairs that matter most

If any of these come back looking like each other, the guide teaches the wrong
lookup and someone pressure washes something they shouldn't:

- **Vinyl vs wood vs stucco vs fiber cement siding** — four walls, and vinyl,
  wood and stucco each have their own rule.
- **Brick house siding vs brick walkway** — never pressure wash one, allowed on
  the other.
- **Composite decking vs wood decking** — composite must never be pressure
  washed; wood can be, at the right PSI.
- **Concrete driveway vs sidewalk vs patio** — same rules, but a worker should
  still land on the right page.
