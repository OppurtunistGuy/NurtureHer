import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/nocturne/AppShell";
import { HEAT } from "@/components/nocturne/games/theme";
import { HeatChip, PlayCard, SafetyBar, Token, TurnBar } from "@/components/nocturne/games/parts";
import {
  BoardStage,
  DiceStage,
  GameArt,
  SurpriseBoxPanel,
  WheelStage,
} from "@/components/nocturne/games/stages";
import { Button } from "@/components/ui/button";
import { agreementReady } from "@/lib/nocturne/engine";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  HEAT_ORDER,
  WHEEL_SLICES,
  type GameId,
  type GameSession,
  type Heat,
} from "@/lib/nocturne/games/types";
import { uiActions as actions, useGamesEnabled, useNocturne } from "@/lib/nocturne/store";
import type { Role } from "@/lib/nocturne/types";

type Playable = "dice" | "wheel" | "snakes";
const GAMES: { id: Playable; name: string; line: string; time: string }[] = [
  {
    id: "dice",
    name: "Dice Roll",
    line: "Two dice pick the card and the minutes.",
    time: "A few minutes",
  },
  {
    id: "wheel",
    name: "Wheel of Fortune",
    line: "Spin for a category, a second spin, or your own pick.",
    time: "A few minutes",
  },
  {
    id: "snakes",
    name: "Snakes & Ladders",
    line: "Race to 100. Task squares deal cards, snakes can open the Surprise Box.",
    time: "Around 30 minutes",
  },
];
const NAME: Record<GameId, string> = {
  dice: "Dice Roll",
  wheel: "Wheel of Fortune",
  snakes: "Snakes & Ladders",
};

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function Choice({
  checked,
  onChange,
  title,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${checked ? "border-gold/70 bg-gold/5" : "border-border"}`}
    >
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 accent-[#c9a45c]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="block font-medium text-ivory">{title}</span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{children}</span>
      </span>
    </label>
  );
}

/** Plain-language line about the last move on the board. */
function moveLine(session: GameSession, names: Record<Role, string>) {
  const m = session.lastMove;
  if (!m) return "Roll the die to leave the start.";
  const who = names[m.role];
  switch (m.event) {
    case "ladder":
      return `${who} rolled ${m.die} and climbed from ${m.via} to ${m.to}.`;
    case "snake":
      return `${who} rolled ${m.die}. A snake on ${m.via} slid them to ${m.to}.`;
    case "card":
      return `${who} rolled ${m.die} and landed on task square ${m.to}.`;
    case "finish":
      return `${who} reached 100.`;
    default:
      return `${who} rolled ${m.die} and moved to ${m.to}.`;
  }
}

export function GamesPage() {
  const s = useNocturne(),
    enabled = useGamesEnabled();
  const [game, setGame] = useState<Playable>("dice"),
    [heat, setHeat] = useState<Heat>("spicy"),
    [lock, setLock] = useState(false),
    [box, setBox] = useState(false),
    [busy, setBusy] = useState(false);
  const me = s.viewRole,
    other: Role = me === "dom" ? "sub" : "dom",
    session = s.games?.session ?? null,
    names = s.names;

  async function run(action: () => Promise<{ ok: boolean }> | { ok: boolean }) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  const running = enabled && !!session && session.status !== "stopped";
  const playing = running && session?.status === "active";
  // Bring a new card or the Surprise Box into view, so nobody has to hunt for it below the board.
  const focusRef = useRef<HTMLDivElement>(null);
  const focusKey = `${session?.currentCard?.id ?? ""}-${session?.boxPending ? "box" : ""}-${session?.choosing ? "pick" : ""}`;
  useEffect(() => {
    if (focusKey === "--") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    focusRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
  }, [focusKey]);
  let body: React.ReactNode;

  if (!enabled) {
    body = <Note>Games aren't switched on for this space yet.</Note>;
  } else if (!s.space.paired || !agreementReady(s)) {
    body = (
      <Note>
        Games open once you're both in the space and have both acknowledged the agreement.
      </Note>
    );
  } else if (s.pause.active && !running) {
    body = <Note>The space is paused, so games are locked until you both resume.</Note>;
  } else if (!session || session.status === "stopped") {
    /* ---------- Pick and set up a game ---------- */
    const chosen = GAMES.find((g) => g.id === game)!;
    body = (
      <div className="space-y-8">
        {session?.status === "stopped" && (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-[#1a0b11] px-4 py-3">
            {session.stopReason === "finished" && session.winner ? (
              <>
                <Token role={session.winner} name={names[session.winner]} />
                <p className="text-sm">
                  <span className="font-display text-lg text-ivory">
                    {session.winner === me ? "You won" : `${names[session.winner]} won`} the last
                    game.
                  </span>
                  {session.score && (
                    <span className="block text-muted-foreground">
                      Game points: {names.dom} {session.score.dom}, {names.sub} {session.score.sub}
                    </span>
                  )}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                The last game ended
                {session.stopReason === "red" ? " with RED" : ""}
                {session.stoppedBy ? `, stopped by ${names[session.stoppedBy]}` : ""}. Check in with
                each other before starting another.
              </p>
            )}
          </div>
        )}

        <section aria-labelledby="pick-game">
          <h2 id="pick-game" className="text-2xl text-ivory">
            Choose a game
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Game">
            {GAMES.map((g) => {
              const on = game === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setGame(g.id)}
                  className={`flex items-center gap-4 rounded-xl border p-4 text-left transition-colors sm:flex-col sm:items-start ${on ? "border-gold bg-[linear-gradient(160deg,#2a1218,#170a0f)] shadow-[0_0_0_1px_rgba(201,164,92,0.4)]" : "border-border hover:border-gold/40"}`}
                >
                  <GameArt game={g.id} />
                  <span>
                    <span className="block font-display text-xl text-ivory">{g.name}</span>
                    <span className="mt-1 block text-sm text-muted-foreground">{g.line}</span>
                    <span className="mt-2 block text-xs text-gold/80">{g.time}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="pick-heat" className="space-y-3">
          <h2 id="pick-heat" className="text-2xl text-ivory">
            How hot?
          </h2>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Heat level">
            {HEAT_ORDER.map((h) => (
              <button
                key={h}
                type="button"
                role="radio"
                aria-checked={heat === h}
                onClick={() => setHeat(h)}
                className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${heat === h ? HEAT[h].solid : `${HEAT[h].text} bg-transparent`}`}
              >
                {HEAT[h].label}
              </button>
            ))}
          </div>
          <Note>
            {HEAT[heat].blurb} Cards up to this level can come up, and none of them cross your hard
            limits.
          </Note>
        </section>

        {(game === "snakes" || me === "dom") && (
          <section aria-label="Options" className="space-y-3">
            {game === "snakes" ? (
              <Choice checked={box} onChange={setBox} title="Include the Surprise Box">
                When a snake bites {names.dom}, {names.sub} gets 5 game points and can open a box
                holding a task, a gentle punishment or a point deduction. It only switches on if you
                both tick this.
              </Choice>
            ) : (
              <Choice
                checked={lock}
                onChange={setLock}
                title={game === "dice" ? "Only I roll" : "Only I spin"}
              >
                You take every {game === "dice" ? "roll" : "spin"}. Turns still alternate for who
                the card is for.
              </Choice>
            )}
          </section>
        )}

        <div className="space-y-2">
          <Button
            size="lg"
            className="w-full sm:w-auto"
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
            Start {chosen.name}
          </Button>
          <Note>
            Starting counts as your yes. {names[other]} joins to begin, and either of you can stop
            at any time.
          </Note>
        </div>
      </div>
    );
  } else if (session.status === "lobby") {
    /* ---------- Waiting for the second yes ---------- */
    const joined = session.joined[me];
    body = (
      <section aria-label="Waiting to start" className="space-y-6">
        <div className="flex items-center gap-4 rounded-xl border border-gold/40 bg-[linear-gradient(160deg,#2a1218,#170a0f)] p-5">
          <GameArt game={session.game} />
          <div>
            <h2 className="text-2xl text-ivory">{NAME[session.game]}</h2>
            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <HeatChip heat={session.heat} />
              {joined
                ? `Waiting for ${names[other]} to join.`
                : `${names[other]} wants to play. Join when you're ready.`}
            </p>
          </div>
        </div>
        {!joined && session.game === "snakes" && (
          <Choice checked={box} onChange={setBox} title="Include the Surprise Box">
            {session.box?.[other]
              ? `${names[other]} said yes. `
              : `${names[other]} left this off, so it stays off whatever you pick. `}
            It can give {names.sub} a task, a gentle punishment or a point deduction, and{" "}
            {names.sub} can veto it with a free skip.
          </Choice>
        )}
        {!joined && (
          <div className="flex flex-wrap gap-2">
            <Button size="lg" disabled={busy} onClick={() => run(() => actions.joinGame(box))}>
              Join the game
            </Button>
            <Button
              size="lg"
              variant="outline"
              disabled={busy}
              onClick={() => run(() => actions.stopGame())}
            >
              Not now
            </Button>
          </div>
        )}
        {joined && (
          <Button variant="outline" disabled={busy} onClick={() => run(() => actions.stopGame())}>
            Cancel the game
          </Button>
        )}
      </section>
    );
  } else {
    /* ---------- Playing ---------- */
    const card = session.currentCard,
      turn = session.turn ?? "dom",
      myTurn = turn === me,
      cardFor = session.cardFor ?? turn,
      myCard = cardFor === me,
      isWheel = session.game === "wheel",
      isSnakes = session.game === "snakes",
      roller: Role = session.masterOnlyRoll ? "dom" : turn,
      canRoll = !card && !session.choosing && !session.boxPending && roller === me,
      verb = isWheel ? "Spin the wheel" : isSnakes ? "Roll the die" : "Roll the dice";

    const detail = isSnakes
      ? moveLine(session, names)
      : session.masterOnlyRoll && turn === "sub"
        ? `${names.dom} rolls for ${names.sub}.`
        : isWheel && session.lastSpin && WHEEL_SLICES[session.lastSpin.slice] === "again"
          ? "Spin again."
          : undefined;

    const actionArea = canRoll ? (
      <Button
        size="lg"
        disabled={busy}
        onClick={() =>
          run(() =>
            isSnakes ? actions.moveToken() : isWheel ? actions.spinWheel() : actions.rollDice(),
          )
        }
      >
        {verb}
      </Button>
    ) : !card && !session.choosing && !session.boxPending ? (
      <span className="text-sm text-muted-foreground">Waiting for {names[roller]}</span>
    ) : null;

    body = (
      <div className="space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl text-ivory sm:text-3xl">{NAME[session.game]}</h2>
            <HeatChip heat={session.heat} />
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => actions.stopGame())}
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-ivory"
          >
            End game
          </button>
        </header>

        {isSnakes && session.score && (
          <div className="grid grid-cols-2 gap-2">
            {(["dom", "sub"] as const).map((r) => (
              <div
                key={r}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${turn === r ? "border-gold/60" : "border-border"}`}
              >
                <Token role={r} name={names[r]} size={28} />
                <div className="min-w-0">
                  <p className="truncate text-sm text-ivory">
                    {r === me ? "You" : names[r]}
                    <span className="text-muted-foreground">
                      {" "}
                      on {session.positions?.[r] || "start"}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">{session.score![r]} game points</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {isSnakes ? (
          <BoardStage session={session} names={names} />
        ) : isWheel ? (
          <WheelStage session={session} />
        ) : (
          <DiceStage session={session} />
        )}

        {isSnakes &&
          session.lastMove?.event === "snake" &&
          session.lastMove.role === "dom" &&
          session.boxPending && (
            <div className="games-deal flex items-center justify-between gap-3 rounded-xl border border-[#c2324a] bg-[#2a0b14] px-4 py-3">
              <p>
                <span className="block font-display text-lg text-ivory">
                  The snake on {session.lastMove.via} bit {names.dom}
                </span>
                <span className="text-sm text-muted-foreground">
                  {names.sub} gets 5 game points.
                </span>
              </p>
              <span className="font-display text-3xl text-[#a9c9a9]">+5</span>
            </div>
          )}

        <TurnBar
          role={session.boxPending ? "sub" : card ? cardFor : roller}
          name={names[session.boxPending ? "sub" : card ? cardFor : roller]}
          mine={(session.boxPending ? "sub" : card ? cardFor : roller) === me}
          label={
            session.boxPending
              ? me === "sub"
                ? "Your Surprise Box"
                : `${names.sub}'s Surprise Box`
              : card
                ? cardFor === me
                  ? "Your card"
                  : `${names[cardFor]}'s card`
                : undefined
          }
          detail={detail}
          action={actionArea}
        />

        <div ref={focusRef} className="scroll-mb-40 space-y-5 empty:hidden">
          {session.boxPending && (
            <SurpriseBoxPanel
              isSub={me === "sub"}
              names={names}
              busy={busy}
              onOpen={() => run(() => actions.openBox())}
            />
          )}

          {session.choosing && (
            <section
              aria-label="Your choice"
              className="games-deal rounded-xl border border-gold/50 p-5"
            >
              <h3 className="text-xl text-ivory">Your choice</h3>
              {myTurn ? (
                <>
                  <Note>Pick the category for this card.</Note>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
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
                </>
              ) : (
                <Note>{names[turn]} is choosing a category.</Note>
              )}
            </section>
          )}

          {card && (
            <PlayCard
              card={card}
              forName={myCard ? "you" : names[cardFor]}
              footnote={
                me === "sub" ? (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline underline-offset-4"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const first = await actions.refuseCard(card.id);
                        if (first.ok) await actions.yellowCard();
                        else toast.error("Couldn't remove that card.");
                        return first;
                      })
                    }
                  >
                    Not for me: never show this card again
                  </button>
                ) : (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline underline-offset-4"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const first = await actions.hideCard(card.id);
                        if (first.ok) await actions.yellowCard();
                        return first;
                      })
                    }
                  >
                    Remove this card from our deck
                  </button>
                )
              }
            >
              <Button
                size="lg"
                className="bg-[#8fb08f] text-[#0f1a10] hover:bg-[#a3c2a3]"
                disabled={busy}
                onClick={() => run(() => actions.finishCard())}
              >
                Done
              </Button>
              {myCard && (
                <Button
                  size="lg"
                  variant="outline"
                  className="border-gold/60 text-gold"
                  disabled={busy || session.skips[me] <= 0}
                  onClick={() => run(() => actions.skipCard())}
                >
                  {session.cardFor === "sub" && isSnakes ? "Veto" : "Skip"} ({session.skips[me]}{" "}
                  {session.skips[me] === 1 ? "skip" : "skips"} left)
                </Button>
              )}
            </PlayCard>
          )}
        </div>

        {session.lastBox && !session.boxPending && !(card && session.cardFor === "sub") && (
          <Note>Last Surprise Box: {session.lastBox.title}</Note>
        )}
      </div>
    );
  }

  return (
    <AppShell title="Games" eyebrow="Together" allowDuringPause>
      <div className="space-y-6">
        {body}
        {playing && session && (
          <SafetyBar
            busy={busy}
            canYellow={!!session.currentCard}
            onYellow={() => run(() => actions.yellowCard())}
            onRed={() => run(() => actions.redGame())}
            skipsNote={`Free skips: you ${session.skips[me]}, ${names[other]} ${session.skips[other]}`}
          />
        )}
      </div>
    </AppShell>
  );
}
