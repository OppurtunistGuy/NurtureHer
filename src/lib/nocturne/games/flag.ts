/**
 * The Games section is off by default. It turns on only when the server environment sets
 * GAMES_ENABLED=1, so the existing routines, points and Telegram flows are unchanged otherwise.
 * An in-app switch in the owner's admin section can replace this later.
 */
export function gamesEnabled(env: Record<string, string | undefined>): boolean {
  return env["GAMES_ENABLED"] === "1";
}
