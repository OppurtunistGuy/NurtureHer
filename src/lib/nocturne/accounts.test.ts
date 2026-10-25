// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { handleSpaceRequest } from "./space-api.server";
import { SpaceRepository } from "./space-repository.server";
import { RemoteSpaceRepository, type SpaceStorage } from "./remote-storage.server";
import { IP_FAILURE_LIMIT } from "./auth-core.server";

const PASSWORD = "correct horse battery";
let directory: string, clock: Date, db: SpaceStorage & { close(): void };

/** One browser: its own cookie jar and client IP. */
class Browser {
  jar = new Map<string, string>();
  constructor(public ip = "203.0.113.1") {}
  get cookie() {
    return [...this.jar].map(([key, value]) => `${key}=${value}`).join("; ");
  }
  async call(body?: Record<string, unknown>, query = "") {
    const response = await handleSpaceRequest(
      new Request(`https://boundsome.test/api/space${query}`, {
        method: body ? "POST" : "GET",
        headers: {
          origin: "https://boundsome.test",
          "content-type": "application/json",
          "x-forwarded-for": this.ip,
          cookie: this.cookie,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      db,
    );
    for (const header of response.headers.getSetCookie()) {
      const [pair, ...attributes] = header.split(";");
      const [key, ...rest] = pair!.split("=");
      if (attributes.some((a) => a.trim() === "Max-Age=0")) this.jar.delete(key!);
      else this.jar.set(key!, rest.join("="));
    }
    return { status: response.status, body: await response.json(), response };
  }
  register(email: string, name = "Person", password = PASSWORD) {
    return this.call({ op: "auth.register", email, name, password, adult: true });
  }
  login(email: string, password = PASSWORD) {
    return this.call({ op: "auth.login", email, password });
  }
  logout() {
    return this.call({ op: "auth.logout" });
  }
  account() {
    return this.call(undefined, "?account=1");
  }
  spaces() {
    return this.call();
  }
  create(name = "Maya", role: "dom" | "sub" = "dom") {
    return this.call({ op: "create", name, role, adult: true, timeZone: "Asia/Kolkata" });
  }
}

/** A space made the old way: an anonymous browser cookie with no account. */
async function legacySpace(browser: Browser, name = "Old space") {
  const created = await db.create(name, "dom", "", "Asia/Kolkata");
  browser.jar.set("nocturne_member", created.token);
  return created.snapshot.state.space.id!;
}

for (const backend of ["local SQLite", "remote libSQL"] as const) {
  // Real scrypt hashing (N=32768) runs dozens of times in the throttle tests;
  // shared CI runners can need more than the 5 s default.
  describe(`accounts (${backend})`, { timeout: 30_000 }, () => {
    beforeEach(() => {
      directory = mkdtempSync(join(tmpdir(), "boundsome-accounts-"));
      clock = new Date("2026-10-25T12:00:00Z");
      db =
        backend === "local SQLite"
          ? new SpaceRepository(join(directory, "spaces.sqlite"), () => clock)
          : new RemoteSpaceRepository(
              createClient({ url: `file:${join(directory, "remote.sqlite")}` }),
              () => clock,
            );
    });
    afterEach(() => {
      db.close();
      rmSync(directory, { recursive: true, force: true });
    });

    it("registers, signs in on a second device and sees the same spaces", async () => {
      const phoneA = new Browser(),
        phoneB = new Browser("198.51.100.7");
      expect((await phoneA.register("Priya@Example.test", "Priya")).status).toBe(201);
      expect((await phoneA.create("Priya")).status).toBe(201);
      expect((await phoneB.account()).body.account).toBeNull();
      expect((await phoneB.login("priya@example.test")).status).toBe(200);
      const me = await phoneB.account();
      expect(me.body.account).toMatchObject({ email: "priya@example.test", name: "Priya" });
      const read = await phoneB.spaces();
      expect(read.status).toBe(200);
      expect(read.body.spaces).toHaveLength(1);
    });

    it("rejects duplicate emails, short passwords and signed-out create or join", async () => {
      const browser = new Browser();
      await browser.register("a@example.test");
      expect((await new Browser().register("A@example.test")).status).toBe(409);
      const weak = await new Browser().register("b@example.test", "B", "short");
      expect(weak.status).toBe(400);
      expect(weak.body.error).toContain("at least 10 characters");
      expect((await new Browser().create()).status).toBe(401);
      expect(
        (await new Browser().call({ op: "join", token: "a".repeat(64), name: "X", adult: true }))
          .status,
      ).toBe(401);
    });

    it("gives the same answer for an unknown email and a wrong password", async () => {
      await new Browser().register("known@example.test");
      const unknown = await new Browser("192.0.2.10").login("nobody@example.test");
      const wrong = await new Browser("192.0.2.11").login("known@example.test", "wrong password!!");
      expect(unknown.status).toBe(401);
      expect(wrong.status).toBe(401);
      expect(unknown.body.error).toBe(wrong.body.error);
    });

    it("sign out ends the server session and keeps the data", async () => {
      const browser = new Browser();
      await browser.register("leave@example.test");
      await browser.create();
      const stolen = browser.cookie;
      expect((await browser.logout()).status).toBe(200);
      expect((await browser.account()).body.account).toBeNull();
      expect((await browser.spaces()).status).toBe(401);
      // Replaying the old cookie after sign-out gets nothing.
      const replay = new Browser();
      replay.jar.set("boundsome_auth", stolen.split("boundsome_auth=")[1]!.split(";")[0]!);
      expect((await replay.spaces()).status).toBe(401);
      await browser.login("leave@example.test");
      expect((await browser.spaces()).body.spaces).toHaveLength(1);
    });

    it("slows one IP that sprays many emails, whatever the email", async () => {
      await new Browser().register("victim@example.test");
      const attacker = new Browser("192.0.2.66");
      for (let i = 0; i < IP_FAILURE_LIMIT; i++)
        expect((await attacker.login(`guess${i}@example.test`, "wrong password!!")).status).toBe(
          401,
        );
      const blocked = await attacker.login("victim@example.test");
      expect(blocked.status).toBe(429);
      expect(blocked.response.headers.get("retry-after")).toBeTruthy();
    });

    it("never lets other IPs lock the real owner out", async () => {
      await new Browser().register("owner@example.test");
      for (let i = 0; i < 40; i++)
        await new Browser(`192.0.2.${i + 1}`).login("owner@example.test", "wrong password!!");
      expect((await new Browser("203.0.113.200").login("owner@example.test")).status).toBe(200);
    });

    it("grows the delay for repeated failures from the same email and IP", async () => {
      await new Browser().register("slow@example.test");
      const browser = new Browser("192.0.2.77");
      await browser.login("slow@example.test", "wrong password!!");
      await browser.login("slow@example.test", "wrong password!!");
      expect((await browser.login("slow@example.test")).status).toBe(429);
      clock = new Date(clock.valueOf() + 2_000);
      expect((await browser.login("slow@example.test")).status).toBe(200);
    });

    it("claims old browser spaces only after a successful login", async () => {
      await new Browser().register("claim@example.test");
      const browser = new Browser();
      const spaceId = await legacySpace(browser);
      expect((await browser.account()).body.legacySpaces).toBe(1);
      // A failed login claims nothing; the old cookie still works.
      expect((await browser.login("claim@example.test", "wrong password!!")).status).toBe(401);
      expect((await browser.spaces()).status).toBe(200);
      clock = new Date(clock.valueOf() + 2_000);
      const ok = await browser.login("claim@example.test");
      expect(ok.body.claimed).toBe(1);
      expect(browser.jar.has("nocturne_member")).toBe(false);
      const read = await browser.spaces();
      expect(read.body.spaces.map((s: { id: string }) => s.id)).toEqual([spaceId]);
    });

    it("never moves a membership that another account already claimed", async () => {
      const first = new Browser();
      const spaceId = await legacySpace(first);
      const oldCookie = first.jar.get("nocturne_member")!;
      expect((await first.register("first@example.test")).body.claimed).toBe(1);
      // Someone presents the same old cookie while registering a second account.
      const second = new Browser("198.51.100.9");
      second.jar.set("nocturne_member", oldCookie);
      expect((await second.register("second@example.test")).body.claimed).toBe(0);
      expect((await second.spaces()).status).toBe(401);
      // The old cookie alone no longer opens it either.
      const bare = new Browser();
      bare.jar.set("nocturne_member", oldCookie);
      expect((await bare.spaces()).status).toBe(401);
      expect((await first.spaces()).body.spaces.map((s: { id: string }) => s.id)).toEqual([
        spaceId,
      ]);
    });

    it("ignores a forged cookie that tries to name an account", async () => {
      const owner = new Browser();
      const registered = await owner.register("owner2@example.test");
      await owner.create();
      const forger = new Browser();
      forger.jar.set("nocturne_member", `acct:${registered.body.account.id}`);
      forger.jar.set("boundsome_auth", `acct:${registered.body.account.id}`);
      expect((await forger.spaces()).status).toBe(401);
    });

    it("changes the password and signs out other devices only", async () => {
      const phone = new Browser(),
        laptop = new Browser("198.51.100.20");
      await phone.register("pw@example.test");
      await laptop.login("pw@example.test");
      const wrong = await phone.call({
        op: "auth.password",
        current: "not my password",
        next: "a brand new password",
      });
      expect(wrong.status).toBe(401);
      clock = new Date(clock.valueOf() + 2_000);
      const changed = await phone.call({
        op: "auth.password",
        current: PASSWORD,
        next: "a brand new password",
      });
      expect(changed.status).toBe(200);
      expect((await phone.account()).body.account).not.toBeNull();
      expect((await laptop.account()).body.account).toBeNull();
      expect((await new Browser("198.51.100.30").login("pw@example.test")).status).toBe(401);
      expect(
        (await new Browser("198.51.100.31").login("pw@example.test", "a brand new password"))
          .status,
      ).toBe(200);
    });

    it("leaves the members table in the shape older deployments still write", async () => {
      await new Browser().register("compat@example.test");
      const raw = createClient({
        url: `file:${join(directory, backend === "local SQLite" ? "spaces.sqlite" : "remote.sqlite")}`,
      });
      const columns = await raw.execute("PRAGMA table_info(members)");
      expect(columns.rows.map((row) => row["name"])).toEqual([
        "session_hash",
        "space_id",
        "role",
        "expires",
      ]);
      raw.close();
    });

    it("renames the account", async () => {
      const browser = new Browser();
      await browser.register("name@example.test", "Old");
      const renamed = await browser.call({ op: "auth.rename", name: "New name" });
      expect(renamed.body.account.name).toBe("New name");
      expect((await browser.account()).body.account.name).toBe("New name");
    });
  });
}
