import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { dealable } from "@/lib/nocturne/games/deck";
import { MIN_MATCHED, matchedIds } from "@/lib/nocturne/games/hand";
import { hardLimitsFromState } from "@/lib/nocturne/games/limits";
import { STARTER_DECK } from "@/lib/nocturne/games/starter-deck";
import {
  CATEGORY_LABEL,
  HAND_SIZES,
  HEAT_ORDER,
  NIGHT_LENGTHS,
  type GameCard,
  type GameSession,
  type ListAnswer,
  type Pace,
  type PlayedCard,
} from "@/lib/nocturne/games/types";
import { uiActions as actions, useNocturne } from "@/lib/nocturne/store";
import type { Role } from "@/lib/nocturne/types";
import { HeatChip, PlayCard, Token } from "./parts";
import { HEAT } from "./theme";

type Run = (action: () => Promise<{ ok: boolean }> | { ok: boolean }) => void;
type Names = Record<Role, string>;

const HEAT_BAR: Record<string, string> = { sweet: "#8fb08f", spicy: "#d4843a", hot: "#e0485c" };

/* ---------- Private yes / maybe / no list ---------- */

export function ListBuilder({ onClose }: { onClose: () => void }) {
  const s = useNocturne();
  const me = s.viewRole,
    other: Role = me === "dom" ? "sub" : "dom";
  const cards = useMemo(
    () =>
      dealable(STARTER_DECK, {
        heat: "hot",
        hardLimits: hardLimitsFromState(s),
        hidden: s.games?.hidden ?? [],
        notForMe: s.games?.notForMe ?? [],
      }).sort((a, b) => HEAT_ORDER.indexOf(a.heat) - HEAT_ORDER.indexOf(b.heat)),
    // The list of cards only changes when limits or hidden cards change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s.agreement, s.games?.hidden, s.games?.notForMe],
  );
  const saved = s.games?.lists?.[me] ?? {};
  const [answers, setAnswers] = useState<Record<string, ListAnswer>>(saved);
  const pending = useRef<Record<string, ListAnswer>>({});
  const [saving, setSaving] = useState(false);
  const firstOpen = cards.findIndex((c) => !saved[c.id]);
  const [index, setIndex] = useState(firstOpen === -1 ? 0 : firstOpen);

  async function flush() {
    const batch = pending.current;
    if (!Object.keys(batch).length) return true;
    pending.current = {};
    setSaving(true);
    const result = await actions.saveList(batch);
    setSaving(false);
    if (!result.ok) pending.current = { ...batch, ...pending.current };
    return result.ok;
  }
  // Save whatever is left when the list closes.
  useEffect(
    () => () => {
      if (Object.keys(pending.current).length) void actions.saveList(pending.current);
    },
    [],
  );

  function mark(answer: ListAnswer, ids: string[] = [cards[index]!.id]) {
    const update = Object.fromEntries(ids.map((id) => [id, answer]));
    setAnswers((a) => ({ ...a, ...update }));
    pending.current = { ...pending.current, ...update };
    if (Object.keys(pending.current).length >= 8) void flush();
    const next = cards.findIndex((c, i) => i > index && !answers[c.id] && !update[c.id]);
    setIndex(next === -1 ? Math.min(cards.length - 1, index + ids.length) : next);
  }

  const done = cards.filter((c) => answers[c.id]).length;
  const card = cards[index];
  const sweetLeft = cards.filter((c) => c.heat === "sweet" && !answers[c.id]).map((c) => c.id);
  return (
    <section aria-label="Your private list" className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl text-ivory sm:text-3xl">Your list</h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Mark each card. Only cards you both say yes or maybe to are dealt in Hand of Cards.{" "}
            {s.names[other]} never sees your answers.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={saving}
          onClick={async () => {
            if (await flush()) onClose();
          }}
        >
          Save and close
        </Button>
      </div>
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#2e1c18]">
          <div
            className="h-full rounded-full bg-gold transition-[width]"
            style={{ width: `${(done / Math.max(1, cards.length)) * 100}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {done} of {cards.length}
        </span>
      </div>
      {card && (
        <article
          key={card.id}
          aria-label="Card to mark"
          className="games-deal relative mx-auto max-w-md rounded-2xl border-2 border-gold/70 bg-[linear-gradient(160deg,#2c1019,#16080d)] p-6"
        >
          <div className="pointer-events-none absolute inset-1.5 rounded-xl border border-dashed border-gold/15" />
          <div className="relative flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {card.kind === "reward" ? "Reward" : "Task"} · {CATEGORY_LABEL[card.category]}
            </span>
            <HeatChip heat={card.heat} />
          </div>
          <p className="relative mt-8 min-h-[6.5rem] font-display text-[1.7rem] leading-tight text-ivory">
            {card.title}
          </p>
          <p className="relative mt-6 text-xs text-muted-foreground">
            {answers[card.id] ? `You said ${answers[card.id]}. ` : ""}If it's dealt, it's for{" "}
            {s.names.sub}.
          </p>
        </article>
      )}
      <div className="mx-auto grid max-w-md grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => mark("no")}
          className="rounded-xl border border-[#e0485c]/60 py-3 font-semibold text-[#ff9aa8]"
        >
          No
        </button>
        <button
          type="button"
          onClick={() => mark("maybe")}
          className="rounded-xl border border-[#d8b84a]/60 py-3 font-semibold text-[#e9cf6a]"
        >
          Maybe
        </button>
        <button
          type="button"
          onClick={() => mark("yes")}
          className="rounded-xl bg-[#8fb08f] py-3 font-semibold text-[#0f1a10]"
        >
          Yes
        </button>
      </div>
      <div className="mx-auto flex max-w-md flex-wrap justify-between gap-2 text-sm">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          className="text-muted-foreground underline underline-offset-4"
        >
          Previous card
        </button>
        {sweetLeft.length > 1 && card?.heat === "sweet" && (
          <button
            type="button"
            onClick={() => mark("yes", sweetLeft)}
            className="text-gold underline underline-offset-4"
          >
            Yes to the {sweetLeft.length} Sweet cards left
          </button>
        )}
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Cards that cross your hard limits are already gone. You can change any answer later.
      </p>
    </section>
  );
}

/* ---------- Set-up options shown in the game picker ---------- */

export function HandSetup({
  length,
  setLength,
  handSize,
  setHandSize,
  onOpenList,
}: {
  length: number;
  setLength: (n: number) => void;
  handSize: number;
  setHandSize: (n: number) => void;
  onOpenList: () => void;
}) {
  const s = useNocturne();
  const me = s.viewRole,
    other: Role = me === "dom" ? "sub" : "dom";
  // The server fills these in; on a device used alone (no server) work them out here.
  const lists = s.games?.lists;
  const matched = s.games?.matchedCount ?? matchedIds(lists).size;
  const counts = s.games?.listCounts ?? {
    dom: Object.keys(lists?.dom ?? {}).length,
    sub: Object.keys(lists?.sub ?? {}).length,
  };
  const ready = matched >= MIN_MATCHED;
  return (
    <section aria-label="Hand of Cards set-up" className="space-y-5">
      <div
        className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 ${ready ? "border-[#8fb08f]/60" : "border-border"}`}
      >
        <div>
          <p className="text-ivory">
            {ready
              ? "Your lists are ready"
              : counts[me]
                ? "Keep marking your list"
                : "Start with your private list"}
          </p>
          <p className="text-sm text-muted-foreground">
            You've marked {counts[me]}, {s.names[other]} has marked {counts[other]}.
            {ready ? "" : ` You need ${MIN_MATCHED} matches to start.`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-display text-2xl text-[#a9c9a9]">
            {matched} <span className="text-sm text-muted-foreground">matched</span>
          </span>
          <Button variant="outline" onClick={onOpenList}>
            {counts[me] ? "Review my list" : "Mark my list"}
          </Button>
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm text-muted-foreground">How long is tonight?</p>
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Cards tonight">
          {NIGHT_LENGTHS.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={length === n}
              onClick={() => setLength(n)}
              className={`rounded-xl border py-2.5 text-sm font-semibold ${length === n ? "border-gold bg-gold text-[#1a0d06]" : "border-border text-ivory"}`}
            >
              {n} cards
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm text-muted-foreground">Cards in the Master's hand</p>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Hand size">
          {HAND_SIZES.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={handSize === n}
              onClick={() => setHandSize(n)}
              className={`rounded-xl border py-2.5 text-sm font-semibold ${handSize === n ? "border-gold bg-gold text-[#1a0d06]" : "border-border text-ivory"}`}
            >
              {n} cards {n === 3 ? "· quicker" : "· more choice"}
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-border p-4">
        <p className="text-ivory">The last card is always aftercare</p>
        <p className="text-sm text-muted-foreground">
          {s.names.sub} holds 2 Mercy cards and 1 Counter. Between rounds you both check in, and the
          gentler answer wins. Heat only rises when you both say keep going.
        </p>
      </div>
    </section>
  );
}

/* ---------- Pieces of the table ---------- */

function Progress({ session }: { session: GameSession }) {
  const night = session.night!;
  const doneHeats = night.played.filter((p) => p.outcome !== "countered").map((p) => p.heat);
  return (
    <div
      className="flex items-center gap-1.5"
      aria-label={`Round ${night.round} of ${night.length}`}
    >
      {Array.from({ length: night.length + 1 }, (_, i) => {
        const last = i === night.length;
        const heat = doneHeats[i] ?? (i === night.round - 1 ? session.heat : null);
        return (
          <span
            key={i}
            className="h-1.5 flex-1 rounded-full"
            style={{
              background: last
                ? night.phase === "aftercare"
                  ? "#efe2cc"
                  : "#3a3426"
                : heat
                  ? HEAT_BAR[heat]
                  : "#2e1c18",
              opacity: !last && i === night.round - 1 && night.phase !== "aftercare" ? 1 : 0.9,
            }}
          />
        );
      })}
    </div>
  );
}

function CardBack({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`relative block rounded-lg border-2 border-gold/60 bg-[repeating-linear-gradient(45deg,#3a0c18_0_6px,#2a0811_6px_12px)] ${className}`}
    >
      <span className="absolute inset-1 rounded border border-gold/30" />
    </span>
  );
}

function Fan({
  hand,
  selected,
  onSelect,
}: {
  hand: GameCard[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const mid = (hand.length - 1) / 2;
  return (
    <div role="radiogroup" aria-label="Your hand" className="flex justify-center px-2 pb-2 pt-6">
      {hand.map((card, i) => {
        const on = selected === card.id;
        const tilt = (i - mid) * (hand.length > 3 ? 6 : 9);
        return (
          <button
            key={card.id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={card.title}
            onClick={() => onSelect(card.id)}
            className={`relative flex aspect-[3/4] w-[34%] max-w-[10.5rem] shrink-0 flex-col justify-between rounded-xl border-2 bg-[linear-gradient(160deg,#2c1019,#16080d)] p-2.5 text-left shadow-[0_18px_30px_-14px_#000] transition-transform duration-300 motion-reduce:transition-none sm:p-3 ${i ? "-ml-[9%]" : ""} ${on ? "z-10 border-[#e8cf8f] ring-2 ring-gold/50" : "border-gold/60"}`}
            style={{
              transform: `rotate(${on ? 0 : tilt}deg) translateY(${on ? -18 : Math.abs(i - mid) * 7}px)`,
            }}
          >
            <span className="flex items-center justify-between gap-1">
              <span className="rounded bg-gold/15 px-1.5 py-0.5 text-[0.65rem] font-semibold text-gold">
                {card.kind === "reward" ? "Reward" : "Task"}
              </span>
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: HEAT_BAR[card.heat] }}
                aria-label={HEAT[card.heat].label}
              />
            </span>
            <span className="font-display text-[0.92rem] leading-snug text-ivory sm:text-base">
              {card.title}
            </span>
            <span className="text-[0.65rem] text-muted-foreground">
              {CATEGORY_LABEL[card.category]}
              {card.timerMinutes ? ` · ${card.timerMinutes} min` : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const PACES: { pace: Pace; title: string; line: (next: string) => string }[] = [
  { pace: "up", title: "Keep going", line: (n) => `Next round warms up${n ? ` to ${n}` : ""}` },
  { pace: "stay", title: "Stay here", line: () => "Another round at this heat" },
  { pace: "down", title: "Slow down", line: (n) => `Back to a gentler level${n ? `: ${n}` : ""}` },
  { pace: "end", title: "That's enough tonight", line: () => "Go to the aftercare card" },
];

export function Recap({ played }: { played: PlayedCard[] }) {
  if (!played.length) return null;
  const label: Record<PlayedCard["outcome"], string> = {
    done: "done",
    mercy: "Mercy",
    countered: "countered",
    yellow: "YELLOW",
  };
  return (
    <div>
      <p className="mb-2 text-sm text-muted-foreground">Tonight, just for you two</p>
      <ul className="divide-y divide-border rounded-xl border border-border px-4">
        {played.map((p, i) => (
          <li key={i} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span className="text-ivory">{p.title}</span>
            <span className="shrink-0 text-xs" style={{ color: HEAT_BAR[p.heat] }}>
              {label[p.outcome]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- The table ---------- */

export function HandTable({
  session,
  names,
  me,
  busy,
  run,
}: {
  session: GameSession;
  names: Names;
  me: Role;
  busy: boolean;
  run: Run;
}) {
  const night = session.night!;
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => setSelected(null), [night.round, night.phase]);
  const card = session.currentCard;
  const isMaster = me === "dom";
  const level = HEAT_ORDER.indexOf(session.heat);
  const up = HEAT_ORDER[level + 1],
    down = HEAT_ORDER[level - 1];

  let main: React.ReactNode;
  if (night.phase === "choose") {
    main = isMaster ? (
      <div className="space-y-3">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-[#1a0b11] px-4 py-3">
          <Token role="sub" name={names.sub} />
          <div>
            <p className="text-ivory">{names.sub} is waiting</p>
            <p className="text-sm text-muted-foreground">
              She holds {session.skips.sub} Mercy and {night.counter} Counter
            </p>
          </div>
        </div>
        <p className="pt-2 text-center font-display text-xl text-ivory">Pick one card to play</p>
        <Fan hand={night.hand} selected={selected} onSelect={setSelected} />
        <Button
          size="lg"
          className="w-full"
          disabled={busy || !selected}
          onClick={() => selected && run(() => actions.playCard(selected))}
        >
          {selected ? "Play this card" : "Tap a card to choose it"}
        </Button>
      </div>
    ) : (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-[#1a0b11] px-4 py-8 text-center">
        <div className="flex">
          {Array.from({ length: night.handCount ?? 3 }, (_, i) => (
            <CardBack key={i} className={`h-24 w-[4.5rem] ${i ? "-ml-6" : ""}`} />
          ))}
        </div>
        <p className="font-display text-xl text-ivory">{names.dom} is choosing a card for you</p>
        <p className="text-sm text-muted-foreground">
          You hold {session.skips.sub} Mercy and {night.counter} Counter.
        </p>
      </div>
    );
  } else if (night.phase === "play" && card) {
    main = (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Token role="dom" name={names.dom} size={28} />
          <p className="text-sm text-muted-foreground">
            {isMaster ? "You played this card" : `${names.dom} played a card`}
          </p>
        </div>
        <PlayCard card={card} forName={isMaster ? names.sub : "you"}>
          <Button
            size="lg"
            className="bg-[#8fb08f] text-[#0f1a10] hover:bg-[#a3c2a3]"
            disabled={busy}
            onClick={() => run(() => actions.finishCard())}
          >
            Done
          </Button>
        </PlayCard>
        {isMaster ? (
          <p className="text-sm text-muted-foreground">
            {names.sub} can answer with Mercy ({session.skips.sub} left) or Counter ({night.counter}{" "}
            left).
          </p>
        ) : (
          <div>
            <p className="mb-2 text-sm text-muted-foreground">Your power cards</p>
            <div className="flex flex-wrap items-stretch gap-3">
              <button
                type="button"
                disabled={busy || session.skips.sub <= 0}
                onClick={() => run(() => actions.skipCard())}
                className="flex h-36 w-28 flex-col justify-between rounded-xl border-2 border-[#8fb08f] bg-[linear-gradient(160deg,#1d2a1d,#0f170f)] p-3 text-left text-[#a9c9a9]"
              >
                <span className="font-display text-lg font-semibold">Mercy</span>
                <span className="text-xs leading-snug">Skip this card</span>
                <span className="text-xs">{session.skips.sub} left</span>
              </button>
              <button
                type="button"
                disabled={busy || night.counter <= 0 || (night.handCount ?? 0) === 0}
                onClick={() => run(() => actions.counterCard())}
                className="flex h-36 w-28 flex-col justify-between rounded-xl border-2 border-[#d8b84a] bg-[linear-gradient(160deg,#2c2310,#171207)] p-3 text-left text-[#e9cf6a]"
              >
                <span className="font-display text-lg font-semibold">Counter</span>
                <span className="text-xs leading-snug">Swap for another card in his hand</span>
                <span className="text-xs">{night.counter} left</span>
              </button>
              <p className="max-w-[12rem] self-center text-xs text-muted-foreground">
                Using one never costs points.
              </p>
            </div>
          </div>
        )}
      </div>
    );
  } else if (night.phase === "checkin") {
    const mine = night.checkin[me];
    const otherRole: Role = isMaster ? "sub" : "dom";
    const theirs = night.answered?.[otherRole];
    main = (
      <section aria-label="Check-in" className="space-y-3">
        <h3 className="text-2xl text-ivory sm:text-3xl">Round {night.round} done. How are you?</h3>
        <p className="text-sm text-muted-foreground">
          You each answer on your own. The gentler answer is the one that counts.
        </p>
        <div className="space-y-2" role="radiogroup" aria-label="How to go on">
          {PACES.map(({ pace, title, line }) => {
            const on = mine === pace;
            const next = pace === "up" ? up : pace === "down" ? down : undefined;
            const blocked = (pace === "up" && !up) || (pace === "down" && !down);
            return (
              <button
                key={pace}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={busy || !!mine}
                onClick={() => run(() => actions.checkIn(pace))}
                className={`block w-full rounded-xl border px-4 py-3 text-left transition-colors ${on ? "border-gold bg-gold/10" : "border-border hover:border-gold/40"}`}
              >
                <span className="block font-display text-lg text-ivory">{title}</span>
                <span className="text-sm text-muted-foreground">
                  {blocked
                    ? pace === "up"
                      ? "Already at the hottest level, so this stays here"
                      : "Already at the gentlest level"
                    : line(next ? HEAT[next].label : "")}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
          <Token role={otherRole} name={names[otherRole]} size={28} />
          <span className="flex-1 text-sm text-muted-foreground">
            {theirs ? `${names[otherRole]} has answered` : `Waiting for ${names[otherRole]}`}
          </span>
          {theirs && !mine && <span className="text-xs text-gold">hidden until you pick</span>}
        </div>
      </section>
    );
  } else if (night.phase === "aftercare" && card) {
    main = (
      <div className="space-y-5">
        <PlayCard card={card} forName="both of you" aftercare>
          <Button
            size="lg"
            className="bg-[#efe2cc] text-[#1a120c] hover:bg-white"
            disabled={busy}
            onClick={() => run(() => actions.finishCard())}
          >
            We're done
          </Button>
        </PlayCard>
        <p className="text-sm text-muted-foreground">Say one thing you liked tonight.</p>
        <Recap played={night.played} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-xl text-ivory">
          {night.phase === "aftercare"
            ? "The last card: aftercare"
            : `Round ${night.round} of ${night.length}`}
        </h3>
        {night.phase !== "aftercare" && <HeatChip heat={session.heat} />}
      </div>
      <Progress session={session} />
      {main}
    </div>
  );
}
