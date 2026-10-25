import { useState } from "react";
import { CARD_SQUARES, LADDERS, SNAKES, squareCell } from "@/lib/nocturne/games/board";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  WHEEL_SLICES,
  type GameId,
  type GameSession,
} from "@/lib/nocturne/games/types";
import type { Role } from "@/lib/nocturne/types";
import { ROLE_COLOR } from "./theme";

/* ---------- Dice ---------- */

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

export function Die({
  value,
  label,
  caption,
  rollKey,
}: {
  value: number | null;
  label: string;
  caption?: string | undefined;
  rollKey: string;
}) {
  return (
    <figure className="flex flex-col items-center gap-3">
      <div
        key={rollKey}
        role="img"
        aria-label={value ? `${label}: ${value}` : `${label}: not rolled yet`}
        className={`grid h-24 w-24 grid-cols-3 grid-rows-3 gap-1 rounded-2xl bg-[linear-gradient(145deg,#f6ecdc,#d9c8ad)] p-3.5 shadow-[inset_0_-6px_0_rgba(0,0,0,0.18),0_14px_30px_-12px_rgba(0,0,0,0.9)] sm:h-28 sm:w-28 ${value ? "games-tumble" : "opacity-50"}`}
      >
        {Array.from({ length: 9 }, (_, i) => (
          <span
            key={i}
            className={`m-auto h-3.5 w-3.5 rounded-full sm:h-4 sm:w-4 ${value && PIPS[value]?.includes(i) ? "bg-[#2a0f18] shadow-[inset_0_2px_2px_rgba(0,0,0,0.6)]" : ""}`}
          />
        ))}
      </div>
      <figcaption className="text-center">
        <span className="block text-sm text-muted-foreground">{label}</span>
        <span className="block font-display text-lg text-ivory">{caption ?? "—"}</span>
      </figcaption>
    </figure>
  );
}

export function DiceStage({ session }: { session: GameSession }) {
  const roll = session.lastRoll ?? null;
  const key = `${session.seen.length}-${roll?.die1 ?? 0}-${roll?.die2 ?? 0}`;
  return (
    <div className="flex justify-center gap-10 py-2 sm:gap-16">
      <Die
        value={roll?.die1 ?? null}
        label="Category"
        caption={roll ? CATEGORY_LABEL[CATEGORIES[roll.die1 - 1]!] : undefined}
        rollKey={`a${key}`}
      />
      <Die
        value={roll?.die2 ?? null}
        label="Minutes"
        caption={roll ? `${roll.die2} min` : undefined}
        rollKey={`b${key}`}
      />
    </div>
  );
}

/* ---------- Wheel ---------- */

const sliceLabel = (slice: (typeof WHEEL_SLICES)[number]) =>
  slice === "again" ? "Spin again" : slice === "choice" ? "Your choice" : CATEGORY_LABEL[slice];
const SLICE_FILL = [
  "#6b1628",
  "#3b0c18",
  "#7d2034",
  "#33270f",
  "#55121f",
  "#8a6a2c",
  "#33270f",
  "#460f1c",
];

function polar(angle: number, radius: number): [number, number] {
  const rad = ((angle - 90) * Math.PI) / 180;
  return [100 + radius * Math.cos(rad), 100 + radius * Math.sin(rad)];
}

