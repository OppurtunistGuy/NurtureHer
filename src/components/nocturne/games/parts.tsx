import { useEffect, useState, type ReactNode } from "react";
import {
  CATEGORY_LABEL,
  type CardKind,
  type GameCard,
  type Heat,
} from "@/lib/nocturne/games/types";
import type { Role } from "@/lib/nocturne/types";
import { HEAT, ROLE_COLOR } from "./theme";

const KIND: Record<CardKind, { label: string; frame: string; chip: string }> = {
  task: { label: "Task", frame: "border-gold/60", chip: "bg-gold/15 text-gold" },
  reward: {
    label: "Reward",
    frame: "border-[#8fb08f]/70",
    chip: "bg-[#8fb08f]/15 text-[#a9c9a9]",
  },
  punishment: {
    label: "Punishment",
    frame: "border-[#c2324a]",
    chip: "bg-[#c2324a] text-[#fff1f1]",
  },
  deduction: {
    label: "Point deduction",
    frame: "border-[#d4843a]/70",
    chip: "bg-[#d4843a]/15 text-[#e09a55]",
  },
};

export function HeatChip({ heat }: { heat: Heat }) {
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${HEAT[heat].text}`}>
      {HEAT[heat].label}
    </span>
  );
}

export function Token({ role, name, size = 32 }: { role: Role; name: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-display font-semibold text-[#14080c] ring-2 ring-[#14080c]"
      style={{ width: size, height: size, background: ROLE_COLOR[role], fontSize: size * 0.48 }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** A countdown the person can start when they begin the card. Lives only on this screen. */
function Timer({ minutes, cardKey }: { minutes: number; cardKey: string }) {
  const [endsAt, setEndsAt] = useState<number | null>(null),
    [now, setNow] = useState(() => Date.now());
  useEffect(() => setEndsAt(null), [cardKey]);
  useEffect(() => {
    if (!endsAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [endsAt]);
  const left = endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : minutes * 60;
  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  return (
    <div className="flex items-center gap-3">
      <span
        className={`font-display text-2xl tabular-nums ${endsAt && left === 0 ? "text-[#a9c9a9]" : "text-ivory"}`}
        aria-live={endsAt && left === 0 ? "assertive" : "off"}
      >
        {endsAt && left === 0 ? "Time's up" : clock}
      </span>
      {!endsAt ? (
        <button
          type="button"
          onClick={() => {
            setNow(Date.now());
            setEndsAt(Date.now() + minutes * 60_000);
          }}
          className="rounded-full border border-gold/50 px-3 py-1 text-xs text-gold hover:bg-gold/10"
        >
          Start timer
        </button>
      ) : left > 0 ? (
        <button
          type="button"
          onClick={() => setEndsAt(null)}
          className="text-xs text-muted-foreground underline underline-offset-4"
        >
          Reset
        </button>
      ) : null}
    </div>
  );
}

/** The dealt card, styled like a playing card from the deck. */
export function PlayCard({
  card,
  forName,
  children,
  footnote,
  showPoints = false,
}: {
  card: GameCard;
  forName: string;
  /** Only Snakes & Ladders keeps a game score, so other games don't promise points. */
  showPoints?: boolean;
  children: ReactNode;
  footnote?: ReactNode;
}) {
  const kind = KIND[card.kind];
  return (
    <article
      key={card.id}
      aria-label="Current card"
      className={`games-deal relative overflow-hidden rounded-xl border-2 bg-[linear-gradient(160deg,#2a0f18,#170910)] p-5 shadow-[0_20px_50px_-25px_rgba(190,38,62,0.55)] sm:p-6 ${kind.frame}`}
    >
      <div className="pointer-events-none absolute inset-1.5 rounded-lg border border-dashed border-gold/15" />
      <div className="relative flex flex-wrap items-center justify-between gap-2">
        <span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${kind.chip}`}>
          {kind.label}
        </span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {CATEGORY_LABEL[card.category]}
          <HeatChip heat={card.heat} />
        </span>
      </div>
      <p className="relative mt-1 text-xs text-muted-foreground">For {forName}</p>
      <p className="relative mt-4 max-w-[30ch] font-display text-[1.65rem] leading-tight text-ivory sm:text-3xl">
        {card.title}
      </p>
      {showPoints && card.points ? (
        <p className="relative mt-2 text-sm text-[#a9c9a9]">
          {card.kind === "deduction" ? "−" : "+"}
          {card.points} game points
        </p>
      ) : null}
      {card.timerMinutes ? (
        <div className="relative mt-4">
          <Timer minutes={card.timerMinutes} cardKey={card.id} />
        </div>
      ) : null}
      <div className="relative mt-5 flex flex-wrap items-center gap-2">{children}</div>
      {footnote ? <div className="relative mt-3">{footnote}</div> : null}
    </article>
  );
}

/** Whose turn it is, what just happened, and the one thing to do next. */
export function TurnBar({
  role,
  name,
  mine,
  label,
  detail,
  action,
}: {
  role: Role;
  name: string;
  mine: boolean;
  label?: string | undefined;
  detail?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-xl border bg-[#1a0b11] px-4 py-3 ${mine ? "border-gold/60" : "border-border"}`}
    >
      <Token role={role} name={name} />
      <div className="min-w-0 flex-1">
        <p className="font-display text-lg leading-tight text-ivory" aria-live="polite">
          {label ?? (mine ? "Your turn" : `${name}'s turn`)}
        </p>
        {detail ? <p className="text-sm text-muted-foreground">{detail}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** Safety always within reach: YELLOW skips the card for free, RED ends the game at once. */
export function SafetyBar({
  canYellow,
  busy,
  onYellow,
  onRed,
  skipsNote,
}: {
  canYellow: boolean;
  busy: boolean;
  onYellow: () => void;
  onRed: () => void;
  skipsNote: string;
}) {
  return (
    <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 md:static">
      <div className="flex items-center gap-2 rounded-xl border border-border bg-[#120609]/95 px-2.5 py-2 sm:px-3 sm:py-2.5 shadow-[0_-10px_30px_-12px_rgba(0,0,0,0.8)] backdrop-blur">
        <button
          type="button"
          disabled={busy || !canYellow}
          onClick={onYellow}
          className="flex-1 rounded-lg border border-[#d8b84a]/70 bg-[#2a2408] px-3 py-2 text-sm font-semibold text-[#e9cf6a] sm:flex-none sm:px-4"
        >
          YELLOW: skip card
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onRed}
          className="flex-1 rounded-lg border border-[#e0485c] bg-[#4a0d17] px-3 py-2 text-sm font-semibold text-[#ff9aa8] sm:flex-none sm:px-4"
        >
          RED: stop now
        </button>
        <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">{skipsNote}</span>
      </div>
    </div>
  );
}
