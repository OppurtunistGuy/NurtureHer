// Test-only: one simulated browser with its own cookie jar and IP, calling the real API handler.
import { handleSpaceRequest } from "./space-api.server";
import type { SpaceStorage } from "./remote-storage.server";
import type { SpaceSnapshot } from "./space-protocol";

export const PASSWORD = "correct horse battery";

export class ApiBrowser {
  jar = new Map<string, string>();
  snapshot?: SpaceSnapshot;
  constructor(
    private storage: () => SpaceStorage,
    public ip = "203.0.113.1",
  ) {}
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
      this.storage(),
    );
    for (const header of response.headers.getSetCookie()) {
      const [pair, ...attributes] = header.split(";");
      const [key, ...rest] = pair!.split("=");
      if (attributes.some((a) => a.trim() === "Max-Age=0")) this.jar.delete(key!);
      else this.jar.set(key!, rest.join("="));
    }
    const value = await response.json();
    if (value?.state) this.snapshot = value as SpaceSnapshot;
    return { status: response.status, body: value, response };
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
  dashboard() {
    return this.call(undefined, "?dashboard=1");
  }
  open(spaceId?: string) {
    return this.call(undefined, spaceId ? `?space=${spaceId}` : "");
  }
  create(name = "Maya", role: "dom" | "sub" = "dom") {
    return this.call({ op: "create", name, role, adult: true, timeZone: "Asia/Kolkata" });
  }
  join(token: string, name = "Aria") {
    return this.call({ op: "join", token, name, adult: true });
  }
  /** Sends a command to one relationship, using its latest revision. */
  async command(spaceId: string, command: Record<string, unknown>) {
    const current = await this.open(spaceId);
    return this.call({
      op: "command",
      spaceId,
      revision: current.body.revision,
      command,
    });
  }
}