export function WheelStage({ session }: { session: GameSession }) {
  const slice = session.lastSpin?.slice ?? null;
  // Each spin adds whole turns, so the wheel always spins forward.
  const turns = 5 + session.seen.length * 3;
  const rotation = slice === null ? 0 : turns * 360 - (slice + 0.5) * 45;
  return (
    <div
      role="img"
      aria-label={
        slice === null
          ? "The wheel, not spun yet"
          : `The wheel landed on ${sliceLabel(WHEEL_SLICES[slice]!)}`
      }
      className="relative mx-auto w-full max-w-[19rem] py-2"
    >
      <svg viewBox="0 0 40 30" className="absolute left-1/2 top-0 z-10 w-8 -translate-x-1/2">
        <path d="M4 2 H36 L20 28 Z" fill="#c9a45c" stroke="#14080c" strokeWidth="2" />
      </svg>
      <div className="rounded-full p-1.5 shadow-[0_0_60px_-10px_rgba(201,164,92,0.35)]">
        <svg
          viewBox="0 0 200 200"
          className="w-full transition-transform duration-[3000ms] ease-[cubic-bezier(0.15,0.85,0.25,1)] motion-reduce:transition-none"
          style={{ transform: `rotate(${rotation}deg)` }}
        >
          <circle cx="100" cy="100" r="99" fill="#c9a45c" />
          <circle cx="100" cy="100" r="95" fill="#14080c" />
          {WHEEL_SLICES.map((name, i) => {
            const [x1, y1] = polar(i * 45, 93),
              [x2, y2] = polar((i + 1) * 45, 93),
              mid = (i + 0.5) * 45,
              [tx, ty] = polar(mid, 60),
              upright = mid > 90 && mid < 270 ? mid + 90 : mid - 90,
              special = name === "again" || name === "choice";
            return (
              <g key={name}>
                <path
                  d={`M100 100 L${x1} ${y1} A93 93 0 0 1 ${x2} ${y2} Z`}
                  fill={SLICE_FILL[i]}
                  stroke="#c9a45c"
                  strokeOpacity="0.6"
                  strokeWidth="0.8"
                />
                <text
                  x={tx}
                  y={ty}
                  fill={special ? "#e8cf8f" : "#f0e6d6"}
                  fontSize="8.5"
                  fontStyle={special ? "italic" : "normal"}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={`rotate(${upright} ${tx} ${ty})`}
                >
                  {sliceLabel(name)}
                </text>
              </g>
            );
          })}
          {Array.from({ length: 16 }, (_, i) => {
            const [px, py] = polar(i * 22.5, 96.5);
            return <circle key={i} cx={px} cy={py} r="1.5" fill="#f6e3b0" />;
          })}
          <circle cx="100" cy="100" r="15" fill="#14080c" stroke="#c9a45c" strokeWidth="2" />
          <circle cx="100" cy="100" r="5" fill="#c9a45c" />
        </svg>
      </div>
    </div>
  );
}

/* ---------- Snakes & Ladders board ---------- */

const CELL = 10,
  GAP = 0.5;
const centre = (n: number): [number, number] => {
  const { row, col } = squareCell(Math.max(1, n));
  return [col * CELL + CELL / 2, row * CELL + CELL / 2];
};
const SNAKE_COLOURS = ["#c2324a", "#7a3a6e", "#c56a2c", "#9c1f35"];

function Ladder({ from, to }: { from: number; to: number }) {
  const [x1, y1] = centre(from),
    [x2, y2] = centre(to);
  const len = Math.hypot(x2 - x1, y2 - y1),
    ux = (x2 - x1) / len,
    uy = (y2 - y1) / len,
    nx = -uy * 1.5,
    ny = ux * 1.5;
  const rungs = Math.floor(len / 3.2);
  return (
    <g strokeLinecap="round">
      {[1, -1].map((side) => (
        <line
          key={side}
          x1={x1 + nx * side}
          y1={y1 + ny * side}
          x2={x2 + nx * side}
          y2={y2 + ny * side}
          stroke="#14080c"
          strokeWidth="1.5"
        />
      ))}
      {[1, -1].map((side) => (
        <line
          key={`r${side}`}
          x1={x1 + nx * side}
          y1={y1 + ny * side}
          x2={x2 + nx * side}
          y2={y2 + ny * side}
          stroke="#d9b56a"
          strokeWidth="0.8"
        />
      ))}
      {Array.from({ length: rungs }, (_, i) => {
        const t = (i + 0.5) / rungs,
          cx = x1 + (x2 - x1) * t,
          cy = y1 + (y2 - y1) * t;
        return (
          <line
            key={i}
            x1={cx + nx}
            y1={cy + ny}
            x2={cx - nx}
            y2={cy - ny}
            stroke="#d9b56a"
            strokeWidth="0.6"
          />
        );
      })}
    </g>
  );
}

