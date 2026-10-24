import { z } from "zod";
import { SpaceError, SpaceRepository, SESSION_SECONDS } from "./space-repository.server";
import { RoutineDraftError } from "./routine-drafting.server";
import { timingSafeEqual } from "node:crypto";
import { connectRemoteStorage, type SpaceStorage } from "./remote-storage.server";

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
const requestSchema = z.discriminatedUnion("op", [
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
      op: z.literal("draft"),
      spaceId: z.string().uuid(),
      prompt: z.string().trim().min(1).max(2000),
    })
    .strict(),
]);
const COOKIE = "nocturne_member";
let repository: SpaceStorage | undefined;
function getRepository() {
  if (repository) return repository;
  if (
    (process.env["TURSO_DATABASE_URL"] || process.env["TURSO_AUTH_TOKEN"]) &&
    (!process.env["TURSO_DATABASE_URL"]?.trim() || !process.env["TURSO_AUTH_TOKEN"]?.trim())
  )
    throw new SpaceError(
      503,
      "Remote storage setup is incomplete. The app owner must set both TURSO_DATABASE_URL and TURSO_AUTH_TOKEN for this deployment, then redeploy.",
    );
  if (process.env["TURSO_DATABASE_URL"] || process.env["TURSO_AUTH_TOKEN"])
    return (repository = connectRemoteStorage());
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
  let bytes = 0;
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
    return requestSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch (error) {
    if (error instanceof SpaceError) throw error;
    throw new SpaceError(400, "Check the name, invitation and request details.");
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
  try {
    const session =
      request.headers
        .get("cookie")
        ?.split(";")
        .map((x) => x.trim())
        .find((x) => x.startsWith(`${COOKIE}=`))
        ?.slice(COOKIE.length + 1) ?? "";
    if (request.method !== "GET" && request.method !== "POST")
      return json({ error: "Method not allowed." }, 405);
    if (request.method === "POST" && request.headers.get("origin") !== new URL(request.url).origin)
      throw new SpaceError(403, "Open this page on the same site before making changes.");
    if (request.method === "GET" && !session)
      throw new SpaceError(
        401,
        "No active space on this browser. Open an invitation or create a space.",
      );
    const db = suppliedRepository ?? getRepository();
    if (request.method === "GET")
      return json(
        await db.read(
          session,
          spaceId.parse(new URL(request.url).searchParams.get("space") ?? undefined),
        ),
      );
    const input = await readBody(request);
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
      const result =
        input.op === "create"
          ? await db.create(input.name, input.role, session, input.timeZone)
          : await db.join(input.token, input.name, session);
      headers.set(
        "set-cookie",
        `${COOKIE}=${result.token}; Path=/api/space; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`,
      );
      return json(result.snapshot, 201);
    }
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
            from: z.object({ id: z.number().int().positive(), is_bot: z.boolean().optional() }),
            chat: z.object({ id: z.number().int(), type: z.string() }),
            text: z.string().max(4096).optional(),
            caption: z.string().max(4096).optional(),
            photo: z.unknown().optional(),
            video: z.unknown().optional(),
            document: z.unknown().optional(),
          })
          .optional(),
      })
      .parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const message = update.message;
    if (
      !message ||
      message.from.is_bot ||
      message.chat.type !== "private" ||
      message.chat.id !== message.from.id
    )
      return json({ ok: true });
    let text: string;
    try {
      text = await (suppliedRepository ?? getRepository()).telegramUpdate(
        update.update_id,
        String(message.from.id),
        message.text || message.caption || "",
        !!(message.photo || message.video || message.document),
      );
    } catch (error) {
      if (error instanceof Error && "code" in error)
        return json({ error: "Storage unavailable; retry this update." }, 503);
      text =
        "This record cannot be updated. Check the app for consent, preparation and current task status. Nothing was submitted.";
    }
    return json({ method: "sendMessage", chat_id: message.chat.id, text, protect_content: true });
  } catch {
    return json({ error: "Invalid update." }, 400);
  }
}
