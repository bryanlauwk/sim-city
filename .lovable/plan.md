## Goal

Replace the pixel-art jar with a composited **hyperrealistic terrarium scene** (in the spirit of the two reference photos — glass jar, real moss, real flora) and rebuild the chrome around it as a calm, museum-grade botanical interface. Simulation logic stays untouched — only visuals and layout change.

## 1. Hyperrealistic asset pack (generated via `imagegen`)

All saved under `src/assets/terrarium/` and imported as ES modules.

**Scene base**
- `jar-empty.png` — transparent PNG of an empty round glass jar with soft studio lighting, slight condensation, cork lid. The single hero canvas backdrop.
- `backdrop.jpg` — softly blurred greenhouse / botanical-shop bokeh background (matches reference 1).

**Substrates** (top-down slabs, transparent PNG, ~1024×280)
- coir, forest loam, sandy mix, sphagnum — each photoreal, layered drainage pebbles included.

**Flora** (transparent PNG, 3 growth stages each: sprout / healthy / lush + 1 wilted)
- fern, cushion moss, pilea, lichen, tiny orchid.

**Fauna** (transparent PNG, single pose each — small)
- springtail, isopod, snail, ant.

**Effects**
- `mold.png` — wispy white mycelium patches (transparent).
- `condensation.png` — water-droplet overlay on glass (transparent).
- `glass-highlight.png` — soft jar reflection overlay.

Total: ~25 generated images, mostly `fast` tier; jar and backdrop on `standard` for fidelity.

## 2. New realistic renderer

Replace pure-canvas drawing with a layered DOM/CSS composite (keeps things crisp and lets us animate with CSS/Framer-style transforms):

```
TerrariumScene
├── backdrop (blurred bokeh)
├── jar glass back (image)
├── substrate slab (selected one)
├── plants layer  ← each PlantInstance → <img> at x%, opacity by health, stage swaps sprite
├── fauna layer   ← each FaunaInstance → <img> with CSS transform translate(x,y) + gentle bob
├── mold overlay  ← opacity = moldCover/100
├── condensation overlay ← opacity = (humidity-60)/40
├── glass highlight + jar rim (image)
└── day badge (overlayed)
```

Fauna positions update at the render frame from sim state (already in 0..1 coords). Plant sprite chosen from stage + dead flags. Subtle parallax sway via `transform` and CSS `@keyframes`.

`TerrariumCanvas.tsx` is deleted and replaced by `TerrariumScene.tsx`.

## 3. UI/UX overhaul — "Botanical Journal" aesthetic

Direction: warm parchment + deep forest + brass accents, serif display (Cormorant / Fraunces) + clean sans (Inter), generous whitespace, soft shadows, no pixel fonts.

**Tokens (`src/styles.css`)**
- Background: warm ivory `oklch(0.97 0.012 85)` with subtle paper grain (CSS gradient noise).
- Primary: deep forest `oklch(0.36 0.06 150)`.
- Accent: aged brass `oklch(0.68 0.11 75)`.
- Card: translucent white with backdrop blur.
- Border: hairline `oklch(0.85 0.02 80)`.
- Fonts: drop `Press Start 2P` / `VT323`. Add `Fraunces` (display) + `Inter` (body).

**Layout**
```
┌────────────────────────────────────────────────────────────┐
│  Header — wordmark, day & best-day chips                    │
├──────────────┬─────────────────────────────┬───────────────┤
│ Ingredients  │     Hyperreal terrarium     │  Vitals       │
│ (tabs as     │     (centered, framed)      │  (elegant     │
│  cards w/    │     Floating control bar    │   bars + tiny │
│  thumbnails) │     below the jar           │   sparklines) │
└──────────────┴─────────────────────────────┴───────────────┘
```

**Ingredients sidebar**
- Each option becomes a **photo card**: real thumbnail of the substrate/plant/fauna, name in serif, one-line italic blurb, tolerance chips (moisture / light) as small pill icons.
- Selection state = brass border + soft inner glow, not flat color fill.
- Atmosphere tab: humidity & light sliders styled with a thin brass track and circular brass knob; live numeric readout in serif.
- "Seal the jar" → full-width pill button, forest green, with a subtle wax-seal icon.

**HUD**
- Vitals as labeled hairline bars with serif numerals; mold bar turns rusty red as danger.
- Day/biodiversity displayed as large serif numerals on a card with a thin underline.
- Hour readout becomes a tiny rotating sun/moon glyph + time.

**Controls**
- Floating capsule bar under the jar: pause / 1× / 8× / 32× / reset, brass icons on cream.
- On hover, soft lift + shadow.

**Collapse / Thriving modal**
- Botanical certificate look: serif title, hairline divider, stats in a 2×2 grid, two ghost buttons.

**Microcopy & polish**
- Replace pixel-uppercase labels with sentence-case serif headings.
- Forecast badge → small leaf icon + "Stable / Watchful / Doomed".
- Subtle fade/scale transitions when phase changes (Tailwind `transition` + `data-state`).

## 4. Files to change

- `src/styles.css` — new palette, fonts, paper texture, remove pixel font utilities.
- `src/components/terrarium/TerrariumScene.tsx` — **new** (replaces TerrariumCanvas).
- `src/components/terrarium/IngredientCard.tsx` — **new** reusable photo card.
- `src/routes/index.tsx` — rebuild sidebar, HUD, controls, modal with new aesthetic; swap canvas import.
- `src/assets/terrarium/*` — generated image pack.
- Delete `src/components/terrarium/TerrariumCanvas.tsx`.

Simulation files (`lib/terrarium/*`) are untouched.

## 5. Build order

1. Generate the full image pack (parallelized).
2. Rewrite `styles.css` with the botanical tokens + fonts.
3. Build `TerrariumScene.tsx` layered composite.
4. Build `IngredientCard.tsx`.
5. Rewrite `index.tsx` layout, sidebar, HUD, controls, modal.
6. QA pass on preview at 1528-wide viewport: check jar centering, sprite scales, overlay opacities at extreme humidity/mold, modal layout.

## Out of scope (for this pass)

- New gameplay mechanics, new species, sound, persistence beyond existing best-day localStorage.
