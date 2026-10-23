import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

const directory = await mkdtemp(join(tmpdir(), "nocturne-browser-"));
const port = 4180,
  origin = `http://127.0.0.1:${port}`;
let logs = "",
  browser;
const server = spawn(process.execPath, [".output/server/index.mjs"], {
  env: {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: String(port),
    NOCTURNE_DB_PATH: join(directory, "spaces.sqlite"),
  },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", (value) => {
  logs += value;
});
server.stderr.on("data", (value) => {
  logs += value;
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null) throw new Error(`Production server exited: ${logs}`);
    try {
      const response = await fetch(`${origin}/api/space`);
      if (response.status === 401) {
        ready = true;
        break;
      }
    } catch {
      /* server is still starting */
    }
    await delay(250);
  }
  assert.ok(ready, `Shared API did not start: ${logs}`);
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const ownerContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    timezoneId: "Asia/Kolkata",
  });
  const guestContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    timezoneId: "Australia/Sydney",
  });
  const owner = await ownerContext.newPage(),
    guest = await guestContext.newPage();
  const errors = [];
  for (const page of [owner, guest]) page.on("pageerror", (error) => errors.push(error.message));
  owner.setDefaultTimeout(15_000);
  guest.setDefaultTimeout(15_000);
  await owner.goto(origin);
  await owner.getByLabel("Your name", { exact: true }).fill("Demo Maya");
  await owner.getByRole("checkbox").check();
  await owner.getByRole("button", { name: "Create my space", exact: true }).click();
  await owner.getByRole("heading", { name: "Your space is ready", exact: true }).waitFor();
  const invitation = await owner.getByLabel("Share this invitation", { exact: true }).inputValue();
  assert.ok(
    invitation.startsWith(`${origin}/#invite=`),
    "Expected a real shareable invitation link",
  );
  assert.equal(new URL(invitation).search, "");
  await owner.reload();
  await owner.getByRole("heading", { name: "Your space is ready", exact: true }).waitFor();
  assert.equal(
    await owner.getByLabel("Share this invitation", { exact: true }).inputValue(),
    invitation,
  );
  console.log("PASS browser: create, invitation and creator reload");
  await guest.goto(invitation);
  await guest.getByText("Demo Maya invited you to join as Sub.", { exact: true }).waitFor();
  await guest.getByLabel("Your name", { exact: true }).fill("Demo Aria");
  await guest.getByRole("checkbox").check();
  await guest.getByRole("button", { name: "Join space", exact: true }).click();
  await guest.getByRole("heading", { name: "You're connected", exact: true }).waitFor();
  await owner.getByRole("heading", { name: "You're connected", exact: true }).waitFor();
  assert.equal(new URL(guest.url()).hash, "", "Redeemed invitation must leave the address bar");
  assert.ok(
    (await guest.getByText("Demo Maya and Demo Aria share this space.", { exact: true }).count()) >
      0,
  );
  assert.ok(
    await guest.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    "Mobile page overflows horizontally",
  );
  console.log("PASS browser: second isolated browser joins the same space on mobile");
  await guest.reload();
  await guest.getByRole("heading", { name: "Your routine, Demo Aria", exact: true }).waitFor();
  await guest.goto(`${origin}/settings`);
  assert.equal(
    await guest.getByRole("radiogroup", { name: "Preview as" }).count(),
    0,
    "A member must not be able to switch live roles",
  );
  await guest.getByLabel("Your name", { exact: true }).fill("Demo Aria Updated");
  await guest.getByRole("button", { name: "Update my name", exact: true }).click();
  await owner
    .getByText("Demo Maya and Demo Aria Updated share this space.", { exact: true })
    .waitFor();
  console.log("PASS browser: member reload, fixed role and shared name update");
  await owner.goto(`${origin}/routines`);
  await owner.getByRole("button", { name: "New routine", exact: true }).click();
  await owner.getByLabel("Title", { exact: true }).fill("Browser test routine");
  await owner.getByLabel("Instructions", { exact: true }).fill("A short text check-in.");
  await owner.getByRole("button", { name: "Save", exact: true }).click();
  await owner.getByText("Browser test routine", { exact: true }).waitFor();
  await guest.goto(`${origin}/routines`);
  await guest.getByText("Browser test routine", { exact: true }).waitFor();
  assert.equal(await guest.getByRole("button", { name: "New routine", exact: true }).count(), 0);
  for (const page of [owner, guest]) {
    await page.goto(`${origin}/agreements`);
    await page.getByRole("button", { name: "I acknowledge this agreement", exact: true }).click();
    await page.getByRole("button", { name: "You've acknowledged", exact: true }).waitFor();
  }
  await guest.goto(`${origin}/today`);
  const task = guest
    .locator("li")
    .filter({ has: guest.getByRole("heading", { name: "Browser test routine", exact: true }) });
  await task.getByRole("button", { name: "Submit check-in", exact: true }).click();
  await guest
    .getByLabel("Your check-in", { exact: true })
    .fill("Completed the shared browser task.");
  await guest.getByRole("button", { name: "Submit for review", exact: true }).click();
  await task.getByText("Awaiting review", { exact: true }).waitFor();
  await owner.goto(`${origin}/proof`);
  await owner.getByRole("button", { name: "Accept check-in", exact: true }).click();
  await owner.getByText("No check-ins awaiting review.", { exact: true }).waitFor();
  await guest.reload();
  await guest.getByText("Completed", { exact: true }).waitFor();
  console.log(
    "PASS browser: independent agreement acknowledgements and shared-day submission/review across timezones",
  );
  await owner.goto(`${origin}/notes`);
  await owner
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("Shared browser check-in");
  await owner.getByRole("button", { name: "Send", exact: true }).click();
  await owner.getByText("Shared browser check-in", { exact: true }).waitFor();
  await guest.goto(`${origin}/notes`);
  await guest.getByText("Shared browser check-in", { exact: true }).waitFor();
  console.log("PASS browser: shared routine and note, with member permissions");
  await guest.getByRole("button", { name: "RED — stop now", exact: true }).click();
  await guest.getByText("Paused. Your space is read-only.", { exact: true }).waitFor();
  await owner.getByText("Paused. Your space is read-only.", { exact: true }).waitFor();
  assert.equal(
    await owner.getByRole("textbox", { name: "Message", exact: true }).isDisabled(),
    true,
  );
  for (const [page, message] of [
    [owner, "Let's discuss the timing."],
    [guest, "Agreed; I am comfortable with that."],
  ]) {
    await page.goto(`${origin}/discussion`);
    await page.getByLabel("Your message", { exact: true }).fill(message);
    await page.getByRole("button", { name: "Send discussion message", exact: true }).click();
    await page.getByText(message, { exact: true }).waitFor();
  }
  await guest.getByRole("button", { name: "We've discussed — I'm ready", exact: true }).click();
  await guest.getByRole("button", { name: "Waiting for partner", exact: true }).waitFor();
  await owner.getByText("Demo Aria Updated: ready", { exact: false }).waitFor();
  await owner.getByRole("button", { name: "We've discussed — I'm ready", exact: true }).click();
  await owner.getByRole("button", { name: "RED — stop now", exact: true }).waitFor();
  await guest.getByRole("button", { name: "RED — stop now", exact: true }).waitFor();
  console.log(
    "PASS browser: stop propagates to both sessions; discussion and mutual readiness resume",
  );
  const outsider = await browser.newContext();
  const third = await outsider.newPage();
  await third.goto(invitation);
  await third.getByRole("alert").filter({ hasText: "invalid, expired or already used" }).waitFor();
  assert.equal(
    await third.getByRole("button", { name: "Join space", exact: true }).isDisabled(),
    true,
  );
  console.log("PASS browser: used invitation cannot admit a third person");
  const failureContext = await browser.newContext();
  const failurePage = await failureContext.newPage();
  await failurePage.route("**/api/space", async (route) => {
    if (route.request().method() === "POST" && route.request().postDataJSON()?.op === "create")
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Test connection unavailable. Retry creation." }),
      });
    else await route.continue();
  });
  await failurePage.goto(origin);
  await failurePage.getByLabel("Your name", { exact: true }).fill("Demo Retry");
  await failurePage.getByRole("checkbox").check();
  await failurePage.getByRole("button", { name: "Create my space", exact: true }).click();
  await failurePage.getByRole("alert").filter({ hasText: "Test connection unavailable" }).waitFor();
  assert.equal(new URL(failurePage.url()).pathname, "/");
  assert.equal(
    await failurePage.getByLabel("Your name", { exact: true }).inputValue(),
    "Demo Retry",
  );
  assert.equal(await failurePage.getByLabel("Share this invitation", { exact: true }).count(), 0);
  await failurePage.unroute("**/api/space");
  await failurePage.getByRole("button", { name: "Create my space", exact: true }).click();
  await failurePage.getByRole("heading", { name: "Your space is ready", exact: true }).waitFor();
  console.log("PASS browser: a failed create preserves the form and retries without false success");
  assert.deepEqual(errors, [], `Browser runtime errors: ${errors.join("; ")}`);
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await new Promise((resolve) => {
    if (server.exitCode !== null) resolve();
    else server.once("exit", resolve);
  });
  await rm(directory, { recursive: true, force: true });
}
