import { SCALE_COST, type CityState, type EventRecord } from "@/lib/city/types";
import { cn } from "@/lib/utils";

const SCALE_LABEL = { minor: "Local", citywide: "Citywide", apocalyptic: "Apocalyptic" } as const;

function Story({ ev, lead }: { ev: EventRecord; lead?: boolean }) {
  const r = ev.result;
  return (
    <article className={cn("border-b border-ink/20 pb-4", lead ? "pt-1" : "pt-3")}>
      <div className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        <span>Day {ev.day}</span>
        <span aria-hidden>·</span>
        <span className={cn(r.scale === "apocalyptic" && "text-stamp font-semibold")}>
          {SCALE_LABEL[r.scale]}
        </span>
        <span aria-hidden>·</span>
        <span>
          {SCALE_COST[r.scale]} credit{SCALE_COST[r.scale] > 1 ? "s" : ""}
        </span>
      </div>
      <h3
        className={cn(
          "font-serif-d font-bold leading-tight text-balance",
          lead ? "text-2xl sm:text-3xl" : "text-lg",
        )}
      >
        {r.headline}
      </h3>
      {lead && <p className="mt-2 text-sm leading-snug text-ink/80">{r.subhead}</p>}
      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
        Reader submission: “{ev.input}”
      </p>
      {lead && r.quotes.length > 0 && (
        <div className="mt-3 space-y-2">
          {r.quotes.map((q, i) => (
            <blockquote key={i} className="border-l-2 border-ink/60 pl-3 text-sm">
              <p className="italic">“{q.text}”</p>
              <footer className="mt-0.5 text-xs text-muted-foreground">
                — {q.name}, {q.role}
              </footer>
            </blockquote>
          ))}
        </div>
      )}
    </article>
  );
}

export function Newspaper({ city }: { city: CityState }) {
  const stories = [...city.log].reverse();
  const [lead, ...archive] = stories;

  return (
    <div className="px-5 py-4">
      <header className="border-y-4 border-double border-ink py-2 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          Est. day 0 · Price: one event credit
        </p>
        <h2 className="font-serif-d text-3xl font-black tracking-tight">The {city.name} Gazette</h2>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Day {city.day} · Pop. {city.stats.population.toLocaleString()}
        </p>
      </header>

      {city.ongoing.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {city.ongoing.map((o, i) => (
            <span
              key={i}
              className="border border-ink/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider"
            >
              Ongoing: {o.label} ({o.daysLeft}d)
            </span>
          ))}
        </div>
      )}

      <div className="mt-3">
        {lead ? (
          <Story ev={lead} lead />
        ) : (
          <div className="py-6 text-center">
            <h3 className="font-serif-d text-2xl font-bold">Nothing has happened yet</h3>
            <p className="mx-auto mt-2 max-w-xs text-sm text-ink/70">
              Residents report a quiet, suspiciously pleasant day. Type an event below to give the
              paper something to print.
            </p>
          </div>
        )}
        {archive.length > 0 && (
          <>
            <h4 className="mt-4 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              Archive
            </h4>
            {archive.map((ev, i) => (
              <Story key={i} ev={ev} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
