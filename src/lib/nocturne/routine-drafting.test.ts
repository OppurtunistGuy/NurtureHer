// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { draftRoutine } from "./routine-drafting.server";

const valid = {
  title: "Evening study check-in",
  instructions: "Write a short reflection on today's study session.",
  windowStart: "19:00",
  windowEnd: "20:00",
  dueTime: null,
  recurrence: { kind: "weekdays", days: [1, 2, 3, 4, 5] },
  reminderMinutes: 10,
  enabled: true,
  requiresAck: true,
  optInDaily: false,
  proof: "text",
};
function provider(draft: unknown = valid) {
  return vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      status: "completed",
      output: [
        { type: "message", content: [{ type: "output_text", text: JSON.stringify(draft) }] },
      ],
    }),
  );
}
beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "server-test-key");
  vi.stubEnv("OPENAI_ROUTINE_MODEL", "configured-test-model");
  vi.stubEnv("AI_GATEWAY_API_KEY", "");
  vi.stubEnv("VERCEL_OIDC_TOKEN", "");
  vi.stubEnv("AI_GATEWAY_MODEL", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("AI routine drafting sidecar", () => {
  it("returns a validated draft with a server UUID and no nullable due time", async () => {
    const fetcher = provider();
    const result = await draftRoutine("  Weekday study reflection, 7–8 pm  ", fetcher);
    expect(result).toMatchObject({
      title: valid.title,
      recurrence: valid.recurrence,
      proof: "text",
    });
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(result).not.toHaveProperty("dueTime");
    expect(result).not.toHaveProperty("revision");
    const [url, options] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(options?.headers).toMatchObject({ authorization: "Bearer server-test-key" });
    const body = JSON.parse(String(options?.body));
    expect(body).toMatchObject({
      model: "configured-test-model",
      store: false,
      text: { format: { type: "json_schema", strict: true } },
    });
    expect(body.input).toEqual([
      { role: "user", content: [{ type: "input_text", text: "Weekday study reflection, 7–8 pm" }] },
    ]);
    expect(body).not.toHaveProperty("tools");
    expect(body).not.toHaveProperty("previous_response_id");
    expect(body).not.toHaveProperty("conversation");
    expect(JSON.stringify(body)).not.toContain("server-test-key");
    expect(body.text.format.schema.additionalProperties).toBe(false);
  });

  it("accepts an in-window due time and a real once date", async () => {
    const result = await draftRoutine(
      "Review on February 28, 2027",
      provider({ ...valid, dueTime: "19:45", recurrence: { kind: "once", date: "2027-02-28" } }),
    );
    expect(result.dueTime).toBe("19:45");
    expect(result.recurrence).toEqual({ kind: "once", date: "2027-02-28" });
  });

  it.each(["OPENAI_API_KEY"])(
    "fails clearly without %s and never calls the provider",
    async (variable) => {
      vi.stubEnv(variable, "");
      const fetcher = provider();
      await expect(draftRoutine("Study check-in", fetcher)).rejects.toMatchObject({ status: 503 });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it("uses a default model when the direct key exists but the model was omitted", async () => {
    vi.stubEnv("OPENAI_ROUTINE_MODEL", "");
    const fetcher = provider();
    await draftRoutine("Study", fetcher);
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string).model).toBe("gpt-4.1-mini");
  });
  it.each(["VERCEL_OIDC_TOKEN", "AI_GATEWAY_API_KEY"])(
    "uses Gateway authentication via %s without a provider key",
    async (variable) => {
      vi.stubEnv("OPENAI_API_KEY", "");
      vi.stubEnv(variable, "private-gateway-credential");
      const fetcher = provider();
      await draftRoutine("Study", fetcher);
      expect(fetcher.mock.calls[0]![0]).toBe("https://ai-gateway.vercel.sh/v1/responses");
      const request = fetcher.mock.calls[0]![1]!;
      expect((request.headers as Record<string, string>)["authorization"]).toBe(
        "Bearer private-gateway-credential",
      );
      expect(JSON.parse(request.body as string).model).toBe("openai/gpt-4.1-mini");
      expect(request.body).not.toContain("private-gateway-credential");
    },
  );
  it.each([
    [402, "credits"],
    [429, "rate limited"],
    [403, "access"],
  ] as const)("gives an actionable provider %s error", async (status, message) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("private-upstream-error", { status }));
    await expect(draftRoutine("Study", fetcher)).rejects.toMatchObject({
      status: 502,
      message: expect.stringContaining(message),
    });
  });

  it.each(["", "  ", "a".repeat(2001)])(
    "rejects an empty or oversized submitted prompt before requesting AI",
    async (prompt) => {
      const fetcher = provider();
      await expect(draftRoutine(prompt, fetcher)).rejects.toMatchObject({ status: 400 });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it.each([
    { title: "" },
    { title: "a".repeat(61) },
    { instructions: "a".repeat(501) },
    { windowStart: "25:00" },
    { windowEnd: "18:59" },
    { windowEnd: "19:00" },
    { dueTime: "20:01" },
    { reminderMinutes: 241 },
    { reminderMinutes: 0.5 },
    { recurrence: { kind: "weekdays", days: [] } },
    { recurrence: { kind: "weekdays", days: [1, 1] } },
    { recurrence: { kind: "weekdays", days: [7] } },
    { recurrence: { kind: "once", date: "2027-02-30" } },
    { proof: "media" },
    { proof: "challenge", optInDaily: false },
    { enabled: "yes" },
    { id: "model-chosen-id" },
    { revision: 999 },
    { injectedCommand: "routine.save" },
  ])("rejects schema or semantic violations: %j", async (change) => {
    await expect(
      draftRoutine("Study check-in", provider({ ...valid, ...change })),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("allows a neutral challenge only with daily opt-in", async () => {
    const result = await draftRoutine(
      "A neutral written check-in with daily opt-in",
      provider({ ...valid, proof: "challenge", optInDaily: true }),
    );
    expect(result).toMatchObject({ proof: "challenge", optInDaily: true });
  });

  it("handles a provider refusal without exposing the refusal content", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status: "completed",
        output: [
          { type: "message", content: [{ type: "refusal", refusal: "private-provider-text" }] },
        ],
      }),
    );
    await expect(draftRoutine("A request", fetcher)).rejects.toMatchObject({
      status: 422,
      message: expect.not.stringContaining("private-provider-text"),
    });
  });

  it("does not parse incomplete generation as a usable draft", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status: "incomplete",
        output: [
          { type: "message", content: [{ type: "output_text", text: JSON.stringify(valid) }] },
        ],
      }),
    );
    await expect(draftRoutine("Study", fetcher)).rejects.toMatchObject({ status: 502 });
  });

  it("handles invalid JSON, missing text and oversized provider bodies", async () => {
    for (const response of [
      new Response("not json"),
      Response.json({ status: "completed", output: [] }),
      new Response("x".repeat(65537)),
      Response.json({
        status: "completed",
        output: [{ type: "message", content: [{ type: "output_text", text: "not json" }] }],
      }),
    ]) {
      await expect(
        draftRoutine("Study", vi.fn<typeof fetch>().mockResolvedValue(response)),
      ).rejects.toMatchObject({ status: 502 });
    }
  });

  it("keeps upstream errors and credentials out of public errors", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("secret diagnostic server-test-key", { status: 401 }));
    await expect(draftRoutine("Study", fetcher)).rejects.toMatchObject({
      status: 502,
      message: expect.not.stringContaining("server-test-key"),
    });
    await expect(
      draftRoutine("Study", vi.fn<typeof fetch>().mockRejectedValue(new Error("server-test-key"))),
    ).rejects.toMatchObject({
      status: 502,
      message: expect.not.stringContaining("server-test-key"),
    });
  });

  it("bounds the entire request even when a provider ignores abort", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise<Response>(() => {}));
    const result = draftRoutine("Study", fetcher);
    const assertion = expect(result).rejects.toMatchObject({ status: 504 });
    await vi.advanceTimersByTimeAsync(12000);
    await assertion;
    expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("also bounds a provider response whose body stalls", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(new ReadableStream()));
    const result = draftRoutine("Study", fetcher);
    const assertion = expect(result).rejects.toMatchObject({ status: 504 });
    await vi.advanceTimersByTimeAsync(12000);
    await assertion;
    expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
});
