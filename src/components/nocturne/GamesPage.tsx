import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/nocturne/AppShell";
import { Button } from "@/components/ui/button";
import { agreementReady } from "@/lib/nocturne/engine";
import { CATEGORY_LABEL, HEAT_ORDER, type Heat } from "@/lib/nocturne/games/types";
import { uiActions as actions, useGamesEnabled, useNocturne } from "@/lib/nocturne/store";

const HEAT_LABEL: Record<Heat, string> = { sweet: "Sweet", spicy: "Spicy", hot: "Hot" };
const HEAT_TEXT: Record<Heat, string> = {
  sweet: "text-emerald-300 border-emerald-300/60",
  spicy: "text-orange-300 border-orange-300/60",
  hot: "text-red-400 border-red-400/60",
};

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function Die({ value, label }: { value: number | null; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        role="img"
        aria-label={value ? `${label}: ${value}` : `${label}: not rolled`}
        className="grid h-24 w-24 grid-cols-3 grid-rows-3 gap-1 rounded-md border border-gold/60 bg-ivory p-3"
      >
        {Array.from({ length: 9 }, (_, i) => (
          <span
            key={i}
            className={`m-auto h-3.5 w-3.5 rounded-full ${value && PIPS[value]?.includes(i) ? "bg-black" : "bg-transparent"}`}
          />
        ))}
      </div>
      <span className="text-[0.68rem] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

export function GamesPage() {
  const s = useNocturne(),
    enabled = useGamesEnabled();
  const [heat, setHeat] = useState<Heat>("spicy"),
    [lock, setLock] = useState(false),
    [busy, setBusy] = useState(false);
  const me = s.viewRole,
    other = me === "dom" ? "sub" : "dom",
    session = s.games?.session ?? null;

  async function run(action: () => Promise<{ ok: boolean }> | { ok: boolean }) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  let body;
  if (!enabled) {
    body = (
      <p className="text-sm text-muted-foreground">Games isn't switched on for this space yet.</p>
    );
  } else if (!s.space.paired || !agreementReady(s)) {
    body = (
      <p className="text-sm text-muted-foreground">
        Games open once both people are in the space and have acknowledged the agreement.
      </p>
    );
  } else if (s.pause.active && session?.status !== "active") {
    body = <p className="text-sm text-muted-foreground">The space is paused. Games are locked.</p>;
  } else if (!session || session.status === "stopped") {
    body = (
      <section aria-label="Start a game" className="space-y-6">
        {session?.status === "stopped" && (
          <p className="border-l-2 border-wine pl-4 text-sm text-muted-foreground">
            The last game ended
            {session.stopReason === "red" ? " with RED" : ""}
            {session.stoppedBy ? ` — stopped by ${s.names[session.stoppedBy]}` : ""}.
          </p>
        )}
        <div>
          <h2 className="font-serif text-lg text-ivory">Dice Roll</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Two dice, one card. Die 1 picks the category, die 2 sets the minutes.
          </p>
        </div>
        <fieldset>
          <legend className="mb-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Heat level
          </legend>
          <div className="flex gap-2">
            {HEAT_ORDER.map((h) => (
              <button
                key={h}
                type="button"
                aria-pressed={heat === h}
                onClick={() => setHeat(h)}
                className={`rounded-md border px-4 py-2 text-xs uppercase tracking-[0.2em] ${HEAT_TEXT[h]} ${heat === h ? "bg-secondary" : "opacity-60"}`}
              >
                {HEAT_LABEL[h]}
              </button>
            ))}
          </div>
        </fieldset>
        {me === "dom" && (
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} />
            Lock the dice: only I roll
          </label>
        )}
        <p className="text-xs text-muted-foreground">
          Starting a game means you've opted in. {s.names[other]} taps Join to start. Either of you
          can stop at any time, and cards never cross your hard limits.
        </p>
        <Button
          disabled={busy}
          onClick={() => run(() => actions.startGame(heat, me === "dom" && lock))}
        >
          Start game
        </Button>
      </section>
    );
  } else if (session.status === "lobby") {
    const joined = session.joined[me];
    body = (
      <section aria-label="Waiting to start" className="space-y-4">
        <h2 className="font-serif text-lg text-ivory">Dice Roll · {HEAT_LABEL[session.heat]}</h2>
        <p className="text-sm text-muted-foreground">
          {joined
            ? `Waiting for ${s.names[other]} to join.`
            : `${s.names[other]} started a game. Join when you're ready.`}
        </p>
        {!joined && (
          <Button disabled={busy} onClick={() => run(() => actions.joinGame())}>
            Join game
          </Button>
        )}
      </section>
    );
  } else {
    const card = session.currentCard,
      myTurn = session.turn === me,
      canRoll = !card && (session.masterOnlyRoll ? me === "dom" : myTurn);
    body = (
      <section aria-label="Dice Roll" className="space-y-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-lg text-ivory">
            Dice Roll ·{" "}
            <span className={HEAT_TEXT[session.heat].split(" ")[0]}>
              {HEAT_LABEL[session.heat]}
            </span>
          </h2>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {session.turn ? `${s.names[session.turn]}'s turn` : ""}
            {session.masterOnlyRoll ? " · Master rolls" : ""}
          </p>
        </div>
        <div className="flex justify-center gap-8">
          <Die value={session.lastRoll?.die1 ?? null} label="Category" />
          <Die value={session.lastRoll?.die2 ?? null} label="Minutes" />
        </div>
        {!card && (
          <div className="text-center">
            <Button disabled={busy || !canRoll} onClick={() => run(() => actions.rollDice())}>
              Roll the dice
            </Button>
            {!canRoll && (
              <p className="mt-2 text-xs text-muted-foreground">
                {session.masterOnlyRoll
                  ? `Waiting for ${s.names.dom} to roll.`
                  : `Waiting for ${s.names[session.turn ?? other]} to roll.`}
              </p>
            )}
          </div>
        )}
        {card && (
          <article
            aria-label="Current card"
            className="rounded-md border border-gold/50 bg-wine-soft/30 p-5"
          >
            <p className="flex justify-between text-[0.68rem] uppercase tracking-[0.2em] text-muted-foreground">
              <span>{CATEGORY_LABEL[card.category]}</span>
              <span>
                {HEAT_LABEL[card.heat]}
                {card.timerMinutes ? ` · ${card.timerMinutes} min` : ""}
              </span>
            </p>
            <p className="mt-4 font-serif text-xl leading-snug text-ivory">{card.title}</p>
            {card.points ? (
              <p className="mt-2 text-xs text-muted-foreground">+{card.points} game points</p>
            ) : null}
            <div className="mt-5 flex flex-wrap gap-2">
              <Button disabled={busy} onClick={() => run(() => actions.finishCard())}>
                Done
              </Button>
              {myTurn && (
                <Button
                  variant="outline"
                  disabled={busy || session.skips[me] <= 0}
                  onClick={() => run(() => actions.skipCard())}
                >
                  Skip ({session.skips[me]} left)
                </Button>
              )}
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => run(() => actions.yellowCard())}
              >
                YELLOW: skip
              </Button>
            </div>
            <div className="mt-3">
              {me === "sub" ? (
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const first = await actions.refuseCard(card.id);
                      if (first.ok) await actions.yellowCard();
                      else toast.error("Couldn't hide that card.");
                      return first;
                    })
                  }
                >
                  Not for me — never show this card
                </button>
              ) : (
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const first = await actions.hideCard(card.id);
                      if (first.ok) await actions.yellowCard();
                      return first;
                    })
                  }
                >
                  Hide this card from the deck
                </button>
              )}
            </div>
          </article>
        )}
      </section>
    );
  }

  const running = enabled && session && session.status !== "stopped";
  return (
    <AppShell title="Games" eyebrow="Together" allowDuringPause>
      <div className="space-y-8">
        {body}
        {running && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="text-xs text-muted-foreground">
              RED ends the game at once. Skips never cost points.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => run(() => actions.stopGame())}
              >
                Stop
              </Button>
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() => run(() => actions.redGame())}
              >
                RED: stop now
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
