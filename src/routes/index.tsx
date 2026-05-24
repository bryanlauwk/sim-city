import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Play,
  Pause,
  FastForward,
  RotateCcw,
  Sprout,
  Droplets,
  Sun,
  Leaf,
  Skull,
  Trophy,
  Minus,
  Plus,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { TerrariumScene } from "@/components/terrarium/TerrariumScene";
import { ASSETS } from "@/components/terrarium/assets";
import { FAUNA, PLANTS, SUBSTRATES } from "@/lib/terrarium/species";
import {
  createInitialState,
  defaultRecipe,
  tick,
} from "@/lib/terrarium/simulation";
import type {
  FaunaId,
  PlantId,
  Recipe,
  SimState,
  SubstrateId,
} from "@/lib/terrarium/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Terrarium — A Cozy Ecosystem Balancer" },
      {
        name: "description",
        content:
          "Compose a sealed glass jar with soil, plants, micro-fauna and air. Watch a living ecosystem unfold and try to survive 365 days.",
      },
    ],
  }),
});

type Phase = "setup" | "running" | "ended";

function Index() {
  const [recipe, setRecipe] = useState<Recipe>(defaultRecipe);
  const [phase, setPhase] = useState<Phase>("setup");
  const [speed, setSpeed] = useState<0 | 1 | 8 | 32>(1);
  const [state, setState] = useState<SimState>(() =>
    createInitialState(defaultRecipe()),
  );
  const [bestDay, setBestDay] = useState<number>(0);
  useEffect(() => {
    const v = Number(localStorage.getItem("terrarium-best") || 0);
    if (v) setBestDay(v);
  }, []);

  const accRef = useRef(0);
  const lastRef = useRef<number>(0);
  useEffect(() => {
    if (phase !== "running" || speed === 0) return;
    let raf = 0;
    lastRef.current = performance.now();
    const loop = (now: number) => {
      const dt = now - lastRef.current;
      lastRef.current = now;
      const tps = speed * 4;
      accRef.current += (dt / 1000) * tps;
      if (accRef.current >= 1) {
        const n = Math.floor(accRef.current);
        accRef.current -= n;
        setState((s) => {
          let next = s;
          for (let i = 0; i < n; i++) next = tick(next);
          if (next.collapsed || next.day >= 365) {
            setPhase("ended");
            const best = Math.max(bestDay, next.day);
            setBestDay(best);
            if (typeof window !== "undefined")
              localStorage.setItem("terrarium-best", String(best));
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
      <Header bestDay={bestDay} day={state.day} phase={phase} />

      <main className="mx-auto grid max-w-[1400px] gap-6 px-6 py-6 lg:grid-cols-[340px_1fr_300px]">
        <SelectionPanel
          recipe={recipe}
          setRecipe={setRecipe}
          phase={phase}
          forecast={forecast}
          onSeal={seal}
        />

        <section className="flex flex-col items-center gap-5">
          <SceneFrame>
            <TerrariumScene
              state={phase === "setup" ? previewState : state}
            />
          </SceneFrame>
          <Controls
            phase={phase}
            speed={speed}
            setSpeed={setSpeed}
            onReset={reset}
          />
        </section>

        <HUD state={state} phase={phase} />
      </main>

      <Dialog open={phase === "ended"} onOpenChange={(o) => !o && reset()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex flex-col items-center gap-1 pt-2">
              <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                {state.day >= 365 ? "Certificate" : "Field report"}
              </div>
              <DialogTitle asChild>
                <h2 className="font-serif-d text-3xl">
                  {state.day >= 365 ? (
                    <span className="text-primary">A self-sustaining biome</span>
                  ) : (
                    <span className="text-destructive flex items-center gap-2">
                      <Skull className="h-5 w-5" /> Ecosystem collapsed
                    </span>
                  )}
                </h2>
              </DialogTitle>
              <div className="h-px w-16 bg-border mt-2" />
            </div>
            <DialogDescription className="text-center font-serif-d text-base leading-snug pt-2 text-foreground/80">
              {state.day >= 365
                ? "Your terrarium reached a full year of balance — a tiny perfect world, sealed and thriving."
                : state.collapseReason}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-3">
            <Stat label="Days survived" value={state.day} />
            <Stat label="Biodiversity" value={Math.round(state.biodiversity)} />
            <Stat label="Final moisture" value={`${Math.round(state.moisture)}%`} />
            <Stat label="Plants alive" value={state.plants.filter((p) => !p.dead).length} />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setPhase("setup")}>
              Tweak recipe
            </Button>
            <Button
              onClick={() => {
                setState(createInitialState(recipe));
                setPhase("running");
                setSpeed(1);
              }}
            >
              Try again
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* -------- Header -------- */
function Header({ bestDay, day, phase }: { bestDay: number; day: number; phase: Phase }) {
  return (
    <header className="border-b border-border/60 bg-card/50 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full border border-[var(--brass)] bg-card text-[var(--brass-deep)]">
            <Sprout className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              Vol. I · 2026
            </div>
            <h1 className="font-serif-d text-2xl leading-none">
              <span className="italic font-light">the</span>{" "}
              <span className="font-medium">Terrarium</span>
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-6">
          {phase === "running" && (
            <Chip label="Today" value={`Day ${day}`} />
          )}
          <Chip
            icon={<Trophy className="h-3.5 w-3.5 text-[var(--brass-deep)]" />}
            label="Personal best"
            value={`${bestDay} d`}
          />
        </div>
      </div>
    </header>
  );
}

function Chip({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1.5">
      {icon}
      <div className="leading-tight">
        <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </div>
        <div className="font-serif-d text-sm">{value}</div>
      </div>
    </div>
  );
}

/* -------- Scene frame -------- */
function SceneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative rounded-3xl border border-border bg-card/40 p-6 backdrop-blur-md shadow-[0_20px_60px_-30px_oklch(0.3_0.05_120/0.4)]">
      <div className="absolute inset-3 rounded-2xl border border-border/50 pointer-events-none" />
      {children}
    </div>
  );
}

/* -------- Selection -------- */
function SelectionPanel({
  recipe,
  setRecipe,
  phase,
  forecast,
  onSeal,
}: {
  recipe: Recipe;
  setRecipe: (r: Recipe) => void;
  phase: Phase;
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
    <aside className="rounded-3xl border border-border bg-card/60 p-5 backdrop-blur-md shadow-[0_10px_30px_-20px_oklch(0.3_0.05_120/0.3)]">
      <div className="mb-4">
        <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          Composition
        </div>
        <h2 className="font-serif-d text-2xl leading-tight mt-1">Build your jar</h2>
      </div>

      <Tabs defaultValue="substrate">
        <TabsList className="grid w-full grid-cols-4 bg-muted/60 rounded-full p-1 h-10">
          {[
            ["substrate", "Soil"],
            ["plants", "Flora"],
            ["fauna", "Fauna"],
            ["atmos", "Air"],
          ].map(([v, l]) => (
            <TabsTrigger
              key={v}
              value={v}
              className="rounded-full data-[state=active]:bg-card data-[state=active]:shadow-sm font-serif-d text-base"
            >
              {l}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="substrate" className="mt-4 space-y-2">
          {SUBSTRATES.map((s) => (
            <IngredientCard
              key={s.id}
              image={ASSETS.substrate[s.id]}
              name={s.name}
              blurb={s.blurb}
              selected={recipe.substrate === s.id}
              disabled={disabled}
              onClick={() => setRecipe({ ...recipe, substrate: s.id as SubstrateId })}
            />
          ))}
        </TabsContent>

        <TabsContent value="plants" className="mt-4 space-y-2">
          <p className="text-xs text-muted-foreground italic mb-2">
            Choose one to five plants · {recipe.plants.length}/5
          </p>
          {PLANTS.map((p) => {
            const active = recipe.plants.includes(p.id);
            return (
              <IngredientCard
                key={p.id}
                image={ASSETS.plant[p.id]}
                name={p.name}
                blurb={`moisture ${p.moistureMin}–${p.moistureMax} · light ≥${p.lightMin}h`}
                selected={active}
                disabled={disabled}
                onClick={() => togglePlant(p.id)}
              />
            );
          })}
        </TabsContent>

        <TabsContent value="fauna" className="mt-4 space-y-2">
          {FAUNA.map((f) => {
            const count = recipe.fauna[f.id] ?? 0;
            return (
              <div
                key={f.id}
                className="rounded-2xl border border-border bg-card/80 p-3 flex items-center gap-3"
              >
                <div className="h-14 w-14 rounded-xl overflow-hidden bg-muted/60 grid place-items-center shrink-0">
                  <img
                    src={ASSETS.fauna[f.id]}
                    alt={f.name}
                    className="h-full w-full object-contain p-1"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-serif-d text-base leading-tight">{f.name}</div>
                  <div className="text-xs text-muted-foreground leading-snug italic">
                    {f.blurb}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    disabled={disabled}
                    onClick={() => bumpFauna(f.id, -1)}
                    className="h-7 w-7 grid place-items-center rounded-full border border-border bg-card hover:bg-muted disabled:opacity-40"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="font-serif-d text-lg w-6 text-center tabular-nums">
                    {count}
                  </span>
                  <button
                    disabled={disabled}
                    onClick={() => bumpFauna(f.id, 1)}
                    className="h-7 w-7 grid place-items-center rounded-full border border-border bg-card hover:bg-muted disabled:opacity-40"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="atmos" className="mt-5 space-y-6">
          <AtmoSlider
            icon={<Droplets className="h-4 w-4" />}
            label="Humidity"
            value={recipe.humidity}
            min={10}
            max={100}
            suffix="%"
            onChange={(v) => setRecipe({ ...recipe, humidity: v })}
            disabled={disabled}
          />
          <AtmoSlider
            icon={<Sun className="h-4 w-4" />}
            label="Light"
            value={recipe.light}
            min={0}
            max={16}
            suffix="h"
            onChange={(v) => setRecipe({ ...recipe, light: v })}
            disabled={disabled}
          />
        </TabsContent>
      </Tabs>

      <div className="mt-6 space-y-3">
        <div
          className={cn(
            "flex items-center justify-between rounded-full border px-4 py-2 text-sm",
            forecast.tone === "good" &&
              "border-primary/40 bg-primary/5 text-primary",
            forecast.tone === "risk" &&
              "border-[var(--brass)]/50 bg-[var(--brass)]/10 text-[var(--brass-deep)]",
            forecast.tone === "doom" &&
              "border-destructive/40 bg-destructive/5 text-destructive",
          )}
        >
          <span className="text-[10px] uppercase tracking-[0.25em] opacity-70">
            Forecast
          </span>
          <span className="font-serif-d italic">{forecast.label}</span>
        </div>
        <Button
          className="w-full h-12 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-serif-d text-base tracking-wide"
          disabled={disabled || recipe.plants.length === 0}
          onClick={onSeal}
        >
          <Check className="h-4 w-4 mr-1" /> Seal the jar
        </Button>
      </div>
    </aside>
  );
}

function IngredientCard({
  image,
  name,
  blurb,
  selected,
  disabled,
  onClick,
}: {
  image: string;
  name: string;
  blurb: string;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 rounded-2xl border bg-card/80 p-3 text-left transition-all disabled:opacity-60",
        selected
          ? "border-[var(--brass)] shadow-[inset_0_0_0_1px_var(--brass),0_4px_18px_-8px_oklch(0.6_0.1_75/0.4)]"
          : "border-border hover:border-foreground/30",
      )}
    >
      <div className="h-14 w-14 rounded-xl overflow-hidden bg-muted/50 grid place-items-center shrink-0">
        <img src={image} alt={name} className="h-full w-full object-contain p-1" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-serif-d text-base leading-tight">{name}</div>
        <div className="text-xs text-muted-foreground italic leading-snug truncate">
          {blurb}
        </div>
      </div>
      {selected && (
        <div className="h-5 w-5 rounded-full bg-[var(--brass)] text-card grid place-items-center shrink-0">
          <Check className="h-3 w-3" strokeWidth={3} />
        </div>
      )}
    </button>
  );
}

function AtmoSlider({
  icon,
  label,
  value,
  min,
  max,
  suffix,
  onChange,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (v: number) => void;
  disabled: boolean;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="flex items-center gap-2 text-sm">
          <span className="text-[var(--brass-deep)]">{icon}</span>
          <span className="font-serif-d text-base">{label}</span>
        </span>
        <span className="font-serif-d text-2xl tabular-nums">
          {value}
          <span className="text-sm text-muted-foreground ml-0.5">{suffix}</span>
        </span>
      </div>
      <Slider
        disabled={disabled}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={min}
        max={max}
        step={1}
      />
    </div>
  );
}

/* -------- Controls -------- */
function Controls({
  phase,
  speed,
  setSpeed,
  onReset,
}: {
  phase: Phase;
  speed: 0 | 1 | 8 | 32;
  setSpeed: (s: 0 | 1 | 8 | 32) => void;
  onReset: () => void;
}) {
  if (phase === "setup") {
    return (
      <div className="font-serif-d italic text-lg text-muted-foreground">
        Compose your jar, then press <span className="text-foreground not-italic">Seal the jar</span>.
      </div>
    );
  }
  const btn = (active: boolean) =>
    cn(
      "h-10 px-4 rounded-full transition-all flex items-center gap-1.5 font-serif-d text-sm",
      active
        ? "bg-foreground text-background shadow-md"
        : "text-foreground/70 hover:text-foreground hover:bg-muted/60",
    );
  return (
    <div className="flex items-center gap-1 rounded-full border border-border bg-card/80 backdrop-blur-md p-1.5 shadow-[0_8px_24px_-12px_oklch(0.3_0.05_120/0.3)]">
      <button onClick={() => setSpeed(0)} className={btn(speed === 0)} title="Pause">
        <Pause className="h-4 w-4" />
      </button>
      <button onClick={() => setSpeed(1)} className={btn(speed === 1)}>
        <Play className="h-4 w-4" /> 1×
      </button>
      <button onClick={() => setSpeed(8)} className={btn(speed === 8)}>
        <FastForward className="h-4 w-4" /> 8×
      </button>
      <button onClick={() => setSpeed(32)} className={btn(speed === 32)}>
        <FastForward className="h-4 w-4" /> 32×
      </button>
      <div className="mx-1 h-6 w-px bg-border" />
      <button onClick={onReset} className={btn(false)} title="Restart">
        <RotateCcw className="h-4 w-4" />
      </button>
    </div>
  );
}

/* -------- HUD -------- */
function HUD({ state, phase }: { state: SimState; phase: Phase }) {
  const livePlants = state.plants.filter((p) => !p.dead).length;
  const liveFauna = state.fauna.filter((f) => f.alive).length;
  return (
    <aside className="rounded-3xl border border-border bg-card/60 p-5 backdrop-blur-md shadow-[0_10px_30px_-20px_oklch(0.3_0.05_120/0.3)]">
      <div className="mb-4">
        <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          Field readings
        </div>
        <h2 className="font-serif-d text-2xl leading-tight mt-1">Vitals</h2>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-5">
        <Stat label="Day" value={state.day} />
        <Stat label="Biodiversity" value={Math.round(state.biodiversity)} />
      </div>

      <div className="space-y-4">
        <Bar label="Moisture" value={state.moisture} tint="oklch(0.55 0.12 220)" />
        <Bar label="Humidity" value={state.humidity} tint="oklch(0.6 0.1 200)" />
        <Bar label="Nutrients" value={state.nutrients} tint="oklch(0.55 0.12 70)" />
        <Bar label="Mold" value={state.moldCover} tint="oklch(0.7 0.03 100)" danger />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <Stat icon={<Leaf className="h-3.5 w-3.5" />} label="Plants" value={livePlants} />
        <Stat label="Fauna" value={liveFauna} />
      </div>

      {phase === "running" && (
        <p className="mt-5 text-xs text-muted-foreground italic">
          Hour {String(state.hour).padStart(2, "0")}:00 — observe quietly.
        </p>
      )}
    </aside>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: number | string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card/70 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="font-serif-d text-2xl leading-none mt-1 tabular-nums">
        {value}
      </div>
    </div>
  );
}

function Bar({
  label,
  value,
  tint,
  danger = false,
}: {
  label: string;
  value: number;
  tint: string;
  danger?: boolean;
}) {
  const v = Math.max(0, Math.min(100, value));
  const color = danger && v > 50 ? "oklch(0.55 0.18 28)" : tint;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </span>
        <span className="font-serif-d text-base tabular-nums">{Math.round(v)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${v}%`, background: color }}
        />
      </div>
    </div>
  );
}

/* -------- Forecast -------- */
function getForecast(recipe: Recipe): {
  label: string;
  tone: "good" | "risk" | "doom";
} {
  if (recipe.plants.length === 0) return { label: "Empty jar", tone: "doom" };
  const hasSpringtail = (recipe.fauna.springtail ?? 0) > 0;
  const snails = recipe.fauna.snail ?? 0;
  const plantCount = recipe.plants.length;
  if (recipe.humidity > 85 && !hasSpringtail)
    return { label: "Mold incoming", tone: "doom" };
  if (recipe.humidity < 30) return { label: "Too dry", tone: "doom" };
  if (snails > plantCount)
    return { label: "Snails will eat everything", tone: "doom" };
  if (snails > 0 && plantCount < 3)
    return { label: "Risky — too few plants", tone: "risk" };
  if (!hasSpringtail && recipe.humidity > 70)
    return { label: "Needs a cleanup crew", tone: "risk" };
  if (recipe.light < 4) return { label: "Risky — low light", tone: "risk" };
  return { label: "Looks balanced", tone: "good" };
}