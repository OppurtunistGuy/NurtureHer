import { remoteStorageConfig } from "./remote-storage-config.server";
import { z } from "zod";
import { SpaceError, SpaceRepository, SESSION_SECONDS } from "./space-repository.server";
import { RoutineDraftError } from "./routine-drafting.server";
import { timingSafeEqual } from "node:crypto";
import { connectRemoteStorage, type SpaceStorage } from "./remote-storage.server";
import { AUTH_SESSION_SECONDS, principal, type Account } from "./auth-core.server";
import { burnPasswordCheck, hashPassword, verifyPassword } from "./passwords.server";
import { deliver, yesNoButtons } from "./telegram-bot.server";
import { mailConfigured, sendMail } from "./mailer.server";
import { publicOrigin } from "./space-protocol";
import type { TelegramInput } from "./telegram-verification.server";

const name = z.string().trim().min(1, "Enter your name.").max(40),
  token = z.string().regex(/^[a-f0-9]{64}$/),
  revision = z.number().int().min(1),
  spaceId = z.string().uuid().optional();
const timeZone = z
  .string()
  .max(80)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  })
  .default("UTC");
const email = z.string().trim().toLowerCase().email().max(254),
  password = z.string().min(10).max(200);
const requestSchema = z.discriminatedUnion("op", [
  z
    .object({ op: z.literal("auth.register"), email, name, password, adult: z.literal(true) })
    .strict(),
  z.object({ op: z.literal("auth.login"), email, password: z.string().min(1).max(200) }).strict(),
  z.object({ op: z.literal("auth.logout") }).strict(),
  z.object({ op: z.literal("auth.forgot"), email }).strict(),
  z
    .object({ op: z.literal("auth.reset"), token: z.string().regex(/^[a-f0-9]{64}$/), password })
    .strict(),
  z
    .object({ op: z.literal("auth.password"), current: z.string().min(1).max(200), next: password })
    .strict(),
  z.object({ op: z.literal("auth.rename"), name }).strict(),
  z
    .object({
      op: z.literal("create"),
      name,
      role: z.enum(["dom", "sub"]),
      adult: z.literal(true),
      timeZone,
    })
    .strict(),
  z.object({ op: z.literal("preview"), token }).strict(),
  z.object({ op: z.literal("join"), name, token, adult: z.literal(true) }).strict(),
  z.object({ op: z.literal("command"), spaceId, revision, command: z.unknown() }).strict(),
  z.object({ op: z.literal("profile"), spaceId, revision, name }).strict(),
  z.object({ op: z.literal("rotate"), spaceId, revision }).strict(),
  z
    .object({
      op: z.literal("telegram.open"),
      spaceId: z.string().uuid(),
      routineId: z.string().min(1).max(100),
    })
    .strict(),
  z
    .object({
      op: z.literal("telegram.answer"),
      spaceId: z.string().uuid(),
      ticketId: z.string().uuid(),
      answer: z.enum(["yes", "no"]),
    })
    .strict(),
  z
    .object({
      op: z.literal("draft"),
      spaceId: z.string().uuid(),
      prompt: z.string().trim().min(1).max(2000),
    })
    .strict(),
]);
const COOKIE = "nocturne_member",
  AUTH_COOKIE = "boundsome_auth";
