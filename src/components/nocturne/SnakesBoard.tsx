import { CARD_SQUARES, LADDERS, SNAKES, squareCell } from "@/lib/nocturne/games/board";
import type { GameSession } from "@/lib/nocturne/games/types";

const centre = (n: number): [number, number] => {
  const { row, col } = squareCell(Math.max(1, n));
  return [col * 10 + 5, row * 10 + 5];
};

function Ladder({ from, to }: { from: number; to: number }) {
  const [x1, y1] = centre(from),
    [x2, y2] = centre(to);
  const len = Math.hypot(x2 - x1, y2 - y1),
    nx = -(y2 - y1) / len,
    ny = (x2 - x1) / len;
  const rungs = Math.max(2, Math.floor(len / 6));
  return (
    <g stroke="#c9a45c" strokeWidth="0.7" strokeLinecap="round" opacity="0.9">
      <line x1={x1 + nx * 1.4} y1={y1 + ny * 1.4} x2={x2 + nx * 1.4} y2={y2 + ny * 1.4} />
      <line x1={x1 - nx * 1.4} y1={y1 - ny * 1.4} x2={x2 - nx * 1.4} y2={y2 - ny * 1.4} />
      {Array.from({ length: rungs }, (_, i) => {
        const t = (i + 0.5) / rungs,
          cx = x1 + (x2 - x1) * t,
          cy = y1 + (y2 - y1) * t;
        return (
          <line
            key={i}
            strokeWidth="0.5"
            x1={cx + nx * 1.4}
            y1={cy + ny * 1.4}
            x2={cx - nx * 1.4}
            y2={cy - ny * 1.4}
          />
        );
      })}
    </g>
  );
}

function Snake({ from, to }: { from: number; to: number }) {
  const [x1, y1] = centre(from),
    [x2, y2] = centre(to);
  const mx = (x1 + x2) / 2,
    my = (y1 + y2) / 2,
    len = Math.hypot(x2 - x1, y2 - y1),
    nx = -(y2 - y1) / len,
    ny = (x2 - x1) / len,
    bend = Math.min(9, len / 4);
  const d = `M${x1} ${y1} C${x1 + nx * bend + (mx - x1) * 0.4} ${y1 + ny * bend + (my - y1) * 0.4}, ${mx - nx * bend} ${my - ny * bend}, ${x2} ${y2}`;
  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke="#be263e"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.92"
      />
      <circle cx={x1} cy={y1} r="2" fill="#be263e" stroke="#f0e6d6" strokeWidth="0.4" />
      <circle cx={x1 - 0.6} cy={y1 - 0.5} r="0.35" fill="#f0e6d6" />
      <circle cx={x1 + 0.6} cy={y1 - 0.5} r="0.35" fill="#f0e6d6" />
    </g>
  );
}

export function SnakesBoard({
  session,
  names,
}: {
  session: GameSession;
  names: Record<"dom" | "sub", string>;
}) {
  const pos = session.positions ?? { dom: 0, sub: 0 };
  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label={`Snakes and Ladders board. ${names.dom} is on square ${pos.dom}, ${names.sub} is on square ${pos.sub}.`}
      className="mx-auto w-full max-w-[28rem] rounded-md border border-gold/50"
    >
      {Array.from({ length: 100 }, (_, i) => {
        const n = i + 1,
          { row, col } = squareCell(n),
          card = CARD_SQUARES.includes(n);
        return (
          <g key={n}>
            <rect
              x={col * 10}
              y={row * 10}
              width="10"
              height="10"
              fill={card ? "#3a1a22" : (row + col) % 2 ? "#1a0a10" : "#240f17"}
              stroke="#3d2a1c"
              strokeWidth="0.25"
            />
            <text
              x={col * 10 + 1}
              y={row * 10 + 3}
              fontSize="2.4"
              fill={card ? "#c9a45c" : "#8a7a6a"}
            >
              {n}
            </text>
            {card && (
              <text
                x={col * 10 + 5}
                y={row * 10 + 8}
                fontSize="3.4"
                fill="#c9a45c"
                textAnchor="middle"
              >
                ◆
              </text>
            )}
          </g>
        );
      })}
      {Object.entries(LADDERS).map(([a, b]) => (
        <Ladder key={a} from={Number(a)} to={b} />
      ))}
      {Object.entries(SNAKES).map(([a, b]) => (
        <Snake key={a} from={Number(a)} to={b} />
      ))}
      {(["dom", "sub"] as const).map((role) => {
        const [x, y] = pos[role] === 0 ? [role === "dom" ? 3 : 7, 99] : centre(pos[role]);
        const dx = pos[role] === 0 ? 0 : role === "dom" ? -1.6 : 1.6;
        return (
          <g key={role}>
            <circle
              cx={x + dx}
              cy={y + 1}
              r="2.6"
              fill={role === "dom" ? "#c9a45c" : "#e0566e"}
              stroke="#0a0507"
              strokeWidth="0.6"
            />
            <text
              x={x + dx}
              y={y + 2.1}
              fontSize="2.8"
              textAnchor="middle"
              fill="#0a0507"
              fontWeight="bold"
            >
              {names[role].slice(0, 1).toUpperCase()}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
