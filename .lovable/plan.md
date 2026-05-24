# Show the composition inside the jar

## What's wrong

Two issues stack to make the jar look empty:

1. **The jar PNG isn't actually transparent.** `src/assets/terrarium/jar.png` was generated against a solid background, so the glass interior renders as a milky white fill. Even though substrate and plants are drawn underneath, the "glass" hides them.
2. **No live preview during setup.** Substrate/plants/fauna only render from `state`, which doesn't reflect the recipe until you press *Seal the jar*. So while composing, the jar shows nothing — even if it were transparent.

## Fix

### 1. Regenerate the jar as a real cut-out PNG
Re-generate `src/assets/terrarium/jar.png` with `transparent_background: true` and a prompt that explicitly asks for a rim/cork/edge highlights only, with the bowl interior fully transparent. Add a separate `glass-highlight.png` (transparent) for the specular streak at the top so we keep the "glass" feel without occluding the contents.

### 2. Tune interior geometry to the new jar
Re-measure the bowl bounds from the regenerated image and update the `interior` rect plus `subInset` / `substrateH` in `TerrariumScene.tsx` so the substrate slab sits on the curved bottom and plants/fauna stay inside the visible glass.

### 3. Render a live preview from the recipe (setup phase)
Drive `TerrariumScene` from a `previewState` during setup, built from the current `recipe`:
- substrate slab uses `recipe.substrate`
- one decorative sprite per selected plant, evenly spaced along the soil line, at stage 2
- fauna sprites placed for each species at `recipe.fauna[id]` count
- condensation opacity from `recipe.humidity`

When `phase === "running"` or `"ended"`, keep using the real `state`. Easiest shape: small `recipeToDisplayState(recipe)` helper in `TerrariumScene.tsx` (or a sibling util) and pass either `state` or the preview into the scene.

### 4. Layer order
- backdrop → substrate → mold → plants → fauna → **jar (transparent rim/cork)** → glass-highlight → condensation → day badge.

The transparent jar means contents are visible; the highlight overlay adds the glass shine without blocking.

## Files

- `src/assets/terrarium/jar.png` — regenerate, transparent interior
- `src/assets/terrarium/glass-highlight.png` — new, transparent specular overlay
- `src/components/terrarium/assets.ts` — export new highlight asset
- `src/components/terrarium/TerrariumScene.tsx` — geometry retune, highlight layer, accept preview state
- `src/routes/index.tsx` — build `previewState` from `recipe` in setup phase and pass to `<TerrariumScene>`

## Out of scope

Simulation logic, species definitions, palette, typography, and panel layout stay as-is.
