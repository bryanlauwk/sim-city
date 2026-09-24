# Type-a-Disaster: Kuala Lumpur

A living, low-poly Kuala Lumpur. You type what happens to it ("a whale lands on Dataran Merdeka", "Godzilla stomps through Bukit Bintang"). Claude decides the consequences and choreographs what you see: the whale really falls out of the sky, people flee and then come back to gawk, fire engines and ambulances race in along the roads, and the chain reaction keeps unfolding over the next few days. The town paper reports all of it with a straight face.

## What's on screen

- **A stylised KL** on a 32×32 map:
  - The Klang and Gombak rivers meeting at Masjid Jamek.
  - Dataran Merdeka and the Sultan Abdul Samad Building.
  - Chinatown, KLCC with the Petronas Twin Towers and KLCC Park, Bukit Bintang, and Menara KL on the Bukit Nanas forest reserve.
  - Merdeka 118, KL Sentral, Kampung Baru, the Lake Gardens and Titiwangsa.
  - Suburbs such as Bangsar, Mont Kiara, Cheras and Ampang.
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
  - **A spectacle:** actors such as a whale, meteor, kaiju, UFO, tornado, swarm, convoy, a rain of objects, a flood wave, a storm or fireworks, plus how the crowd reacts and which emergency services respond.
  - **Follow-ups:** up to three chain reactions that fire on later days as news bulletins.
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

## Code map

| Path | What it does |
| --- | --- |
| `src/lib/city/kl.ts` | The KL map: districts, rivers, roads, rail lines, landmarks |
| `src/lib/city/simulation.ts` | Deterministic sim: growth, sprawl, redevelopment, events, chain reactions, replay |
| `src/lib/city/schema.ts` | Zod validation and clamping of event results, plus the JSON schema sent to Claude |
| `src/lib/city/newsroom.server.ts` | Server-only Claude call (structured output, refusal fallback) |
| `src/lib/city/simulate.functions.ts` | Server function the page calls, with a per-IP throttle |
| `src/lib/city/persistence.ts` | localStorage save, credits, share-link encoding |
| `src/components/city/CityScene.tsx` | three.js / react-three-fiber scene and camera director |
| `src/components/city/scene/*` | Instanced buildings, ground and trees, rail, street life, sky and weather, event spectacles |
| `src/components/city/Newspaper.tsx` | The Gazette sidebar |
| `src/routes/index.tsx` | The game page |

Run `npm run test` (uses Bun) for the simulation tests.

## Credits

The 3D buildings and trees are from Kenney's [City Kit (Commercial)](https://kenney.nl/assets/city-kit-commercial) and [City Kit (Suburban)](https://kenney.nl/assets/city-kit-suburban), released under CC0. Landmarks, fire, rubble and floods are generated in code.

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
