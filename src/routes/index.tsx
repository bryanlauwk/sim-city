import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, FastForward, RotateCcw, Sprout, Bug, Droplets, Sun, Leaf, Skull, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { TerrariumCanvas } from "@/components/terrarium/TerrariumCanvas";
import { FAUNA, PLANTS, SUBSTRATES } from "@/lib/terrarium/species";
import { createInitialState, defaultRecipe, tick } from "@/lib/terrarium/simulation";
import type { FaunaId, PlantId, Recipe, SimState, SubstrateId } from "@/lib/terrarium/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Terrarium Simulator — Cozy Pixel Ecosystem Balancer" },
      { name: "description", content: "Build a sealed glass terrarium, balance moisture, plants, and bugs, and survive 365 simulated days." },
    ],
  }),
});

function Index() {
  const [recipe, setRecipe] = useState<Recipe>(defaultRecipe);
  const [phase, setPhase] = useState<"setup" | "running" | "ended">("setup");
  const [speed, setSpeed] = useState<0 | 1 | 8 | 32>(1);
  const [state, setState] = useState<SimState>(() => createInitialState(defaultRecipe()));
  const [bestDay, setBestDay] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    return Number(localStorage.getItem("terrarium-best") || 0);
  });

  // Simulation loop
  const accRef = useRef(0);
  const lastRef = useRef<number>(0);
  useEffect(() => {
    if (phase !== "running" || speed === 0) return;
    let raf = 0;
    lastRef.current = performance.now();
    const loop = (now: number) => {
      const dt = now - lastRef.current;
      lastRef.current = now;
      // ticksPerSecond: 1× = 4, 8× = 32, 32× = 128
      const tps = speed * 4;
      accRef.current += (dt / 1000) * tps;
      if (accRef.current >= 1) {
        const n = Math.floor(accRef.current);
        accRef.current -= n;
        setState((s) => {
          let next = s;
          for (let i = 0; i < n; i++) next = tick(next);
          if (next.collapsed) {
            setPhase("ended");
            const best = Math.max(bestDay, next.day);
            setBestDay(best);
            if (typeof window !== "undefined") localStorage.setItem("terrarium-best", String(best));
          } else if (next.day >= 365) {
            setPhase("ended");
            const best = Math.max(bestDay, next.day);
            setBestDay(best);
            if (typeof window !== "undefined") localStorage.setItem("terrarium-best", String(best));
          }
          return next;
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, speed, bestDay]);

  const seal = () => {
    setState(createInitialState(recipe));
    setPhase("running");
    setSpeed(1);
  };

  const reset = () => {
    setPhase("setup");
    setSpeed(0);
    setState(createInitialState(recipe));
  };

  const forecast = useMemo(() => getForecast(recipe), [recipe]);

  return (
    <div className="min-h-screen w-full">
      <header className="border-b border-border/60 bg-card/60 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-primary text-primary-foreground">
              <Sprout className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-pixel text-sm leading-none text-foreground">TERRARIUM</h1>
              <p className="font-display text-base leading-tight text-muted-foreground">a cozy ecosystem balancer</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Trophy className="h-4 w-4 text-accent" />
            <span className="font-display text-lg">Best: <strong>{bestDay}</strong> days</span>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-4 px-4 py-6 lg:grid-cols-[300px_1fr_260px]">
        {/* Left: selection */}
        <SelectionPanel recipe={recipe} setRecipe={setRecipe} phase={phase} forecast={forecast} onSeal={seal} />

        {/* Center: jar + controls */}
        <section className="flex flex-col items-center gap-4">
          <div className="rounded-xl border-4 border-foreground/80 bg-card p-3 shadow-[8px_8px_0_0_rgba(50,30,10,0.25)]">
            <TerrariumCanvas state={state} />
          </div>
          <Controls
            phase={phase}
            speed={speed}
            setSpeed={setSpeed}
            onSeal={seal}
            onReset={reset}
          />
        </section>

        {/* Right: HUD */}
        <HUD state={state} phase={phase} />
      </main>

      <Dialog open={phase === "ended"} onOpenChange={(o) => !o && reset()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-pixel text-base">
              {state.day >= 365 ? (
                <span className="text-primary">SELF-SUSTAINING BIOME</span>
              ) : (
                <span className="text-destructive flex items-center gap-2"><Skull className="h-4 w-4" /> ECOSYSTEM COLLAPSED</span>
              )}
            </DialogTitle>
            <DialogDescription className="font-display text-lg leading-snug">
              {state.day >= 365
                ? "Your terrarium reached a full year of stable balance. A tiny, perfect world."
                : state.collapseReason}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <Stat label="Days survived" value={state.day} />
            <Stat label="Biodiversity" value={Math.round(state.biodiversity)} />
            <Stat label="Final moisture" value={`${Math.round(state.moisture)}%`} />
            <Stat label="Plants alive" value={state.plants.filter((p) => !p.dead).length} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPhase("setup"); }}>Tweak recipe</Button>
            <Button onClick={() => { setState(createInitialState(recipe)); setPhase("running"); setSpeed(1); }}>Try again</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
      <div className="font-pixel text-[9px] uppercase text-muted-foreground">{label}</div>
      <div className="font-display text-2xl leading-none">{value}</div>
    </div>
  );
}

function SelectionPanel({
  recipe,
  setRecipe,
  phase,
  forecast,
  onSeal,
}: {
  recipe: Recipe;
  setRecipe: (r: Recipe) => void;
  phase: "setup" | "running" | "ended";
  forecast: { label: string; tone: "good" | "risk" | "doom" };
  onSeal: () => void;
}) {
  const disabled = phase !== "setup";

  const togglePlant = (id: PlantId) => {
    if (disabled) return;
    const has = recipe.plants.includes(id);
    const plants = has ? recipe.plants.filter((p) => p !== id) : [...recipe.plants, id];
    if (plants.length > 5) return;
    setRecipe({ ...recipe, plants });
  };

  const bumpFauna = (id: FaunaId, delta: number) => {
    if (disabled) return;
    const cur = recipe.fauna[id] ?? 0;
    const next = Math.max(0, Math.min(10, cur + delta));
    setRecipe({ ...recipe, fauna: { ...recipe.fauna, [id]: next } });
  };

  return (
    <aside className="rounded-xl border-2 border-foreground/70 bg-card p-3 shadow-[4px_4px_0_0_rgba(50,30,10,0.2)]">
      <h2 className="font-pixel text-[10px] uppercase tracking-wider text-muted-foreground">Build your jar</h2>
      <Tabs defaultValue="substrate" className="mt-2">
        <TabsList className="grid w-full grid-cols-4 bg-muted/60">
          <TabsTrigger value="substrate" className="text-xs">Soil</TabsTrigger>
          <TabsTrigger value="plants" className="text-xs">Flora</TabsTrigger>
          <TabsTrigger value="fauna" className="text-xs">Fauna</TabsTrigger>
          <TabsTrigger value="atmos" className="text-xs">Air</TabsTrigger>
        </TabsList>

        <TabsContent value="substrate" className="mt-3 space-y-2">
          {SUBSTRATES.map((s) => (
            <button
              key={s.id}
              disabled={disabled}
              onClick={() => setRecipe({ ...recipe, substrate: s.id as SubstrateId })}
              className={cn(
                "flex w-full items-center gap-2 rounded-md border p-2 text-left transition disabled:opacity-60",
                recipe.substrate === s.id ? "border-primary bg-primary/10" : "border-border hover:border-foreground/50",
              )}
            >
              <span className="h-6 w-6 rounded-sm border border-foreground/40" style={{ background: s.color }} />
              <span className="flex-1">
                <span className="block font-pixel text-[10px]">{s.name}</span>
                <span className="block text-xs text-muted-foreground">{s.blurb}</span>
              </span>
            </button>
          ))}
        </TabsContent>

        <TabsContent value="plants" className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">Pick 1–5 plants ({recipe.plants.length}/5)</p>
          {PLANTS.map((p) => {
            const active = recipe.plants.includes(p.id);
            return (
              <button
                key={p.id}
                disabled={disabled}
                onClick={() => togglePlant(p.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md border p-2 text-left transition disabled:opacity-60",
                  active ? "border-primary bg-primary/10" : "border-border hover:border-foreground/50",
                )}
              >
                <span className="grid h-6 w-6 place-items-center rounded-sm" style={{ background: p.color, color: p.accent }}>
                  <Leaf className="h-3 w-3" />
                </span>
                <span className="flex-1">
                  <span className="block font-pixel text-[10px]">{p.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    moist {p.moistureMin}–{p.moistureMax} · light ≥{p.lightMin}h
                  </span>
                </span>
              </button>
            );
          })}
        </TabsContent>

        <TabsContent value="fauna" className="mt-3 space-y-2">
          {FAUNA.map((f) => {
            const count = recipe.fauna[f.id] ?? 0;
            return (
              <div key={f.id} className="rounded-md border border-border p-2">
                <div className="flex items-center gap-2">
                  <span className="grid h-6 w-6 place-items-center rounded-sm bg-muted" style={{ color: f.color }}>
                    <Bug className="h-3 w-3" />
                  </span>
                  <div className="flex-1">
                    <div className="font-pixel text-[10px]">{f.name}</div>
                    <div className="text-xs text-muted-foreground">{f.blurb}</div>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Button size="sm" variant="outline" disabled={disabled} onClick={() => bumpFauna(f.id, -1)} className="h-7 w-7 p-0">−</Button>
                  <span className="font-display text-xl w-6 text-center">{count}</span>
                  <Button size="sm" variant="outline" disabled={disabled} onClick={() => bumpFauna(f.id, 1)} className="h-7 w-7 p-0">+</Button>
                </div>
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="atmos" className="mt-3 space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-pixel text-[10px] flex items-center gap-1"><Droplets className="h-3 w-3" /> Humidity</span>
              <span className="font-display text-lg">{recipe.humidity}%</span>
            </div>
            <Slider
              disabled={disabled}
              value={[recipe.humidity]}
              onValueChange={([v]) => setRecipe({ ...recipe, humidity: v })}
              min={10}
              max={100}
              step={1}
            />
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-pixel text-[10px] flex items-center gap-1"><Sun className="h-3 w-3" /> Light hours</span>
              <span className="font-display text-lg">{recipe.light}h</span>
            </div>
            <Slider
              disabled={disabled}
              value={[recipe.light]}
              onValueChange={([v]) => setRecipe({ ...recipe, light: v })}
              min={0}
              max={16}
              step={1}
            />
          </div>
        </TabsContent>
      </Tabs>

      <div className="mt-4 space-y-2">
        <div className={cn(
          "rounded-md border-2 px-3 py-2 text-center font-pixel text-[10px]",
          forecast.tone === "good" && "border-primary bg-primary/10 text-primary",
          forecast.tone === "risk" && "border-accent bg-accent/10 text-accent-foreground",
          forecast.tone === "doom" && "border-destructive bg-destructive/10 text-destructive",
        )}>
          FORECAST · {forecast.label}
        </div>
        <Button
          className="w-full font-pixel text-[10px]"
          disabled={disabled || recipe.plants.length === 0}
          onClick={onSeal}
        >
          SEAL THE JAR
        </Button>
      </div>
    </aside>
  );
}

function Controls({
  phase,
  speed,
  setSpeed,
  onSeal,
  onReset,
}: {
  phase: "setup" | "running" | "ended";
  speed: 0 | 1 | 8 | 32;
  setSpeed: (s: 0 | 1 | 8 | 32) => void;
  onSeal: () => void;
  onReset: () => void;
}) {
  if (phase === "setup") {
    return (
      <div className="font-display text-lg text-muted-foreground">
        Pick your ingredients, then press <strong>SEAL THE JAR</strong>.
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-lg border-2 border-foreground/70 bg-card px-3 py-2 shadow-[3px_3px_0_0_rgba(50,30,10,0.2)]">
      <Button
        variant={speed === 0 ? "default" : "outline"}
        size="sm"
        onClick={() => setSpeed(0)}
        title="Pause"
      >
        <Pause className="h-4 w-4" />
      </Button>
      <Button variant={speed === 1 ? "default" : "outline"} size="sm" onClick={() => setSpeed(1)}>
        <Play className="h-4 w-4" />
        <span className="ml-1 font-display">1×</span>
      </Button>
      <Button variant={speed === 8 ? "default" : "outline"} size="sm" onClick={() => setSpeed(8)}>
        <FastForward className="h-4 w-4" />
        <span className="ml-1 font-display">8×</span>
      </Button>
      <Button variant={speed === 32 ? "default" : "outline"} size="sm" onClick={() => setSpeed(32)}>
        <FastForward className="h-4 w-4" />
        <span className="ml-1 font-display">32×</span>
      </Button>
      <span className="mx-2 h-6 w-px bg-border" />
      <Button variant="ghost" size="sm" onClick={onReset} title="Reset and tweak recipe">
        <RotateCcw className="h-4 w-4" />
      </Button>
    </div>
  );
}

function HUD({ state, phase }: { state: SimState; phase: "setup" | "running" | "ended" }) {
  const livePlants = state.plants.filter((p) => !p.dead).length;
  const liveFauna = state.fauna.filter((f) => f.alive).length;
  return (
    <aside className="rounded-xl border-2 border-foreground/70 bg-card p-3 shadow-[4px_4px_0_0_rgba(50,30,10,0.2)]">
      <h2 className="font-pixel text-[10px] uppercase tracking-wider text-muted-foreground">Vitals</h2>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Stat label="Day" value={state.day} />
        <Stat label="Bio" value={Math.round(state.biodiversity)} />
      </div>

      <div className="mt-4 space-y-3">
        <Bar label="Moisture" value={state.moisture} tint="hsl(200 60% 50%)" />
        <Bar label="Humidity" value={state.humidity} tint="hsl(190 50% 55%)" />
        <Bar label="Nutrients" value={state.nutrients} tint="hsl(40 70% 50%)" />
        <Bar label="Mold" value={state.moldCover} tint="hsl(60 10% 70%)" danger />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Stat label="Plants" value={livePlants} />
        <Stat label="Fauna" value={liveFauna} />
      </div>

      {phase === "running" && (
        <p className="mt-4 font-display text-base text-muted-foreground">
          Hour {state.hour}:00 · keep it balanced.
        </p>
      )}
    </aside>
  );
}

function Bar({ label, value, tint, danger = false }: { label: string; value: number; tint: string; danger?: boolean }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-pixel text-[9px] uppercase text-muted-foreground">{label}</span>
        <span className="font-display text-base">{Math.round(v)}</span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-sm border border-foreground/50 bg-muted">
        <div
          className="h-full transition-[width] duration-200"
          style={{ width: `${v}%`, background: danger && v > 50 ? "hsl(0 60% 55%)" : tint }}
        />
      </div>
    </div>
  );
}

function getForecast(recipe: Recipe): { label: string; tone: "good" | "risk" | "doom" } {
  if (recipe.plants.length === 0) return { label: "Empty jar", tone: "doom" };
  // very rough heuristic mirroring the sim
  const hasSpringtail = (recipe.fauna.springtail ?? 0) > 0;
  const snails = recipe.fauna.snail ?? 0;
  const plantCount = recipe.plants.length;
  if (recipe.humidity > 85 && !hasSpringtail) return { label: "Mold incoming", tone: "doom" };
  if (recipe.humidity < 30) return { label: "Too dry", tone: "doom" };
  if (snails > plantCount) return { label: "Snails will eat everything", tone: "doom" };
  if (snails > 0 && plantCount < 3) return { label: "Risky — too few plants", tone: "risk" };
  if (!hasSpringtail && recipe.humidity > 70) return { label: "Risky — needs cleanup crew", tone: "risk" };
  if (recipe.light < 4) return { label: "Risky — low light", tone: "risk" };
  return { label: "Looks balanced", tone: "good" };
}
}
