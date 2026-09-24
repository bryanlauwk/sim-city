import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { FastForward, Loader2, Pause, Play, RotateCcw, Send, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Newspaper } from "@/components/city/Newspaper";
import {
  MAX_CREDITS,
  REFILL_MS,
  clearCity,
  currentCredits,
  decodeShare,
  encodeShare,
  loadCity,
  loadCredits,
  saveCity,
  saveCredits,
  spendCredits,
  type Credits,
} from "@/lib/city/persistence";
import { applyEvent, countKinds, createCity, tick } from "@/lib/city/simulation";
import { simulateEvent } from "@/lib/city/simulate.functions";
import { SCALE_COST, type CityState } from "@/lib/city/types";
import { cn } from "@/lib/utils";

const CityScene = lazy(() => import("@/components/city/CityScene"));

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Type-a-Disaster — a city that happens to you" },
      {
        name: "description",
        content:
          "A tiny low-poly city runs itself. You type what happens to it, and the local paper reports the consequences.",
      },
    ],
  }),
});

const DAY_MS = 2000;
const SUGGESTIONS = [
  "A whale lands on city hall",
  "The mayor legalizes jetpacks",
  "Free pizza Fridays become law",
  "A mysterious fog rolls in off the lake",
  "Godzilla visits for a long weekend",
  "Everyone gets really into composting",
];
const SHAKE = { minor: 0.04, citywide: 0.12, apocalyptic: 0.3 } as const;

