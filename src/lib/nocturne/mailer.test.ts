// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendMail } from "./mailer.server";

const mail = { to: "a@example.test", subject: "Hi", text: "Body", idempotencyKey: "reset-abc" };

describe("Resend mailer", () => {
  let calls: { headers: Record<string, string>; body: unknown }[];
  const answer = (statuses: (number | "network")[]) => {
    let i = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push({
          headers: init.headers as Record<string, string>,
          body: JSON.parse(init.body as string),
        });
        const status = statuses[Math.min(i++, statuses.length - 1)]!;
        if (status === "network") throw new TypeError("fetch failed");
        return new Response("{}", { status });
      }),
    );
  };
  beforeEach(() => {
    calls = [];
    process.env["RESEND_API_KEY"] = "re_test_key_for_unit_tests";
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ["setTimeout"] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env["RESEND_API_KEY"];
  });
  const send = async () => {
    const result = sendMail(mail);
    await vi.runAllTimersAsync();
    return result;
  };

  it("sends once with the idempotency key and the test sender by default", async () => {
    answer([200]);
    expect(await send()).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.headers["idempotency-key"]).toBe("reset-abc");
    expect(calls[0]!.body).toMatchObject({
      from: "BoundSome <onboarding@resend.dev>",
      to: [mail.to],
    });
  });

  it("retries network errors, rate limits and server errors with the same key", async () => {
    answer(["network", 429, 200]);
    expect(await send()).toBe(true);
    expect(calls).toHaveLength(3);
    expect(new Set(calls.map((c) => c.headers["idempotency-key"]))).toEqual(new Set(["reset-abc"]));
  });

  it("gives up after three tries", async () => {
    answer([503]);
    expect(await send()).toBe(false);
    expect(calls).toHaveLength(3);
  });

  it("does not retry a request Resend refused, like a bad key or sender", async () => {
    answer([403]);
    expect(await send()).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it("sends nothing without a key", async () => {
    delete process.env["RESEND_API_KEY"];
    answer([200]);
    expect(await send()).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
