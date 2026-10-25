import { randomUUID } from "node:crypto";
import { z } from "zod";
import { validDate } from "./engine";
import { savedStateSchema } from "./storage";
import type { Routine } from "./types";

export class RoutineDraftError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "RoutineDraftError";
  }
}

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const draftSchema = savedStateSchema.shape.routines.element
  // Telegram verification is never chosen by the AI; it defaults on below. The AI suggests a
  // reward and a consequence, which the Master edits before anything is saved.
  .omit({ id: true, revision: true, telegramVerify: true })
  .extend({
    title: z.string().trim().min(1).max(60),
    instructions: z.string().max(500),
    dueTime: time.nullable(),
    reminderMinutes: z.number().int().min(0).max(240).nullable(),
    proof: z.enum(["confirmation", "text", "challenge"]),
    recurrence: z.union([
      z.object({ kind: z.literal("daily") }).strict(),
      z
        .object({
          kind: z.literal("weekdays"),
          days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
        })
        .strict(),
      z.object({ kind: z.literal("once"), date: z.string().refine(validDate) }).strict(),
    ]),
  })
  .strict()
  .refine((r) => r.windowStart < r.windowEnd)
  .refine((r) => r.dueTime === null || (r.dueTime >= r.windowStart && r.dueTime <= r.windowEnd))
  .refine((r) => r.proof !== "challenge" || r.optInDaily)
  .refine(
    (r) =>
      r.recurrence.kind !== "weekdays" ||
      new Set(r.recurrence.days).size === r.recurrence.days.length,
  );