const newSeed = () => Math.floor(Math.random() * 2 ** 31);

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bad" | "good" }) {
  return (
    <div className="border border-ink/25 bg-paper/85 px-2 py-1 backdrop-blur-sm">
      <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "font-mono text-sm font-semibold tabular-nums",
          tone === "bad" && "text-stamp",
          tone === "good" && "text-leaf",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function Index() {
  const [city, setCity] = useState<CityState | null>(null);
  const [shared, setShared] = useState(false);
  const [paused, setPaused] = useState(false);
  const [fast, setFast] = useState(false);
  const [credits, setCredits] = useState<Credits>({ credits: MAX_CREDITS, since: 0 });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState({ trigger: 0, strength: 0 });
  const [confirmReset, setConfirmReset] = useState(false);
  const [dismissedCollapse, setDismissedCollapse] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  // Load a shared city from the URL hash, else the saved city, else a fresh one.
  useEffect(() => {
    setCredits(loadCredits());
    const hash = window.location.hash;
    if (hash.startsWith("#c=")) {
      decodeShare(hash.slice(3))
        .then((c) => {
          setCity(c);
          setShared(true);
        })
        .catch(() => {
          toast.error("That share link is smudged beyond reading. Here's your own city instead.");
          setCity(loadCity() ?? createCity(newSeed()));
        });
    } else {
      setCity(loadCity() ?? createCity(newSeed()));
    }
  }, []);

  // Simulation clock.
  const loaded = city !== null;
  const collapsed = city?.collapsed ?? false;
  useEffect(() => {
    if (!loaded || paused || collapsed) return;
    const id = setInterval(() => setCity((c) => (c ? tick(c) : c)), fast ? DAY_MS / 4 : DAY_MS);
    return () => clearInterval(id);
  }, [loaded, paused, fast, collapsed]);

  // Persist your own city. A shared one only becomes yours once you act on it.
  useEffect(() => {
    if (city && !shared) saveCity(city);
  }, [city, shared]);

  // Credit refill clock.
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      setCredits((c) => currentCredits(c));
    }, 5000);
    return () => clearInterval(id);
  }, []);

  const adoptShared = useCallback(() => {
    if (!shared) return;
    setShared(false);
    history.replaceState(null, "", window.location.pathname);
  }, [shared]);

  const submit = async (text: string) => {
    const event = text.trim();
    if (!city || busy) return;
    if (event.length < 3) {
      inputRef.current?.focus();
      return;
    }
    const available = currentCredits(credits);
    if (available.credits < 1) {
      const mins = Math.ceil((available.since + REFILL_MS - Date.now()) / 60000);
      toast("Out of event credits", { description: `The presses reopen in about ${mins} min.` });
      return;
    }
    setBusy(true);
    try {
      const kinds = countKinds(city.grid);
      const res = await simulateEvent({
        data: {
          event,
          city: {
            name: city.name,
            day: city.day,
            stats: city.stats,
            tiles: Object.fromEntries(Object.entries(kinds).filter(([, n]) => n > 0)),
            recentHeadlines: city.log.slice(-5).map((e) => e.result.headline),
          },
        },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const { result, refused } = res;
      adoptShared();
      setCity((cur) => (cur ? applyEvent(cur, event, result) : cur));
      setDismissedCollapse(false);
      setInput("");
      if (refused) {
        toast("No charge", { description: "The council refused to print that one." });
      } else {
        const next = spendCredits(available, SCALE_COST[result.scale]);
        setCredits(next);
        saveCredits(next);
        setShake((s) => ({ trigger: s.trigger + 1, strength: SHAKE[result.scale] }));
      }
    } catch (error) {
      console.error(error);
      toast.error("Couldn't reach the newsroom. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (!city) return;
    const url = `${window.location.origin}/#c=${await encodeShare(city)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `The ${city.name} Gazette`, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied", {
          description: "Anyone with it can replay your city's history.",
        });
      }
    } catch {
      /* share sheet dismissed */
    }
  };

  const newCity = () => {
    clearCity();
    setShared(false);
    history.replaceState(null, "", window.location.pathname);
    setCity(createCity(newSeed()));
    setDismissedCollapse(false);
  };

  const c = currentCredits(credits, now);
  const nextIn = Math.max(1, Math.ceil((c.since + REFILL_MS - now) / 60000));
  const st = city?.stats;

  return (
    <div className="flex h-dvh flex-col bg-paper text-ink lg:flex-row">
      <Toaster position="top-center" />
      <main className="relative min-h-[56dvh] flex-1 overflow-hidden lg:min-h-0">
        <div className="absolute inset-0">
          <ClientOnly fallback={<SceneFallback />}>
            <Suspense fallback={<SceneFallback />}>
              {city ? <CityScene city={city} shake={shake} /> : <SceneFallback />}
            </Suspense>
          </ClientOnly>
        </div>

        {/* Masthead + stats */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-3">
          <div className="pointer-events-auto border-2 border-ink bg-paper/90 px-3 py-1.5 backdrop-blur-sm">
            <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
              Type-a-Disaster
            </p>
            <h1 className="font-serif-d text-lg font-black leading-tight">
              {city?.name ?? "Loading…"}
            </h1>
            <p className="font-mono text-[10px] text-muted-foreground">
              Day {city?.day ?? 0}
              {paused && " · paused"}
            </p>
          </div>
          {st && (
            <div className="pointer-events-auto grid grid-cols-5 gap-1">
              <Stat label="Pop." value={st.population.toLocaleString()} />
              <Stat
                label="Mood"
                value={`${Math.round(st.happiness)}`}
                tone={st.happiness < 35 ? "bad" : st.happiness > 65 ? "good" : undefined}
              />
              <Stat
                label="Budget"
                value={`$${Math.round(st.money).toLocaleString()}`}
                tone={st.money < 0 ? "bad" : undefined}
              />
              <Stat
                label="Smog"
                value={`${Math.round(st.pollution)}`}
                tone={st.pollution > 60 ? "bad" : undefined}
              />
              <Stat
                label="Chaos"
                value={`${Math.round(st.chaos)}`}
                tone={st.chaos > 50 ? "bad" : undefined}
              />
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="absolute right-3 top-36 flex flex-col gap-1 sm:top-20">
          <Button
            size="icon"
            variant="outline"
            className="rounded-none border-ink bg-paper/90"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? "Resume" : "Pause"}
            title={paused ? "Resume" : "Pause"}
          >
            {paused ? <Play /> : <Pause />}
          </Button>
          <Button
            size="icon"
            variant="outline"
            className={cn(
              "rounded-none border-ink bg-paper/90",
              fast && "bg-ink text-paper hover:bg-ink/90 hover:text-paper",
            )}
            onClick={() => setFast((f) => !f)}
            aria-label="Fast forward"
            aria-pressed={fast}
            title="Fast forward"
          >
            <FastForward />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="rounded-none border-ink bg-paper/90"
            onClick={share}
            aria-label="Share city"
            title="Share city"
          >
            <Share2 />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="rounded-none border-ink bg-paper/90"
            onClick={() => setConfirmReset(true)}
            aria-label="New city"
            title="New city"
          >
            <RotateCcw />
          </Button>
        </div>

        {shared && (
          <div className="absolute left-3 right-16 top-36 border-2 border-ink bg-paper/95 p-2 text-sm sm:top-20 sm:max-w-sm">
            You're reading someone else's city. Type an event to take it over, or{" "}
            <button className="underline" onClick={newCity}>
              start your own
            </button>
            .
          </div>
        )}

        {/* Event input */}
        <div className="absolute inset-x-0 bottom-0 p-3">
          <div className="mx-auto max-w-2xl border-2 border-ink bg-paper/95 p-2 shadow-[4px_4px_0_0_var(--ink)] backdrop-blur-sm">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                submit(input);
              }}
            >
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={200}
                disabled={busy}
                aria-label="Event"
                placeholder="Type something that happens to the city…"
                className="min-w-0 flex-1 bg-transparent px-2 py-2 font-serif-d text-base outline-none placeholder:text-ink/40"
              />
              <Button
                type="submit"
                disabled={busy || !city}
                className="rounded-none bg-stamp text-paper hover:bg-stamp/90"
              >
                {busy ? <Loader2 className="animate-spin" /> : <Send />}
                <span className="hidden sm:inline">{busy ? "Printing…" : "Print it"}</span>
              </Button>
            </form>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
              <div
                className="flex items-center gap-1"
                title="Event credits: minor events cost 1, citywide 2, apocalyptic 3"
              >
                {Array.from({ length: MAX_CREDITS }, (_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "size-2.5 rotate-45 border border-ink",
                      i < c.credits && "bg-ink",
                    )}
                  />
                ))}
                <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                  {c.credits < MAX_CREDITS ? `+1 in ${nextIn}m` : "credits full"}
                </span>
              </div>
              <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setInput(s);
                      inputRef.current?.focus();
                    }}
                    className="shrink-0 border border-ink/30 px-1.5 py-0.5 font-mono text-[10px] hover:bg-ink hover:text-paper"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      <aside className="max-h-[44dvh] overflow-y-auto border-t-2 border-ink bg-newsprint lg:max-h-none lg:w-[400px] lg:border-l-2 lg:border-t-0">
        {city && <Newspaper city={city} />}
      </aside>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent className="rounded-none border-2 border-ink bg-paper">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif-d">Bulldoze and start over?</AlertDialogTitle>
            <AlertDialogDescription>
              {city?.name} and its whole archive will be gone. Share it first if you want to keep a
              copy.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-none">Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-none bg-stamp text-paper hover:bg-stamp/90"
              onClick={newCity}
            >
              New city
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={collapsed && !dismissedCollapse && !shared}>
        <AlertDialogContent className="rounded-none border-2 border-ink bg-paper">
          <AlertDialogHeader>
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              Obituaries · Day {city?.day}
            </p>
            <AlertDialogTitle className="font-serif-d text-2xl">
              {city?.name}, day 0 – {city?.day}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-ink/80">
              The city is survived by {city ? countKinds(city.grid).rubble : 0} piles of rubble and{" "}
              {city?.log.length ?? 0} front pages. In lieu of flowers, the family asks that you
              found another city, or type something that brings this one back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-none" onClick={() => setDismissedCollapse(true)}>
              Try to revive it
            </AlertDialogCancel>
            <AlertDialogAction className="rounded-none bg-ink text-paper" onClick={newCity}>
              Found a new city
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SceneFallback() {
  return (
    <div className="flex h-full items-center justify-center bg-sky font-mono text-xs uppercase tracking-widest text-ink/60">
      Surveying the land…
    </div>
  );
}