const HEX_TOKEN = /^[a-f0-9]{64}$/;
const AUTH_MESSAGES: Record<string, string> = {
  "auth.register":
    "Enter your name, a valid email and a password of at least 10 characters, and confirm you are 18+.",
  "auth.login": "Enter your email and password.",
  "auth.forgot": "Enter the email address you signed up with.",
  "auth.reset": "Use the link from your email, and choose a password of at least 10 characters.",
  "auth.password": "Enter your current password and a new password of at least 10 characters.",
  "auth.rename": "Enter a name of up to 40 characters.",
};
const LOGIN_FAILED = "That email and password don't match an account.";
function readCookies(header: string | null) {
  const cookies: Record<string, string> = {};
  for (const part of header?.split(";") ?? []) {
    const index = part.indexOf("=");
    if (index > 0) cookies[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return cookies;
}
function clientIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "local"
  ).slice(0, 64);
}
let repository: SpaceStorage | undefined;
function getRepository() {
  if (repository) return repository;
  let config: ReturnType<typeof remoteStorageConfig>;
  try {
    config = remoteStorageConfig();
  } catch {
    throw new SpaceError(
      503,
      "Remote storage setup is incomplete or invalid. Check the Turso database URL and matching auth token for this deployment, then redeploy.",
    );
  }
  if (config) return (repository = connectRemoteStorage());
  if (process.env["VERCEL"] === "1")
    throw new SpaceError(
      503,
      "Shared spaces are not configured on this server. The app owner must connect a persistent database, set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN, and redeploy. Your laptop does not need to stay on.",
    );
  return (repository ??= new SpaceRepository(
    process.env["NOCTURNE_DB_PATH"] ?? "data/nocturne.sqlite",
  ));
}