const object = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
// Responses API Structured Outputs: every property is required; optional dueTime is nullable.
// https://developers.openai.com/api/docs/guides/structured-outputs
const outputSchema = object({
  title: { type: "string", minLength: 1, maxLength: 60 },
  instructions: { type: "string", maxLength: 500 },
  windowStart: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
  windowEnd: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
  dueTime: { type: ["string", "null"], pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
  recurrence: {
    anyOf: [
      object({ kind: { type: "string", enum: ["daily"] } }),
      object({
        kind: { type: "string", enum: ["weekdays"] },
        days: {
          type: "array",
          items: { type: "integer", minimum: 0, maximum: 6 },
          minItems: 1,
          maxItems: 7,
        },
      }),
      object({
        kind: { type: "string", enum: ["once"] },
        date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      }),
    ],
  },
  reminderMinutes: { type: ["integer", "null"], minimum: 0, maximum: 240 },
  enabled: { type: "boolean" },
  requiresAck: { type: "boolean" },
  optInDaily: { type: "boolean" },
  proof: { type: "string", enum: ["confirmation", "text", "challenge"] },
  rewardPoints: { type: "integer", minimum: 0, maximum: 100 },
  punishmentPoints: { type: "integer", minimum: 0, maximum: 100 },
  punishmentNote: { type: "string", maxLength: 200 },
});

const providerSchema = z.object({
  status: z.literal("completed"),
  output: z.array(
    z.object({
      type: z.string(),
      content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
    }),
  ),
});

async function readProvider(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing provider body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) {
        await reader.cancel();
        throw new Error("Provider body too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

/** No database access, tools, conversation context, or saving. The caller checks membership/role/pause. */
export async function draftRoutine(
  prompt: string,
  fetcher: typeof fetch = fetch,
): Promise<Routine> {
  const parsedPrompt = z.string().trim().min(1).max(2000).safeParse(prompt);
  if (!parsedPrompt.success)
    throw new RoutineDraftError(400, "Describe a routine in 1–2,000 characters.");
  // Preserve an explicitly configured direct provider. Vercel deployments can
  // instead authenticate to AI Gateway using their runtime OIDC identity.
  const directKey = process.env["OPENAI_API_KEY"]?.trim();
  const gatewayKey =
    process.env["AI_GATEWAY_API_KEY"]?.trim() || process.env["VERCEL_OIDC_TOKEN"]?.trim();
  const gateway = !directKey && !!gatewayKey;
  const key = directKey || gatewayKey;
  // Verified in the live Gateway catalog: fast text + structured output support.
  const model = gateway
    ? process.env["AI_GATEWAY_MODEL"]?.trim() || "openai/gpt-4.1-mini"
    : process.env["OPENAI_ROUTINE_MODEL"]?.trim() || "gpt-4.1-mini";
  if (!key)
    throw new RoutineDraftError(
      503,
      "AI drafting is not configured on this server. Enable Vercel AI Gateway with deployment OIDC, or add OPENAI_API_KEY in the server environment and redeploy. Never paste API keys into this app or chat.",
    );

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(
        new RoutineDraftError(
          504,
          "AI drafting timed out. Try again or create the routine manually.",
        ),
      );
    }, 12000);
  });
  try {
    return await Promise.race([
      timeout,
      (async () => {
        const response = await fetcher(
          gateway
            ? "https://ai-gateway.vercel.sh/v1/responses"
            : "https://api.openai.com/v1/responses",
          {
            method: "POST",
            headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              model,
              store: false,
              max_output_tokens: 3000,
              instructions:
                "Draft one routine for human review, never execute or save it. Use only the user's request, not invented names or private context. Respect consent and safety; never require intimate media. Suggest rewardPoints (0-100) in proportion to the effort, and a modest consequence for when the task is not performed: punishmentPoints (0-100, usually no more than the reward) and punishmentNote, one short, safe, practical consequence the Master can edit, such as an extra small task, an earlier bedtime, or writing a reflection. Never suggest physical harm, pain, injury, restraint, sexual acts, nudity, public humiliation, money or financial penalties, substances, anything illegal, or anything involving other people; if the request asks for that, use a neutral consequence instead. Use 0 points and an empty punishmentNote only if the user asks for no consequence. Use a same-day HH:mm window with end after start; dueTime must be null or inside that window. Weekdays are unique numbers 0 (Sunday) through 6; once requires a real YYYY-MM-DD date supplied by the user, otherwise use daily. Reminders are null or 0–240 minutes. Default proof is text; challenge is only a neutral written prompt and requires optInDaily true. No camera or media proof. Return JSON matching the schema. Keep instructions practical and under 500 characters.",
              input: [{ role: "user", content: [{ type: "input_text", text: parsedPrompt.data }] }],
              text: {
                format: {
                  type: "json_schema",
                  name: "routine_draft",
                  strict: true,
                  schema: outputSchema,
                },
              },
            }),
          },
        );
        if (!response.ok) {
          void response.body?.cancel().catch(() => {});
          throw new RoutineDraftError(
            502,
            response.status === 401 || response.status === 403
              ? "AI authentication or team access was rejected. Ask the app owner to check the server's AI credentials, Vercel OIDC and Gateway access, then redeploy."
              : response.status === 402
                ? "AI credits or the configured spending budget are exhausted. The app owner needs to check AI billing before drafting can continue."
                : response.status === 429
                  ? "AI drafting is rate limited. Wait a moment and try again."
                  : "AI drafting is unavailable. Try again later or create the routine manually.",
          );
        }
        const envelope = providerSchema.parse(await readProvider(response));
        const content = envelope.output
          .filter((item) => item.type === "message")
          .flatMap((item) => item.content ?? []);
        if (content.some((item) => item.type === "refusal")) {
          throw new RoutineDraftError(
            422,
            "AI could not draft that request. Reword it or create a routine manually.",
          );
        }
        const texts = content.filter((item) => item.type === "output_text");
        if (texts.length !== 1 || !texts[0]?.text) throw new Error("Missing structured output");
        const { dueTime, ...draft } = draftSchema.parse(JSON.parse(texts[0].text));
        // Telegram two-person verification is on by default; the Master reviews and can turn it off.
        return {
          ...draft,
          ...(dueTime === null ? {} : { dueTime }),
          telegramVerify: true,
          id: randomUUID(),
        };
      })(),
    ]);
  } catch (error) {
    if (error instanceof RoutineDraftError) throw error;
    throw new RoutineDraftError(
      502,
      "AI returned no usable routine. Try again or create the routine manually.",
    );
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