function Snake({ from, to, colour }: { from: number; to: number; colour: string }) {
  const [x1, y1] = centre(from),
    [x2, y2] = centre(to);
  const len = Math.hypot(x2 - x1, y2 - y1),
    nx = -(y2 - y1) / len,
    ny = (x2 - x1) / len,
    waves = Math.max(1, Math.round(len / 18)),
    amp = Math.min(3, len / 10);
  const points = Array.from({ length: 41 }, (_, i) => {
    const t = i / 40,
      w = Math.sin(t * Math.PI * 2 * waves) * amp * (1 - t * 0.6);
    return [x1 + (x2 - x1) * t + nx * w, y1 + (y2 - y1) * t + ny * w] as const;
  });
  // Tapered body: thick behind the head, thin at the tail.
  return (
    <g>
      {points.slice(1).map(([x, y], i) => {
        const [px, py] = points[i]!;
        const width = 2.4 - (i / 40) * 1.7;
        return (
          <line
            key={i}
            x1={px}
            y1={py}
            x2={x}
            y2={y}
            stroke={colour}
            strokeWidth={width}
            strokeLinecap="round"
          />
        );
      })}
      <ellipse cx={x1} cy={y1} rx="2.3" ry="2" fill={colour} stroke="#14080c" strokeWidth="0.4" />
      <circle cx={x1 - 0.8} cy={y1 - 0.5} r="0.55" fill="#fff6ea" />
      <circle cx={x1 + 0.8} cy={y1 - 0.5} r="0.55" fill="#fff6ea" />
      <circle cx={x1 - 0.8} cy={y1 - 0.45} r="0.25" fill="#14080c" />
      <circle cx={x1 + 0.8} cy={y1 - 0.45} r="0.25" fill="#14080c" />
    </g>
  );
}

