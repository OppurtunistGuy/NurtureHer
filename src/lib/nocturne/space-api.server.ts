import { z } from "zod";
import { SpaceError, SpaceRepository, SESSION_SECONDS } from "./space-repository.server";

const name = z.string().trim().min(1, "Enter your name.").max(40),
  token = z.string().regex(/^[a-f0-9]{64}$/),
  revision = z.number().int().min(1);
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
  z.object({ op: z.literal("command"), revision, command: z.unknown() }).strict(),
  z.object({ op: z.literal("profile"), revision, name }).strict(),
  z.object({ op: z.literal("rotate"), revision }).strict(),
]);
const COOKIE = "nocturne_member";
let repository: SpaceRepository | undefined;
function getRepository() {
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
  suppliedRepository?: SpaceRepository,
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
    const db = suppliedRepository ?? getRepository();
    if (request.method === "GET") return json(db.read(session));
    const input = await readBody(request);
    if (input.op === "preview") return json(db.preview(input.token));
    if (input.op === "create" || input.op === "join") {
      const result =
        input.op === "create"
          ? db.create(input.name, input.role, session, input.timeZone)
          : db.join(input.token, input.name, session);
      headers.set(
        "set-cookie",
        `${COOKIE}=${result.token}; Path=/api/space; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`,
      );
      return json(result.snapshot, 201);
    }
    return json(
      db.change(
        session,
        input.revision,
        input.op === "command"
          ? { command: input.command }
          : input.op === "profile"
            ? { name: input.name }
            : { rotate: true },
      ),
    );
  } catch (error) {
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
