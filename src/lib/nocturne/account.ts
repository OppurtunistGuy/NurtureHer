// Browser-side view of who is signed in. The server decides; this only mirrors its answer.
import { useSyncExternalStore } from "react";
import { leaveSharedSession, restoreSharedSpace } from "./store";

export type Account = { id: string; email: string; name: string };
export type AccountState = {
  status: "checking" | "signedOut" | "signedIn" | "offline";
  account: Account | null;
  legacySpaces: number;
  /** Only the owner sees the page for access links and feedback. The server checks too. */
  owner?: boolean;
  features?: { ai: boolean; inviteOnly: boolean };
};
type Result = { ok: true } | { ok: false; error: string };

const initial: AccountState = { status: "checking", account: null, legacySpaces: 0 };
let current = initial,
  loading: Promise<void> | undefined;
const listeners = new Set<() => void>();
const set = (next: AccountState) => {
  current = next;
  listeners.forEach((listener) => listener());
};

async function post(body: Record<string, unknown>) {
  const response = await fetch("/api/space", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

export function loadAccount() {
  loading ??= (async () => {
    try {
      const response = await fetch("/api/space?account=1", {
        credentials: "same-origin",
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      set({
        status: data.account ? "signedIn" : "signedOut",
        account: data.account,
        legacySpaces: data.legacySpaces ?? 0,
        owner: !!data.owner,
        features: {
          ai: !!data.features?.ai,
          inviteOnly: data.features?.inviteOnly !== false,
        },
      });
    } catch {
      set({ ...current, status: "offline" });
    } finally {
      loading = undefined;
    }
  })();
  return loading;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (current.status === "checking" && typeof window !== "undefined") void loadAccount();
  return () => listeners.delete(listener);
}

export function useAccount() {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => initial,
  );
}

async function signIn(body: Record<string, unknown>): Promise<Result> {
  try {
    const { response, data } = await post(body);
    if (!response.ok) return { ok: false, error: data.error ?? "Could not sign in. Please retry." };
    set({ ...current, status: "signedIn", account: data.account, legacySpaces: 0 });
    // Owner flag and features come from the server; refresh them for the new account.
    void loadAccount();
    await restoreSharedSpace();
    return { ok: true };
  } catch {
    return { ok: false, error: "Cannot reach BoundSome. Check your connection and retry." };
  }
}

export const accountActions = {
  register: (
    name: string,
    email: string,
    password: string,
    entry: { access?: string | undefined; invite?: string | undefined } = {},
  ) =>
    signIn({
      op: "auth.register",
      name,
      email,
      password,
      adult: true,
      ...(entry.access ? { access: entry.access } : {}),
      ...(entry.invite ? { invite: entry.invite } : {}),
    }),
  async checkAccess(code: string): Promise<{ status: string; error?: string }> {
    try {
      const { data } = await post({ op: "access.check", code });
      return { status: data.status ?? "unknown", error: data.error };
    } catch {
      return { status: "offline", error: "Cannot reach BoundSome. Check your connection." };
    }
  },
  async sendFeedback(text: string, page: string): Promise<Result> {
    try {
      const { response, data } = await post({ op: "feedback.send", text, page });
      if (!response.ok) return { ok: false, error: data.error ?? "Could not send feedback." };
      return { ok: true };
    } catch {
      return { ok: false, error: "Cannot reach BoundSome. Check your connection and retry." };
    }
  },
  login: (email: string, password: string) => signIn({ op: "auth.login", email, password }),
  async logout(): Promise<Result> {
    try {
      const { response, data } = await post({ op: "auth.logout" });
      if (!response.ok) return { ok: false, error: data.error ?? "Sign out failed. Please retry." };
    } catch {
      return { ok: false, error: "Cannot reach BoundSome, so you are still signed in. Retry." };
    }
    leaveSharedSession();
    set({ ...current, status: "signedOut", account: null, legacySpaces: 0, owner: false });
    return { ok: true };
  },
  async forgot(email: string): Promise<Result & { message?: string }> {
    try {
      const { response, data } = await post({ op: "auth.forgot", email });
      if (!response.ok)
        return { ok: false, error: data.error ?? "Could not send the reset email." };
      return { ok: true, message: data.message };
    } catch {
      return { ok: false, error: "Cannot reach BoundSome. Check your connection and retry." };
    }
  },
  async reset(token: string, password: string): Promise<Result> {
    try {
      const { response, data } = await post({ op: "auth.reset", token, password });
      if (!response.ok) return { ok: false, error: data.error ?? "Could not reset your password." };
      set({ ...current, status: "signedOut", account: null, legacySpaces: 0, owner: false });
      return { ok: true };
    } catch {
      return { ok: false, error: "Cannot reach BoundSome. Check your connection and retry." };
    }
  },
  async rename(name: string): Promise<Result> {
    const { response, data } = await post({ op: "auth.rename", name });
    if (!response.ok) return { ok: false, error: data.error ?? "Could not save your name." };
    set({ ...current, account: data.account });
    return { ok: true };
  },
  async changePassword(currentPassword: string, next: string): Promise<Result> {
    const { response, data } = await post({ op: "auth.password", current: currentPassword, next });
    if (!response.ok) return { ok: false, error: data.error ?? "Could not change your password." };
    return { ok: true };
  },
};