async function readBody(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new SpaceError(415, "Send a JSON request.");
  const reader = request.body?.getReader();
  if (!reader) throw new SpaceError(400, "Request body is required.");
  const chunks: Uint8Array[] = [];
  let bytes = 0,
    raw: unknown;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.length;
      if (bytes > 32_768) {
        await reader.cancel();
        throw new SpaceError(413, "Request is too large.");
      }
      chunks.push(next.value);
    }
    raw = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return requestSchema.parse(raw);
  } catch (error) {
    if (error instanceof SpaceError) throw error;
    const op = typeof raw === "object" && raw ? String((raw as { op?: unknown }).op) : "";
    throw new SpaceError(
      400,
      AUTH_MESSAGES[op] ?? "Check the name, invitation and request details.",
    );
  }
}
export async function handleSpaceRequest(
  request: Request,
  suppliedRepository?: SpaceStorage,
): Promise<Response> {
  const headers = new Headers({
    "content-type": "application/json",
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  });
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers });
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  const setCookie = (cookieName: string, value: string, maxAge: number) =>
    headers.append(
      "set-cookie",
      `${cookieName}=${value}; Path=/api/space; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`,
    );
  try {
    const cookies = readCookies(request.headers.get("cookie"));
    // Only well-formed random tokens are accepted, so a cookie can never name an account.
    const legacy = HEX_TOKEN.test(cookies[COOKIE] ?? "") ? cookies[COOKIE]! : "";
    const authToken = HEX_TOKEN.test(cookies[AUTH_COOKIE] ?? "") ? cookies[AUTH_COOKIE]! : "";
    if (request.method !== "GET" && request.method !== "POST")
      return json({ error: "Method not allowed." }, 405);
    if (request.method === "POST" && request.headers.get("origin") !== new URL(request.url).origin)
      throw new SpaceError(403, "Open this page on the same site before making changes.");
    const url = new URL(request.url);
    const wantsAccount = request.method === "GET" && url.searchParams.has("account");
    const wantsDashboard = request.method === "GET" && url.searchParams.has("dashboard");
    if (request.method === "GET" && !wantsAccount && !wantsDashboard && !legacy && !authToken)
      throw new SpaceError(
        401,
        "No active space on this browser. Open an invitation or create a space.",
      );
    const db = suppliedRepository ?? getRepository();
    let account: Account | undefined;
    if (authToken) {
      account = await db.auth((core) => core.resolveSession(authToken));
      if (!account) setCookie(AUTH_COOKIE, "", 0);
    }
    // Signed-in requests act as the account; the old browser cookie only works while signed out.
    const session = account ? principal(account.id) : legacy;
    if (wantsAccount)
      return json({
        account: account ?? null,
        legacySpaces: !account && legacy ? await db.auth((core) => core.legacyCount(legacy)) : 0,
      });
    if (request.method === "GET" && url.searchParams.has("dashboard")) {
      if (!account) throw new SpaceError(401, "Log in to open your dashboard.");
      return json({ cards: await db.dashboard(session) });
    }
    if (request.method === "GET") {
      if (!session)
        throw new SpaceError(401, "Your session ended. Log in again to open your spaces.");
      return json(
        await db.read(session, spaceId.parse(url.searchParams.get("space") ?? undefined)),
      );
    }
    const input = await readBody(request);
    if (input.op === "auth.register" || input.op === "auth.login") {
      let user: Account;
      if (input.op === "auth.register") {
        const passwordHash = await hashPassword(input.password);
        const created = await db.auth((core) =>
          core.createUser(input.email, input.name, passwordHash),
        );
        if (!created)
          throw new SpaceError(409, "An account with this email already exists. Log in instead.");
        user = created;
      } else {
        const ip = clientIp(request);
        const limit = await db.auth((core) => core.throttle(input.email, ip));
        if (limit.retryAfter > 0) {
          headers.set("retry-after", String(limit.retryAfter));
          throw new SpaceError(
            429,
            `Too many attempts. Wait ${limit.retryAfter} seconds and try again.`,
          );
        }
        if (limit.slow) await new Promise((resolve) => setTimeout(resolve, 1000));
        const found = await db.auth((core) => core.findUserByEmail(input.email));
        const valid = found
          ? await verifyPassword(input.password, found.password_hash)
          : (await burnPasswordCheck(input.password), false);
        if (!found || !valid) {
          await db.auth((core) => core.recordFailure(input.email, ip));
          throw new SpaceError(401, LOGIN_FAILED);
        }
        await db.auth((core) => core.clearFailures(input.email, ip));
        user = { id: found.id, email: found.email, name: found.name };
      }
      // Claiming happens only here, after the password check or a new registration succeeded.
      const result = await db.auth(async (core) => ({
        claimed: legacy ? await core.claim(user.id, legacy) : 0,
        remaining: legacy ? await core.legacyCount(legacy) : 0,
        token: await core.createSession(user.id),
      }));
      setCookie(AUTH_COOKIE, result.token, AUTH_SESSION_SECONDS);
      if (legacy && result.remaining === 0) setCookie(COOKIE, "", 0);
      return json(
        { account: user, claimed: result.claimed },
        input.op === "auth.register" ? 201 : 200,
      );
    }
    if (input.op === "auth.forgot") {
      // The answer is the same whether or not the email has an account, so it can't be probed.
      const sent = {
        ok: true,
        message: "If that email has an account, a reset link is on its way.",
      };
      if (!mailConfigured())
        throw new SpaceError(503, "Password reset by email isn't set up on this server yet.");
      const ip = clientIp(request);
      const allowance = await db.auth((core) => core.resetAllowance(input.email, ip));
      if (allowance.ipBlocked)
        throw new SpaceError(429, "Too many reset requests. Try again in an hour.");
      const found = allowance.emailBlocked
        ? undefined
        : await db.auth((core) => core.findUserByEmail(input.email));
      if (!found) {
        // Take about as long as a real send, so timing doesn't give the answer away either.
        await new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 300));
        return json(sent);
      }
      const resetToken = await db.auth((core) => core.createReset(found.id));
      const link = `${publicOrigin(url.origin)}/account#reset=${resetToken}`;
      const delivered = await sendMail({
        to: found.email,
        subject: "Reset your BoundSome password",
        text: `Hi ${found.name},\n\nSomeone asked to reset the password for this BoundSome account. Open this link within 30 minutes to choose a new one:\n\n${link}\n\nIt works once. If this wasn't you, ignore this email; your password stays the same.\n`,
      });
      // A failed send leaves a link nobody has, so remove it instead of keeping it live.
      if (!delivered) await db.auth((core) => core.discardReset(found.id));
      return json(sent);
    }
    if (input.op === "auth.reset") {
      const passwordHash = await hashPassword(input.password);
      const done = await db.auth((core) => core.completeReset(input.token, passwordHash));
      if (!done)
        throw new SpaceError(
          400,
          "This reset link has expired or was already used. Ask for a new one.",
        );
      // Signed out everywhere, including this browser; the person logs in with the new password.
      setCookie(AUTH_COOKIE, "", 0);
      return json({ ok: true });
    }
    if (input.op === "auth.logout") {
      if (authToken) await db.auth((core) => core.deleteSession(authToken));
      setCookie(AUTH_COOKIE, "", 0);
      return json({ ok: true });
    }
    if (input.op === "auth.password" || input.op === "auth.rename") {
      if (!account) throw new SpaceError(401, "Log in again to change your account.");
      const signedIn = account;
      if (input.op === "auth.rename") {
        await db.auth((core) => core.rename(signedIn.id, input.name));
        return json({ account: { ...signedIn, name: input.name.trim() } });
      }
      const ip = clientIp(request);
      const limit = await db.auth((core) => core.throttle(signedIn.email, ip));
      if (limit.retryAfter > 0)
        throw new SpaceError(
          429,
          `Too many attempts. Wait ${limit.retryAfter} seconds and try again.`,
        );
      const stored = await db.auth((core) => core.userWithHash(signedIn.id));
      if (!stored || !(await verifyPassword(input.current, stored.password_hash))) {
        await db.auth((core) => core.recordFailure(signedIn.email, ip));
        throw new SpaceError(401, "Your current password is not correct.");
      }
      const passwordHash = await hashPassword(input.next);
      await db.auth(async (core) => {
        await core.setPassword(signedIn.id, passwordHash);
        await core.deleteOtherSessions(signedIn.id, authToken);
      });
      return json({ ok: true });
    }
    if (input.op === "telegram.answer") {
      const result = await db.telegramAnswer(session, input.spaceId, input.ticketId, input.answer);
      await deliver(result.notify);
      return json({ message: result.reply });
    }
    if (input.op === "telegram.open")
      return json(await db.openTelegram(session, input.spaceId, input.routineId));
    if (input.op === "draft") {
      const snapshot = await db.read(session, input.spaceId);
      if (snapshot.state.myRole !== "dom")
        throw new SpaceError(403, "Only the Master can draft assigned routines.");
      if (snapshot.state.pause.active)
        throw new SpaceError(423, "Paused: routine drafting is locked.");
      const { draftRoutine } = await import("./routine-drafting.server");
      const routine = await draftRoutine(input.prompt);
      if ((await db.read(session, input.spaceId)).state.pause.active)
        throw new SpaceError(423, "Paused: routine drafting is locked.");
      return json({ routine });
    }
    if (input.op === "preview") return json(await db.preview(input.token));
    if (input.op === "create" || input.op === "join") {
      if (!account)
        throw new SpaceError(
          401,
          "Log in or create an account before creating or joining a space.",
        );
      const result =
        input.op === "create"
          ? await db.create(input.name, input.role, session, input.timeZone)
          : await db.join(input.token, input.name, session);
      return json(result.snapshot, 201);
    }
    if (!session) throw new SpaceError(401, "Your session ended. Log in again to make changes.");
    return json(
      await db.change(
        session,
        input.revision,
        input.op === "command"
          ? { command: input.command }
          : input.op === "profile"
            ? { name: input.name }
            : { rotate: true },
        input.spaceId,
      ),
    );
  } catch (error) {
    if (error instanceof RoutineDraftError) return json({ error: error.message }, error.status);
    if (error instanceof SpaceError)
      return json(
        { error: error.message, ...(error.snapshot ? { snapshot: error.snapshot } : {}) },
        error.status,
      );
    if (error instanceof z.ZodError)
      return json({ error: "The action contains invalid details." }, 400);
    console.error(
      "Shared-space storage request failed",
      error instanceof Error ? error.name : "unknown",
    );
    return json(
      { error: "Shared storage is unavailable. Try again; your space has not been replaced." },
      503,
    );
  }
}

