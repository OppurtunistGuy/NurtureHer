import { useState } from "react";
import { toast } from "sonner";
import { SnakesBoard } from "@/components/nocturne/SnakesBoard";
import { AppShell } from "@/components/nocturne/AppShell";
import { Button } from "@/components/ui/button";
import { agreementReady } from "@/lib/nocturne/engine";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  HEAT_ORDER,
  WHEEL_SLICES,
  type GameId,
  type Heat,
} from "@/lib/nocturne/games/types";
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

const GAME_NAME: Partial<Record<GameId, string>> = {
  dice: "Dice Roll",
  wheel: "Wheel of Fortune",
  snakes: "Snakes & Ladders",
};
const SLICE_LABEL = (slice: (typeof WHEEL_SLICES)[number]) =>
  slice === "again" ? "Spin again" : slice === "choice" ? "Your choice" : CATEGORY_LABEL[slice];
const SLICE_FILL = [
  "#5b1426",
  "#3a0d19",
  "#6e1a2e",
  "#2a2218",
  "#4a1020",
  "#7a5a2a",
  "#2a2218",
  "#3a0d19",
];

function polar(angle: number, radius: number): [number, number] {
  const rad = ((angle - 90) * Math.PI) / 180;
  return [100 + radius * Math.cos(rad), 100 + radius * Math.sin(rad)];
}

function Wheel({ slice }: { slice: number | null }) {
  const rotation = slice === null ? 0 : 1800 - (slice + 0.5) * 45;
  return (
    <div
      role="img"
      aria-label={
        slice === null
          ? "The wheel, not spun yet"
          : `The wheel landed on ${SLICE_LABEL(WHEEL_SLICES[slice]!)}`
      }
      className="relative mx-auto w-full max-w-[18rem]"
    >
      <div className="absolute left-1/2 top-[-4px] z-10 h-0 w-0 -translate-x-1/2 border-x-[10px] border-t-[18px] border-x-transparent border-t-gold" />
      <svg
        viewBox="0 0 200 200"
        className="w-full transition-transform duration-[2800ms] ease-out motion-reduce:transition-none"
        style={{ transform: `rotate(${rotation}deg)` }}
      >
        <circle cx="100" cy="100" r="98" fill="#1a0a10" stroke="#c9a45c" strokeWidth="2" />
        {WHEEL_SLICES.map((name, i) => {
          const [x1, y1] = polar(i * 45, 94),
            [x2, y2] = polar((i + 1) * 45, 94),
            [tx, ty] = polar((i + 0.5) * 45, 64),
            mid = (i + 0.5) * 45,
            upright = mid > 90 && mid < 270 ? mid + 180 : mid;
          return (
            <g key={name}>
              <path
                d={`M100 100 L${x1} ${y1} A94 94 0 0 1 ${x2} ${y2} Z`}
                fill={SLICE_FILL[i]}
                stroke="#c9a45c"
                strokeWidth="0.8"
              />
              <text
                x={tx}
                y={ty}
                fill="#f0e6d6"
                fontSize="8"
                textAnchor="middle"
                dominantBaseline="middle"
                transform={`rotate(${upright - 90} ${tx} ${ty})`}
              >
                {SLICE_LABEL(name)}
              </text>
            </g>
          );
        })}
        <circle cx="100" cy="100" r="9" fill="#c9a45c" />
      </svg>
    </div>
  );
}

