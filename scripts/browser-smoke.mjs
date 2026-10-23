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
    TELEGRAM_BOT_USERNAME: "nocturne_browser_test_bot",
    TELEGRAM_WEBHOOK_SECRET: "browser-test-secret-with-at-least-32-characters",
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
  for (const page of [owner, guest])
    page.on("pageerror", (error) =>
      errors.push(`${new URL(page.url()).pathname}: ${error.message}`),
    );
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
  // Mock only the external AI response; exercise review/edit/save in the real browser.
  await owner.goto(`${origin}/routines`);
  await owner.getByText("Draft a routine with AI", { exact: true }).click();
  await owner
    .getByLabel("Describe the routine", { exact: true })
    .fill("A short daily evening reflection");
  await owner.route("**/api/space", async (route) => {
    if (route.request().method() === "POST" && route.request().postDataJSON()?.op === "draft")
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          routine: {
            id: "browser-ai-draft",
            title: "Draft evening reflection",
            instructions: "Write one sentence.",
            windowStart: "18:00",
            windowEnd: "20:00",
            recurrence: { kind: "daily" },
            reminderMinutes: 10,
            enabled: true,
            requiresAck: false,
            optInDaily: false,
            proof: "text",
          },
        }),
      });
    else await route.continue();
  });
  await owner.getByRole("button", { name: "Generate editable draft", exact: true }).click();
  await owner.getByLabel("Title", { exact: true }).waitFor();
  assert.equal(
    await owner.getByLabel("Title", { exact: true }).inputValue(),
    "Draft evening reflection",
  );
  await guest.goto(`${origin}/routines`);
  assert.equal(
    await guest.getByText("Draft evening reflection", { exact: true }).count(),
    0,
    "AI draft must remain unsaved",
  );
  await owner.getByLabel("Title", { exact: true }).fill("Telegram browser routine");
  await owner.getByRole("button", { name: "Save", exact: true }).click();
  await owner.getByText("Telegram browser routine", { exact: true }).waitFor();
  await owner.unroute("**/api/space");
  console.log("PASS browser: mocked AI draft stays editable and unsaved until explicit Save");
  const links = [];
  for (const page of [owner, guest]) {
    await page.goto(`${origin}/proof`);
    await page.getByText("Telegram proof collection", { exact: true }).click();
    await page
      .getByLabel("Routine for this receipt", { exact: true })
      .selectOption({ label: "Telegram browser routine" });
    await page.getByRole("button", { name: "Get my Telegram link", exact: true }).click();
    const anchor = page.getByRole("link", { name: "Open my private bot link", exact: true });
    await anchor.waitFor();
    links.push(await anchor.getAttribute("href"));
  }
  const telegram = async (user, text, id) => {
    const response = await fetch(`${origin}/api/space/telegram`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": "browser-test-secret-with-at-least-32-characters",
      },
      body: JSON.stringify({
        update_id: id,
        message: { from: { id: user }, chat: { id: user, type: "private" }, text },
      }),
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  const masterStart = await telegram(
    101,
    `/start ${new URL(links[0]).searchParams.get("start")}`,
    1,
  );
  await telegram(202, `/start ${new URL(links[1]).searchParams.get("start")}`, 2);
  const ticket = /Record ([a-f0-9-]{36})/.exec(masterStart.text)[1];
  assert.ok((await telegram(101, `/yes ${ticket}`, 3)).text.includes("Waiting"));
  assert.ok(
    (await telegram(202, `/yes ${ticket}`, 4)).text.includes("Proof submitted successfully"),
  );
  await owner
    .getByText("Proof submitted successfully · Master yes · Sub yes", { exact: true })
    .waitFor();
  await guest
    .getByText("Proof submitted successfully · Master yes · Sub yes", { exact: true })
    .waitFor();
  console.log(
    "PASS browser: authenticated test Telegram updates synchronize a receipt after both confirmations",
  );
  const firstId = await owner.getByLabel("Active space", { exact: true }).inputValue();
  await owner.getByRole("link", { name: "Add a space", exact: true }).click();
  await owner.getByLabel("Your name", { exact: true }).fill("Demo Maya Second");
  await owner.getByRole("checkbox").check();
  await owner.getByRole("button", { name: "Create my space", exact: true }).click();
  await owner.getByRole("heading", { name: "Your space is ready", exact: true }).waitFor();
  const secondInvitation = await owner
    .getByLabel("Share this invitation", { exact: true })
    .inputValue();
  const secondContext = await browser.newContext();
  const secondPartner = await secondContext.newPage();
  secondPartner.on("pageerror", (error) => errors.push(error.message));
  await secondPartner.goto(secondInvitation);
  await secondPartner.getByLabel("Your name", { exact: true }).fill("Demo Second Sub");
  await secondPartner.getByRole("checkbox").check();
  await secondPartner.getByRole("button", { name: "Join space", exact: true }).click();
  await secondPartner.getByRole("heading", { name: "You're connected", exact: true }).waitFor();
  const secondId = await owner.getByLabel("Active space", { exact: true }).inputValue();
  assert.notEqual(firstId, secondId);
  await owner.goto(`${origin}/routines`);
  assert.equal(await owner.getByText("Browser test routine", { exact: true }).count(), 0);
  await owner.getByRole("button", { name: "New routine", exact: true }).click();
  await owner.getByLabel("Title", { exact: true }).fill("Unsaved other-space draft");
  await owner.getByLabel("Active space", { exact: true }).selectOption(firstId);
  await owner.getByText("Browser test routine", { exact: true }).waitFor();
  assert.equal(
    await owner.getByLabel("Title", { exact: true }).count(),
    0,
    "Space switch must discard the other space's editor",
  );
  await owner.reload();
  await owner.getByText("Browser test routine", { exact: true }).waitFor();
  assert.equal(await owner.getByLabel("Active space", { exact: true }).inputValue(), firstId);
  const tab = await ownerContext.newPage();
  tab.on("pageerror", (error) => errors.push(error.message));
  await tab.goto(`${origin}/routines`);
  await tab.getByLabel("Active space", { exact: true }).selectOption(secondId);
  await tab.getByRole("button", { name: "New routine", exact: true }).waitFor();
  assert.equal(
    await owner.getByLabel("Active space", { exact: true }).inputValue(),
    firstId,
    "Another tab must not change this tab's selection",
  );
  await owner.getByRole("button", { name: "RED — stop now", exact: true }).click();
  await owner.getByText("Paused. Your space is read-only.", { exact: true }).waitFor();
  await tab.getByRole("button", { name: "New routine", exact: true }).click();
  await tab.getByLabel("Title", { exact: true }).fill("Second space unaffected");
  await tab.getByRole("button", { name: "Save", exact: true }).click();
  await tab.getByText("Second space unaffected", { exact: true }).waitFor();
  await owner.getByLabel("Active space", { exact: true }).selectOption(secondId);
  await owner.getByText("Second space unaffected", { exact: true }).waitFor();
  assert.equal(
    await owner.getByText("Paused. Your space is read-only.", { exact: true }).count(),
    0,
  );
  await owner.getByLabel("Active space", { exact: true }).selectOption(firstId);
  await owner.getByText("Paused. Your space is read-only.", { exact: true }).waitFor();
  assert.equal(
    await secondPartner.getByLabel("Active space", { exact: true }).locator("option").count(),
    1,
  );
  console.log(
    "PASS browser: multiple Subs, per-tab selection, draft reset, reload persistence and isolated pauses",
  );
  // The existing Sub joins another Master without leaving the first relationship.
  await failurePage.goto(`${origin}/settings`);
  const thirdInvitation = await failurePage
    .getByLabel("Share this invitation", { exact: true })
    .inputValue();
  await guest.goto(thirdInvitation);
  await guest.getByLabel("Your name", { exact: true }).fill("Demo Aria Other");
  await guest.getByRole("checkbox").check();
  await guest.getByRole("button", { name: "Join space", exact: true }).click();
  await guest.getByRole("heading", { name: "You're connected", exact: true }).waitFor();
  assert.equal(
    await guest.getByLabel("Active space", { exact: true }).locator("option").count(),
    2,
  );
  await guest.getByLabel("Active space", { exact: true }).selectOption(firstId);
  await guest.getByText("Paused. Your space is read-only.", { exact: true }).waitFor();
  console.log(
    "PASS browser: a Sub can join multiple Masters and preserve the original relationship",
  );
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
