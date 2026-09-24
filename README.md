# Type-a-Disaster

A tiny low-poly city runs itself. You type what happens to it ("a whale lands on city hall", "the mayor legalizes jetpacks") and Claude decides the consequences: buildings burn, flood or appear, stats swing, and the town paper prints a deadpan front page about it.

## How it plays

- **The city grows on its own.** It's a 16×16 grid of roads, houses, shops, towers and parks. One day passes every 2 seconds (4× with fast-forward). Happy, solvent cities expand; polluted, chaotic ones decline.
- **You type events.** Each event goes to Claude, which returns structured effects: stat changes, tile operations (destroy, burn, flood, build, landmark, clear), an optional lingering effect, and a headline with quotes from residents.
- **Event credits.** You get 5, and one refills every 10 minutes. Claude rates each event's scale: minor costs 1 credit, citywide 2, apocalyptic 3. Refused events cost nothing.
- **Your city, shareable.** Your city is saved in the browser. The share button makes a link that replays your city's full history from its seed and event log.
- **No game over, just an obituary.** If the population hits zero, the paper runs your city's obituary. You can start a new city or type something that revives it.

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
| `src/lib/city/simulation.ts` | Deterministic sim: city creation, daily tick, applying events, replay |
| `src/lib/city/schema.ts` | Zod validation and clamping of event results, plus the JSON schema sent to Claude |
| `src/lib/city/newsroom.server.ts` | Server-only Claude call (structured output, refusal fallback) |
| `src/lib/city/simulate.functions.ts` | Server function the page calls, with a per-IP throttle |
| `src/lib/city/persistence.ts` | localStorage save, credits, share-link encoding |
| `src/components/city/CityScene.tsx` | three.js / react-three-fiber scene |
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
