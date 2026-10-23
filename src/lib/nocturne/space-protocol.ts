import type { AppState } from "./types";

export interface SpaceSnapshot {
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

export function invitationLink(origin: string, token: string): string {
  return `${origin}/#invite=${token}`;
}
