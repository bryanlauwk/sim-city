# Type-a-Disaster: Kuala Lumpur

A living, detailed procedural Kuala Lumpur. You type what happens to it ("a whale lands on Dataran Merdeka", "Godzilla stomps through Bukit Bintang"). Claude decides the consequences and choreographs what you see: the whale falls out of the sky, people flee and then come back to gawk, fire engines and ambulances race in along the roads, and the chain reaction keeps unfolding over the next few days. The town paper reports all of it with a straight face.

## What's on screen

- **Kuala Lumpur's Golden Triangle** on a 32×32 map. Each tile is about 66 m, placed from real coordinates:
  - **Bukit Bintang:** the scramble crossing at Jalan Bukit Bintang / Jalan Sultan Ismail, Pavilion (crystal atrium and towers), Lot 10, Starhill, Fahrenheit88, Sungei Wang, BB Plaza, the Jalan Alor lanterns and the Changkat bars.
  - **KLCC:** the Petronas Twin Towers with their skybridge, Suria KLCC, KLCC Park with Lake Symphony, Menara Maxis, Four Seasons Place, Ilham Tower and the Convention Centre.
  - **Around the edges:** Menara KL on Bukit Nanas, Berjaya Times Square, The Exchange 106 at TRX, and Merdeka 118 on the south-west horizon.
  - **Connections:** the Monorail along Jalan Sultan Ismail, the LRT along Jalan Ampang and the MRT, plus the covered Pavilion–KLCC walkway with people on it.
- **The KL building kit** (`scene/kit.ts`): ordinary shops and towers are assembled from parts (podium, glass shaft, slab, crown, sign band, awning, spire). They are drawn with a facade shader that shows window grids by day and scattered lit windows at night. Shophouse rows and roadside rain trees fill in the streets.
- **Street life:**
  - Cars, motorbikes and Rapid KL buses on the roads, driving on the left, slowing in rain and jamming when chaos is high.
  - The LRT Kelana Jaya, MRT Kajang and KL Monorail lines, with trains stopping at stations.
  - Pedestrians, bird flocks, macaques in the forests and monitor lizards along the riverbanks.
- **Time and weather:**
  - Day and night: street lamps and windows light up after dark.
  - Afternoon thunderstorms with lightning, and smog haze.
  - Trees sway in the wind.

## How it plays

- **The city grows on its own.** One day passes every 12 seconds, or 3 seconds on fast-forward. Happy, solvent districts build new houses, shops and towers, each in their own character: towers in KLCC, shophouses in Chinatown, kampung houses in Kampung Baru. When free land runs out, the city sprawls into unprotected forest, which lowers the **Nature** score. It also rebuilds low-rise districts as high-rise. When smog gets bad, the council turns blocks into parks. The protected reserves (Lake Gardens, Bukit Nanas) are never cleared.
- **You type events.** Claude returns:
  - **Map effects:** tile changes (destroy, burn, flood, build, landmark, clear), which can target a district by name.
  - **A spectacle:** actors from the library (below), plus how the crowd reacts and which emergency services respond.
  - **Follow-ups:** up to three chain reactions that fire on later days as news bulletins.
- **The actor & effect library** (`scene/ActorLibrary.tsx` and `scene/Spectacle.tsx`):
  - **Set pieces:** a whale, meteor, giant falling object, kaiju or creature, UFO, tornado, flood wave, storm and fireworks.
  - **Crowds:** swarms, convoys, a rain of objects and Grab rider swarms.
  - **KL wildlife:** a tapir, hornbill, giant monitor lizard and a durian that splits open.
  - **Festivals:** a lion dance with firecrackers, a Thaipusam procession, a Merdeka parade, festive lanterns and a hot-air balloon.
  - **Urban mishaps:** haze that thickens the sky, a sinkhole, a landslide, a blackout that turns the lights off, and an LRT breakdown that halts the trains.
- **Animation and surfaces:** the camera closes in on event actors and follows roaming creatures; tapirs breathe and walk, hornbills bank and flap, durians split and scatter pulp, whales flex their fins and spray water, and kaiju stride and roar. Impacts throw up debris and dust. Normal maps add surface relief to animals, roads, plaster, wood and roof tiles. Wet roads develop puddles and reflections; storms bring slanted rain, drifting clouds and lightning. These are procedural, stylised assets rather than scanned photorealistic models.
- **Event credits.** You get 5, and one refills every 10 minutes. Minor events cost 1 credit, citywide 2, apocalyptic 3.
- **Your city, shareable.** The city is saved in the browser. The share button makes a link that replays the whole history. The simulation is deterministic, so a seed plus the event log rebuilds the city exactly.

## Setup: Anthropic API key

Events need an Anthropic API key, which stays on the server (a TanStack Start server function running on the Cloudflare Worker).