export function GamesPage() {
  const s = useNocturne(),
    enabled = useGamesEnabled();
  const [heat, setHeat] = useState<Heat>("spicy"),
    [game, setGame] = useState<"dice" | "wheel" | "snakes">("dice"),
    [box, setBox] = useState(false),
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
            {session.stopReason === "finished" && session.winner
              ? `${s.names[session.winner]} reached square 100 and won the last game.`
              : `The last game ended${session.stopReason === "red" ? " with RED" : ""}${session.stoppedBy ? ` — stopped by ${s.names[session.stoppedBy]}` : ""}.`}
          </p>
        )}
        <div>
          <div className="mb-4 flex gap-2">
            {(["dice", "wheel", "snakes"] as const).map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={game === g}
                onClick={() => setGame(g)}
                className={`rounded-md border border-gold/50 px-4 py-2 text-xs uppercase tracking-[0.2em] ${game === g ? "bg-secondary text-ivory" : "opacity-60"}`}
              >
                {GAME_NAME[g]}
              </button>
            ))}
          </div>
          <h2 className="font-serif text-lg text-ivory">{GAME_NAME[game]}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {game === "dice"
              ? "Two dice, one card. Die 1 picks the category, die 2 sets the minutes."
              : game === "wheel"
                ? "Spin the wheel. It picks a category, or lets you spin again, or hands you the choice."
                : "Race to 100. Ladders climb, snakes slide, and ◆ squares deal a task. When a snake bites the Master, the Sub gets points and may open the Surprise Box."}
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
        {game === "snakes" && (
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={box}
              onChange={(e) => setBox(e.target.checked)}
            />
            <span>
              Include the Surprise Box
              <span className="block text-xs text-muted-foreground">
                Opens for the Sub when a snake bites the Master. It can hold a task, a gentle
                punishment or a game-point deduction. It only switches on if you both tick this. The
                Sub can skip what it gives with a free skip.
              </span>
            </span>
          </label>
        )}
        {me === "dom" && game !== "snakes" && (
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} />
            Only I {game === "dice" ? "roll" : "spin"}
          </label>
        )}
        <p className="text-xs text-muted-foreground">
          Starting a game means you've opted in. {s.names[other]} taps Join to start. Either of you
          can stop at any time, and cards never cross your hard limits.
        </p>
        <Button
          disabled={busy}
          onClick={() =>
            run(() =>
              actions.startGame(
                game,
                heat,
                me === "dom" && lock && game !== "snakes",
                game === "snakes" && box,
              ),
            )
          }
        >
          Start game
        </Button>
      </section>
    );
  } else if (session.status === "lobby") {
    const joined = session.joined[me];
    body = (
      <section aria-label="Waiting to start" className="space-y-4">
        <h2 className="font-serif text-lg text-ivory">
          {GAME_NAME[session.game]} · {HEAT_LABEL[session.heat]}
        </h2>
        <p className="text-sm text-muted-foreground">
          {joined
            ? `Waiting for ${s.names[other]} to join.`
            : `${s.names[other]} started a game. Join when you're ready.`}
        </p>
        {!joined && session.game === "snakes" && (
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={box}
              onChange={(e) => setBox(e.target.checked)}
            />
            <span>
              Include the Surprise Box
              <span className="block text-xs text-muted-foreground">
                {session.box?.[other]
                  ? `${s.names[other]} said yes. `
                  : `${s.names[other]} did not tick this, so it stays off whatever you choose. `}
                It can give the Sub a task, a gentle punishment or a game-point deduction.
              </span>
            </span>
          </label>
        )}
        {!joined && (
          <Button disabled={busy} onClick={() => run(() => actions.joinGame(box))}>
            Join game
          </Button>
        )}
      </section>
    );
  } else {
    const card = session.currentCard,
      myTurn = session.turn === me,
      myCard = (session.cardFor ?? session.turn) === me,
      isWheel = session.game === "wheel",
      isSnakes = session.game === "snakes",
      boxOn = !!session.box?.dom && !!session.box?.sub,
      canRoll =
        !card &&
        !session.choosing &&
        !session.boxPending &&
        (session.masterOnlyRoll ? me === "dom" : myTurn);
    body = (
      <section aria-label={GAME_NAME[session.game]} className="space-y-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-lg text-ivory">
            {GAME_NAME[session.game]} ·{" "}
            <span className={HEAT_TEXT[session.heat].split(" ")[0]}>
              {HEAT_LABEL[session.heat]}
            </span>
          </h2>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {session.turn ? `${s.names[session.turn]}'s turn` : ""}
            {session.masterOnlyRoll ? ` · Master ${isWheel ? "spins" : "rolls"}` : ""}
          </p>
        </div>
        {isSnakes ? (
          <div className="space-y-3">
            <SnakesBoard session={session} names={s.names} />
            <p className="text-center text-sm text-muted-foreground">
              Game points · {s.names.dom}: {session.score?.dom ?? 0} · {s.names.sub}:{" "}
              {session.score?.sub ?? 0}
              {boxOn ? " · Surprise Box on" : " · Surprise Box off"}
            </p>
            {session.lastMove && (
              <p className="text-center text-sm text-ivory" aria-live="polite">
                {s.names[session.lastMove.role]} rolled {session.lastMove.die}
                {session.lastMove.event === "ladder" &&
                  ` and climbed a ladder from ${session.lastMove.via} to ${session.lastMove.to}.`}
                {session.lastMove.event === "snake" &&
                  ` and a snake at ${session.lastMove.via} dragged them to ${session.lastMove.to}.`}
                {session.lastMove.event === "card" &&
                  ` and landed on ${session.lastMove.to}: a task square.`}
                {session.lastMove.event === "none" && ` and moved to ${session.lastMove.to}.`}
              </p>
            )}
            {session.lastBox && !session.boxPending && (
              <p className="text-center text-xs text-muted-foreground">
                Last Surprise Box: {session.lastBox.title}
              </p>
            )}
          </div>
        ) : isWheel ? (
          <Wheel slice={session.lastSpin?.slice ?? null} />
        ) : (
          <div className="flex justify-center gap-8">
            <Die value={session.lastRoll?.die1 ?? null} label="Category" />
            <Die value={session.lastRoll?.die2 ?? null} label="Minutes" />
          </div>
        )}
        {session.choosing && (
          <div className="space-y-3 text-center">
            <p className="font-serif text-lg text-ivory">Your choice</p>
            {myTurn ? (
              <div className="flex flex-wrap justify-center gap-2">
                {CATEGORIES.map((c) => (
                  <Button
                    key={c}
                    variant="outline"
                    disabled={busy}
                    onClick={() => run(() => actions.pickCategory(c))}
                  >
                    {CATEGORY_LABEL[c]}
                  </Button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Waiting for {s.names[session.turn ?? other]} to pick a category.
              </p>
            )}
          </div>
        )}
        {session.boxPending && (
          <div className="space-y-3 rounded-md border border-gold/50 bg-wine-soft/30 p-5 text-center">
            <p className="font-serif text-lg text-ivory">The snake bit {s.names.dom}!</p>
            {me === "sub" ? (
              <>
                <p className="text-sm text-muted-foreground">
                  You got 5 game points. Open the Surprise Box if you like.
                </p>
                <Button disabled={busy} onClick={() => run(() => actions.openBox())}>
                  Open the Surprise Box
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Waiting for {s.names.sub} to open the Surprise Box.
              </p>
            )}
          </div>
        )}
        {!card && !session.choosing && !session.boxPending && (
          <div className="text-center">
            {isWheel && session.lastSpin && WHEEL_SLICES[session.lastSpin.slice] === "again" && (
              <p className="mb-3 text-sm text-ivory">Spin again!</p>
            )}
            <Button
              disabled={busy || !canRoll}
              onClick={() =>
                run(() =>
                  isSnakes
                    ? actions.moveToken()
                    : isWheel
                      ? actions.spinWheel()
                      : actions.rollDice(),
                )
              }
            >
              {isSnakes ? "Roll the die" : isWheel ? "Spin the wheel" : "Roll the dice"}
            </Button>
            {!canRoll && (
              <p className="mt-2 text-xs text-muted-foreground">
                {session.masterOnlyRoll
                  ? `Waiting for ${s.names.dom} to ${isWheel ? "spin" : "roll"}.`
                  : `Waiting for ${s.names[session.turn ?? other]} to ${isWheel ? "spin" : "roll"}.`}
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
              {myCard && (
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
