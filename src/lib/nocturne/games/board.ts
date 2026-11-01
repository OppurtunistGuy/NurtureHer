import type { Role } from "../types";

/** The standard 10x10 board. Squares 1 to 100, token starts off the board at 0. */
export const BOARD_SIZE = 100;
export const LADDERS: Record<number, number> = {
  4: 14,
  9: 31,
  20: 38,
  28: 84,
  40: 59,
  51: 67,
  63: 81,
  71: 91,
};
export const SNAKES: Record<number, number> = {
  17: 7,
  54: 34,
  62: 19,
  64: 60,
  87: 24,
  93: 73,
  95: 75,
  99: 78,
};

const used = new Set([
  ...Object.keys(LADDERS).map(Number),
  ...Object.values(LADDERS),
  ...Object.keys(SNAKES).map(Number),
  ...Object.values(SNAKES),
]);
/** Obstacle squares: land here and a task card is dealt. Every 5th square that isn't a snake or ladder end. */
export const CARD_SQUARES: number[] = Array.from({ length: 19 }, (_, i) => (i + 1) * 5).filter(
  (n) => n < BOARD_SIZE && !used.has(n),
);

/** Row 0 is the top. Rows alternate direction, like a printed board. */
export function squareCell(n: number): { row: number; col: number } {
  const index = n - 1;
  const rowFromBottom = Math.floor(index / 10);
  const within = index % 10;
  return { row: 9 - rowFromBottom, col: rowFromBottom % 2 === 0 ? within : 9 - within };
}

export type SnakesStart = Record<Role, number>;
export const START_POSITIONS: SnakesStart = { dom: 0, sub: 0 };
export const LADDER_POINTS = 2;
export const SNAKE_BITE_POINTS = 5;