1. Create a key at [console.anthropic.com](https://console.anthropic.com) → Settings → API Keys. Also set a monthly spend limit under Settings → Limits.
2. Add it as a secret named `ANTHROPIC_API_KEY`:
   - **Lovable:** Project settings → Secrets.
   - **Wrangler:** `npx wrangler secret put ANTHROPIC_API_KEY`
   - **Local dev:** copy `.dev.vars.example` to `.dev.vars` (it's git-ignored), or export the variable in your shell before running `npm run dev`.
3. If the key is an organization-level key that isn't scoped to a workspace, also add an `ANTHROPIC_WORKSPACE_ID` secret. The workspace ID is under Console → Settings → Workspaces. Alternatively, create the key inside a workspace.
4. Optional: set `CITY_MODEL` to use a different Claude model. The default is `claude-opus-5`, run at low effort.

Without a key the game still runs, but typed events show a "newsroom is closed" message.

## New actors on demand (free, no keys)

When an event names something the built-in library can't show ("a giant durian lands on Lot 10"), Claude picks a stand-in actor and also returns, in the same reply:

- `search_terms`: the thing's everyday name ("durian", "double decker bus").
- a **recipe**: its own design of the thing from 10–40 primitives, with a motion (fall, walk, hover, spin).

The recipe appears at once. Meanwhile the browser looks for a **ready-made model** in a free library, with no API key or account:

1. [`public/objaverse/index-v1.json.gz`](public/objaverse) lists about 47,000 CC BY and CC0 models from [Objaverse](https://huggingface.co/datasets/allenai/objaverse), a public mirror of downloadable Sketchfab models on Hugging Face. They're filtered with the [Objaverse++](https://huggingface.co/datasets/cindyxl/ObjaversePlusPlus) quality labels for single, well-made objects, with realistic and scanned models ranked first. The 2.3 MB index is fetched once, while the newsroom writes the first event.
2. The search ranks names against the terms. The main noun must match, so "monitor lizard" never returns a computer monitor, and skulls, toys and statues are ranked below the real thing.
3. One batched Hugging Face request checks file sizes (up to 8 MB, or 4 MB on phones). The GLB then loads straight from Hugging Face's CDN with its own PBR materials, replacing the recipe. If nothing fits or the download fails, the recipe stays.
4. The Gazette credits each model's author and licence, linked to its Sketchfab page.

To rebuild the index (it downloads ~820 MB of public metadata and needs no account), run `python3 scripts/build_objaverse_index.py`.

### Optional: shared recipes (Supabase)

With Supabase configured, the first recipe for each `model_key` is saved and reused, so every visitor sees the same teh tarik, and Claude is shown the saved keys so it reuses them.

1. In a Supabase project, run [`supabase/actor_library.sql`](supabase/actor_library.sql) in the SQL editor.
2. Add these secrets (Lovable → Secrets):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only)
   - optionally `LIBRARY_PER_VISITOR_CAP` (default: 10 new recipes per visitor a day)

## Surface map pipeline

The source surface images are in `public/textures`. The nine `.normal.webp` maps add subtle relief without a 3D service or new runtime dependency. If a source image changes, install Pillow and run `python3 scripts/derive_normal_maps.py` to regenerate its normal map.

## Code map

| Path                                  | What it does                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/lib/city/kl.ts`                  | The city-centre map: districts, rivers, streets, rail lines, landmarks                      |
| `src/lib/city/simulation.ts`          | Deterministic sim: growth, sprawl, redevelopment, events, chain reactions, replay           |
| `src/lib/city/schema.ts`              | Zod validation and clamping of event results, plus the JSON schema sent to Claude           |
| `src/lib/city/newsroom.server.ts`     | Server-only Claude call (structured output, refusal fallback)                               |
| `src/lib/city/simulate.functions.ts`  | Server function the page calls for events, with a per-IP throttle                           |
| `src/lib/city/actorLibrary.server.ts` | Optional shared library of Claude's actor recipes (Supabase)                                |
| `src/lib/city/modelSearch.ts`         | Free model search in the browser: static Objaverse index, Hub size check, credits           |
| `src/lib/city/persistence.ts`         | localStorage save, credits, share-link encoding                                             |
| `src/components/city/CityScene.tsx`   | three.js / react-three-fiber scene and camera director                                      |
| `src/components/city/scene/*`         | Instanced buildings, ground and trees, rail, street life, sky and weather, event spectacles |
| `src/components/city/Newspaper.tsx`   | The Gazette sidebar                                                                         |
| `src/routes/index.tsx`                | The game page                                                                               |

Run `npm run test` (uses Bun) for the simulation tests.

## Credits

The city itself is generated in code: buildings, landmarks, trees, vehicles, people and effects.

Ready-made models for custom actors come from [Objaverse](https://huggingface.co/datasets/allenai/objaverse) (ODC-BY; Deitke et al., 2023), selected with [Objaverse++](https://huggingface.co/datasets/cindyxl/ObjaversePlusPlus) labels (ODC-BY). Each model keeps its own CC BY or CC0 licence, and its author is credited in the Gazette whenever it appears.

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/fa28baec-2265-42cd-8918-0aecb8e6e1cf).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
