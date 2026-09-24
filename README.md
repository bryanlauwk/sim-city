# Sim City

Turn into a proper game dev prompt

...

The creation of the Terrarium Simulator game was entirely orchestrated using an advanced multi-agent AI development workflow. Instead of coding it by hand, the developer acted as a product manager, outsourcing the core mechanics and structure to autonomous AI workers.

Here is a breakdown of how many AI agents were used, how they built the game, and the underlying gameplay mechanisms they created.

1. The Development Workflow & AI Agents

The developer utilized 3 distinct Cursor Cloud Agents to build the game simultaneously in the background.

Cursor Cloud Agents operate by spinning up isolated virtual machines in the cloud. Each agent clones the repository, installs its own dependencies, and spins up a dedicated development environment with a virtual terminal and a Chrome browser. This allows them to independently build, run, and visually test their code before submitting a finished feature.

The developer divided the project by assigning one core responsibility to each agent:

Agent 1: The UI & Frontend Engineer

Task: Built the visual user interface (UI) of the application.

Result: Created the pixel-art layout, the left-hand selection sidebar (where players choose their materials), and the central visual display of the glass terrarium.

Agent 2: The Core Simulation Engineer

Task: Programmed the ecosystem simulation rules.

Result: Programmed how the different entities (plants, soil, and bugs) interact with one another and how variables like moisture affect life cycles.

Agent 3: The Time Progression Engineer

Task: Built the time-lapse and progression engine.

Result: Created the mechanism that fast-forwards time when the player presses "Play," allowing real-time calculations to simulate days and weeks in mere seconds.

While the developer was away from her desk, these agents worked in parallel on separate Git branches, ran end-to-end testing, and sent her video demos of their working components for final review.

2. The Game Mechanisms

The game itself is a complex balancing simulator masquerading as a cozy, pixel-art casual game. The underlying gameplay mechanisms rely heavily on environmental math and biodiversity scoring:

🌿 Habitat Customization & Setup

Before starting the simulation, players pick and choose specific ingredients to build their closed ecological system:

Substrate (Soil): Players select the type of foundation dirt.

Flora (Plants): Options include pixel-art vegetation like ferns and moss.

Fauna (Creatures): Players add micro-fauna like snails, ants, and isopods (pill bugs).

Atmosphere: Players set specific baseline sliders, most notably the Humidity Level.

⚙️ The Core Simulation Loop

Once the player hits the Play button, the background logic begins calculating how these items interact based on mathematical variables:

Moisture & Humidity: The simulation monitors a dynamic moisture score. If the environment is too dry, plants wither. If it is too humid, specific species may die out or mold might take over.

Biodiversity Tracking: The game tracks 5 distinct ecosystem layers simultaneously (soil type, flora, fauna, moisture, and time).

Longevity Score: The primary metric of success is the Longevity Counter (measured in simulated days).

☠️ Win/Loss Conditions

The Eco-Balance (Win): If the combinations of plants, bugs, moisture, and soil are perfectly balanced, the ecosystem sustains itself indefinitely. A successfully balanced terrarium can survive for over 365 simulated days.

Ecosystem Collapse (Loss): If a single element falls out of balance (e.g., a snail consumes all the flora, or lack of humidity kills off the moss), a chain reaction triggers an "Ecosystem Collapsed" screen, showing the exact number of days survived and the final score.

This project was built with [Lovable](https://lovable.dev).

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