export function BoardStage({
  session,
  names,
}: {
  session: GameSession;
  names: Record<Role, string>;
}) {
  const pos = session.positions ?? { dom: 0, sub: 0 };
  const last = session.lastMove;
  return (
    <figure className="mx-auto w-full max-w-[34rem]">
      <svg
        viewBox="-1 -1 102 102"
        role="img"
        aria-label={`Board. ${names.dom} is on square ${pos.dom || "start"}, ${names.sub} is on square ${pos.sub || "start"}.`}
        className="w-full"
      >
        {Array.from({ length: 100 }, (_, i) => {
          const n = i + 1,
            { row, col } = squareCell(n),
            task = CARD_SQUARES.includes(n),
            finish = n === 100,
            landed = last && last.to === n;
          return (
            <g key={n}>
              <rect
                x={col * CELL + GAP}
                y={row * CELL + GAP}
                width={CELL - GAP * 2}
                height={CELL - GAP * 2}
                rx="1.3"
                fill={
                  finish ? "#7a1a2e" : task ? "#4a3816" : (row + col) % 2 ? "#1d0d13" : "#24111a"
                }
                stroke={landed ? "#e8cf8f" : "transparent"}
                strokeWidth="0.5"
              />
              <text
                x={col * CELL + 1.6}
                y={row * CELL + 3.3}
                fontSize="2.3"
                fill={finish ? "#ffd9de" : task ? "#e8cf8f" : "#8c7b6c"}
              >
                {n}
              </text>
              {(task || finish) && (
                <text
                  x={col * CELL + CELL / 2}
                  y={row * CELL + 7.6}
                  fontSize="1.9"
                  textAnchor="middle"
                  fill={finish ? "#ffd9de" : "#e8cf8f"}
                >
                  {finish ? "finish" : "task"}
                </text>
              )}
            </g>
          );
        })}
        {Object.entries(LADDERS).map(([a, b]) => (
          <Ladder key={a} from={Number(a)} to={b} />
        ))}
        {Object.entries(SNAKES).map(([a, b], i) => (
          <Snake
            key={a}
            from={Number(a)}
            to={b}
            colour={SNAKE_COLOURS[i % SNAKE_COLOURS.length]!}
          />
        ))}
        {(["dom", "sub"] as const).map((role) => {
          const [x, y] = pos[role] === 0 ? [role === "dom" ? 3.5 : 7, 104] : centre(pos[role]);
          const share = pos.dom === pos.sub && pos[role] !== 0;
          const dx = share ? (role === "dom" ? -1.8 : 1.8) : 0;
          return (
            <g
              key={role}
              className="transition-transform duration-700 ease-out motion-reduce:transition-none"
              style={{ transform: `translate(${x + dx}px, ${y + 0.8}px)` }}
            >
              <circle r="3" fill="#14080c" opacity="0.5" cy="0.5" />
              <circle r="2.7" fill={ROLE_COLOR[role]} stroke="#14080c" strokeWidth="0.6" />
              <text y="1" fontSize="2.9" textAnchor="middle" fill="#14080c" fontWeight="700">
                {names[role].slice(0, 1).toUpperCase()}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span>
          <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-[#4a3816] align-middle" />
          Task square: draw a card
        </span>
        <span>Ladder: climb, +2 game points</span>
        <span>Snake: slide down</span>
      </figcaption>
    </figure>
  );
}

/* ---------- Surprise Box ---------- */

export function GiftBox({ opening, dim }: { opening: boolean; dim?: boolean }) {
  return (
    <svg viewBox="0 0 200 170" className={`mx-auto w-48 ${dim ? "opacity-70" : ""}`} aria-hidden>
      <defs>
        <radialGradient id="gift-glow" cx="50%" cy="55%" r="50%">
          <stop offset="0%" stopColor="#c9a45c" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#c9a45c" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="100" cy="95" rx="95" ry="70" fill="url(#gift-glow)" className="games-glow" />
      {[
        [28, 40],
        [172, 52],
        [150, 18],
        [40, 112],
      ].map(([x, y], i) => (
        <path
          key={i}
          d={`M${x} ${y! - 7} L${x! + 2} ${y! - 2} L${x! + 7} ${y} L${x! + 2} ${y! + 2} L${x} ${y! + 7} L${x! - 2} ${y! + 2} L${x! - 7} ${y} L${x! - 2} ${y! - 2} Z`}
          fill="#f2d9a0"
        />
      ))}
      <rect x="52" y="78" width="96" height="74" rx="6" fill="#6e1424" />
      <rect x="92" y="78" width="16" height="74" fill="#c9a45c" />
      <g className={opening ? "games-lid" : ""}>
        <rect x="44" y="60" width="112" height="22" rx="5" fill="#8c1c30" />
        <rect x="92" y="60" width="16" height="22" fill="#d9b56a" />
        <ellipse cx="86" cy="52" rx="14" ry="9" fill="none" stroke="#d9b56a" strokeWidth="6" />
        <ellipse cx="114" cy="52" rx="14" ry="9" fill="none" stroke="#d9b56a" strokeWidth="6" />
        <circle cx="100" cy="56" r="6" fill="#d9b56a" />
      </g>
    </svg>
  );
}

export function SurpriseBoxPanel({
  isSub,
  names,
  busy,
  onOpen,
}: {
  isSub: boolean;
  names: Record<Role, string>;
  busy: boolean;
  onOpen: () => void;
}) {
  const [opening, setOpening] = useState(false);
  return (
    <section
      aria-label="Surprise Box"
      className="games-deal rounded-xl border-2 border-[#c2324a] bg-[linear-gradient(160deg,#2c0c16,#14070c)] p-5 text-center"
    >
      <h3 className="text-2xl text-ivory">Surprise Box</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {isSub ? "It's yours to open." : `Waiting for ${names.sub} to open it.`}
      </p>
      {isSub ? (
        <button
          type="button"
          disabled={busy || opening}
          onClick={() => {
            setOpening(true);
            window.setTimeout(onOpen, 450);
          }}
          className="mt-2 block w-full rounded-lg focus-visible:outline-offset-4"
          aria-label="Open the Surprise Box"
        >
          <GiftBox opening={opening} />
          <span className="mt-1 block text-sm text-gold">Tap the box to open it</span>
        </button>
      ) : (
        <div className="mt-2">
          <GiftBox opening={false} dim />
        </div>
      )}
      <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs">
        <span className="rounded-full border border-gold/50 px-2.5 py-1 text-gold">Task</span>
        <span className="rounded-full border border-[#e0485c]/70 px-2.5 py-1 text-[#ff9aa8]">
          Gentle punishment
        </span>
        <span className="rounded-full border border-[#d4843a]/70 px-2.5 py-1 text-[#e09a55]">
          Point deduction
        </span>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {names.sub} can veto what comes out with a free skip. Deductions only touch the game score.
      </p>
    </section>
  );
}

/* ---------- Game picker art ---------- */

export function GameArt({ game }: { game: GameId }) {
  if (game === "dice")
    return (
      <svg viewBox="0 0 80 48" className="h-12 w-20" aria-hidden>
        <rect
          x="8"
          y="8"
          width="30"
          height="30"
          rx="6"
          fill="#efe2cc"
          transform="rotate(-10 23 23)"
        />
        <rect
          x="42"
          y="12"
          width="30"
          height="30"
          rx="6"
          fill="#efe2cc"
          transform="rotate(8 57 27)"
        />
        {[
          [17, 16],
          [29, 28],
          [23, 22],
          [51, 20],
          [63, 34],
          [51, 34],
          [63, 20],
        ].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="2.6" fill="#2a0f18" />
        ))}
      </svg>
    );
  if (game === "wheel")
    return (
      <svg viewBox="0 0 48 48" className="h-12 w-12" aria-hidden>
        <circle cx="24" cy="24" r="22" fill="#c9a45c" />
        {Array.from({ length: 8 }, (_, i) => {
          const a1 = (i * 45 - 90) * (Math.PI / 180),
            a2 = ((i + 1) * 45 - 90) * (Math.PI / 180);
          return (
            <path
              key={i}
              d={`M24 24 L${24 + 20 * Math.cos(a1)} ${24 + 20 * Math.sin(a1)} A20 20 0 0 1 ${24 + 20 * Math.cos(a2)} ${24 + 20 * Math.sin(a2)} Z`}
              fill={i % 2 ? "#3b0c18" : "#7d2034"}
            />
          );
        })}
        <circle cx="24" cy="24" r="4" fill="#c9a45c" />
      </svg>
    );
  return (
    <svg viewBox="0 0 48 48" className="h-12 w-12" aria-hidden>
      {Array.from({ length: 16 }, (_, i) => (
        <rect
          key={i}
          x={(i % 4) * 12 + 0.5}
          y={Math.floor(i / 4) * 12 + 0.5}
          width="11"
          height="11"
          rx="2"
          fill={(i + Math.floor(i / 4)) % 2 ? "#24111a" : "#3a1a24"}
        />
      ))}
      <path d="M9 44 L9 6 M17 44 L17 6" stroke="#d9b56a" strokeWidth="2" />
      {[12, 20, 28, 36].map((y) => (
        <path key={y} d={`M9 ${y} H17`} stroke="#d9b56a" strokeWidth="1.6" />
      ))}
      <path
        d="M30 8 C 42 12, 22 22, 34 28 S 30 40, 40 44"
        fill="none"
        stroke="#c2324a"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <circle cx="30" cy="8" r="3.2" fill="#c2324a" />
    </svg>
  );
}