/** Telegram sends authenticated updates here; media payloads are never persisted. */
export async function handleTelegramRequest(request: Request, suppliedRepository?: SpaceStorage) {
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  const secret = process.env["TELEGRAM_WEBHOOK_SECRET"] ?? "",
    supplied = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (secret.length < 32) return json({ error: "Telegram is not configured." }, 503);
  if (
    Buffer.byteLength(secret) !== Buffer.byteLength(supplied) ||
    !timingSafeEqual(Buffer.from(secret), Buffer.from(supplied))
  )
    return json({ error: "Unauthorized." }, 403);
  try {
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "Missing update." }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > 65536) {
        await reader.cancel();
        return json({ error: "Update too large." }, 413);
      }
      chunks.push(next.value);
    }
    const update = z
      .object({
        update_id: z.number().int().nonnegative(),
        message: z
          .object({
            message_id: z.number().int().nonnegative().optional(),
            from: z.object({ id: z.number().int().positive(), is_bot: z.boolean().optional() }),
            chat: z.object({ id: z.number().int(), type: z.string() }),
            text: z.string().max(4096).optional(),
            caption: z.string().max(4096).optional(),
            photo: z.unknown().optional(),
            video: z.unknown().optional(),
            document: z.unknown().optional(),
          })
          .optional(),
        // A tap on a Yes/No button.
        callback_query: z
          .object({
            id: z.string().max(128),
            from: z.object({ id: z.number().int().positive(), is_bot: z.boolean().optional() }),
            data: z.string().max(64).optional(),
            message: z
              .object({ chat: z.object({ id: z.number().int(), type: z.string() }) })
              .optional(),
          })
          .optional(),
      })
      .parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const message = update.message,
      tap = update.callback_query;
    // Private chats only: anything from a group or channel is ignored.
    const privateChat = (
      from: { id: number; is_bot?: boolean | undefined },
      chat?: { id: number; type: string },
    ) => !from.is_bot && chat?.type === "private" && chat.id === from.id;
    let input: TelegramInput;
    if (tap) {
      const choice = /^(y|n):([a-f0-9-]{36})$/.exec(tap.data ?? "");
      if (!choice || !privateChat(tap.from, tap.message?.chat))
        return json({ method: "answerCallbackQuery", callback_query_id: tap.id });
      input = {
        updateId: update.update_id,
        userId: String(tap.from.id),
        text: "",
        media: false,
        answer: { ticketId: choice[2]!, value: choice[1] === "y" ? "yes" : "no" },
      };
    } else if (message && privateChat(message.from, message.chat)) {
      input = {
        updateId: update.update_id,
        userId: String(message.from.id),
        text: message.text || message.caption || "",
        media: !!(message.photo || message.video || message.document),
        ...(message.message_id !== undefined ? { messageId: message.message_id } : {}),
      };
    } else return json({ ok: true });
    let reply: string,
      buttons: string | undefined,
      notify: Parameters<typeof deliver>[0] = [];
    try {
      const result = await (suppliedRepository ?? getRepository()).telegramUpdate(input);
      ({ reply, buttons, notify } = result);
    } catch (error) {
      if (error instanceof Error && "code" in error)
        return json({ error: "Storage unavailable; retry this update." }, 503);
      reply =
        "This record cannot be updated. Check the app for consent, preparation and current task status. Nothing was changed.";
    }
    // The result is committed; now tell the other person. A failed send never undoes it.
    if (tap) {
      await deliver([{ chatId: input.userId, text: reply }, ...notify]);
      return json({
        method: "answerCallbackQuery",
        callback_query_id: tap.id,
        text: reply.slice(0, 200),
      });
    }
    await deliver(notify);
    return json({
      method: "sendMessage",
      chat_id: message!.chat.id,
      text: reply,
      protect_content: true,
      ...(buttons ? { reply_markup: yesNoButtons(buttons) } : {}),
    });
  } catch {
    return json({ error: "Invalid update." }, 400);
  }
}
