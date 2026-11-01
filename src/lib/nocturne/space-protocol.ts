import type { AppState } from "./types";

export interface SpaceSummary {
  id: string;
  role: "dom" | "sub";
  partnerName: string;
  paired: boolean;
  paused: boolean;
}

export interface SpaceSnapshot {
  /** Server switches the client may show. Absent means everything optional is off. */
  features?: { games: boolean };
  telegram: {
    configured: boolean;
    proofs: {
      id: string;
      routineId: string;
      date: string;
      status: string;
      masterConfirmed: boolean;
      subConfirmed: boolean;
      masterAnswer?: "yes" | "no" | null;
      subAnswer?: "yes" | "no" | null;
      mediaReceived: boolean;
    }[];
  };
  spaces: SpaceSummary[];
  state: AppState;
  revision: number;
  createdByMe: boolean;
  invite: { token: string; expiresAt: number } | null;
}

export function invitationToken(input: string): string {
  const value = input.trim();
  if (/^[a-f0-9]{64}$/.test(value)) return value;
  try {
    const link = new URL(value);
    const token = new URLSearchParams(link.hash.slice(1)).get("invite") ?? "";
    return /^[a-f0-9]{64}$/.test(token) ? token : "";
  } catch {
    return "";
  }
}

/** The address people should actually use. */
export const PUBLIC_ORIGIN = "https://boundsome.vercel.app";

/**
 * Invites made on a Vercel preview address (e.g. the UAT branch) sit behind Vercel's own
 * sign-in, so the person invited could not open them. Point those at the public address.
 * Local development and any other host keep the address they were made on.
 */
export function publicOrigin(origin: string): string {
  try {
    const { hostname } = new URL(origin);
    return hostname.endsWith(".vercel.app") ? PUBLIC_ORIGIN : origin;
  } catch {
    return origin;
  }
}

export function invitationLink(origin: string, token: string): string {
  return `${publicOrigin(origin)}/#invite=${token}`;
}
