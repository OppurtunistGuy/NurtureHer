import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

const PASSWORD = "correct horse battery";
/** Registers a fresh account from the signed-out setup screen. */
async function signUp(page, name, email) {
  await page.getByRole("button", { name: "Create account", exact: true }).first().click();
  await page.getByLabel("Your name", { exact: true }).fill(name);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("checkbox").check();
  await page.locator('form button[type="submit"]').click();
  await page.getByRole("heading", { name: "Create your account", exact: true }).waitFor({
    state: "detached",
  });
}
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
  await owner.getByRole("heading", { name: "Welcome back", exact: true }).waitFor();
  assert.equal(
    await owner.getByRole("button", { name: "Create my space", exact: true }).count(),
    0,
    "Signed-out visitors must not be offered shared creation",
  );
  await signUp(owner, "Demo Maya", "maya@e2e.test");
  // A new account with no relationships lands on an empty dashboard.
  await owner.getByRole("heading", { name: "No Subs yet", exact: true }).waitFor();
  await owner.goto(`${origin}/#setup`);
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
  await guest
    .getByText("Demo Maya invited you to join as Sub. Log in or create an account to accept.", {
      exact: true,
    })
    .waitFor();
  await signUp(guest, "Demo Aria", "aria@e2e.test");
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
  await owner.getByRole("button", { name: /^(Assign to|Save for) / }).click();
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
  await owner.getByRole("button", { name: /^Accept .*check-in$/ }).click();
  await owner.getByText("No check-ins awaiting review.", { exact: true }).waitFor();
  await guest.reload();
  await guest.getByText("Completed", { exact: true }).waitFor();
  console.log(
    "PASS browser: independent agreement acknowledgements and shared-day submission/review across timezones",
  );
  await owner.goto(`${origin}/points`);
  await owner.getByLabel("Points (1–100)", { exact: true }).fill("50");
  await owner
    .getByLabel("Reason visible to both people", { exact: true })
    .fill("Recognising reviewed effort");
  await owner.getByRole("button", { name: /^Record (for |points)/ }).click();
  await owner.getByText("+50 reward points", { exact: true }).waitFor();
  await guest.goto(`${origin}/points`);
  await guest.getByText("+50 reward points", { exact: true }).waitFor();
  assert.equal(await guest.getByRole("button", { name: /^Record (for |points)/ }).count(), 0);
  await owner.reload();
  await owner.getByText("+50 reward points", { exact: true }).waitFor();
  await owner.getByRole("button", { name: "Reverse entry", exact: true }).click();
  await owner.getByLabel("Why reverse this entry?", { exact: true }).fill("Test correction");
  await owner.getByRole("button", { name: "Confirm reversal", exact: true }).click();
  await owner.getByText("Reversed", { exact: true }).waitFor();
  await guest.reload();
  await guest.getByText("Reversed", { exact: true }).waitFor();
  console.log(
    "PASS browser: shared points, Sub read-only access, persistence and audited reversal",
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
    // The message can render twice for a moment while the poll and the send both land.
    await page.getByText(message, { exact: true }).first().waitFor();
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
  await signUp(third, "Demo Outsider", "outsider@e2e.test");
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
  await signUp(failurePage, "Demo Retry", "retry@e2e.test");
  await failurePage.getByRole("heading", { name: "No Subs yet", exact: true }).waitFor();
  await failurePage.goto(`${origin}/#setup`);
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
  await owner.getByRole("switch", { name: "Verify on Telegram", exact: true }).click();
  await owner.getByLabel("Reward points when both say yes (0–100)", { exact: true }).fill("10");
  await owner.getByRole("button", { name: /^(Assign to|Save for) / }).click();
  await owner.getByText("Telegram browser routine", { exact: true }).waitFor();
  await owner.unroute("**/api/space");
  console.log("PASS browser: mocked AI draft stays editable and unsaved until explicit Save");
  const links = [];
  for (const page of [owner, guest]) {
    await page.goto(`${origin}/proof`);
    await page.getByText("Telegram verification", { exact: true }).click();
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
  const ticket = /Reference ([a-f0-9-]{36})/.exec(masterStart.text)[1];
  assert.ok((await telegram(101, `/yes ${ticket}`, 3)).text.includes("Nothing is completed yet"));
  assert.ok((await telegram(202, `/yes ${ticket}`, 4)).text.includes("marked completed"));
  await owner.getByText(/^Verified by both · completed/).waitFor();
  await guest.getByText(/^Verified by both · completed/).waitFor();
  console.log("PASS browser: both Telegram yeses complete the task and show on both devices");
  const firstId = await owner.getByLabel("Active space", { exact: true }).inputValue();
  await owner.goto(`${origin}/#setup`);
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
  await signUp(secondPartner, "Demo Second Sub", "second@e2e.test");
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
  // Switching spaces with an unsaved editor asks first; Keep editing stays put.
  await owner.getByLabel("Active space", { exact: true }).selectOption(firstId);
  await owner
    .getByRole("alertdialog")
    .getByText("You have unsaved changes for Demo Second Sub")
    .waitFor();
  await owner.getByRole("button", { name: "Keep editing", exact: true }).click();
  assert.equal(
    await owner.getByLabel("Title", { exact: true }).inputValue(),
    "Unsaved other-space draft",
    "Keep editing must keep the draft",
  );
  await owner.getByLabel("Active space", { exact: true }).selectOption(firstId);
  await owner.getByRole("button", { name: "Discard", exact: true }).click();
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
  await tab.getByRole("button", { name: /^(Assign to|Save for) / }).click();
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
  // The Master's dashboard shows both Subs, with the paused one found by its filter.
  await owner.goto(`${origin}/dashboard`);
  await owner.getByRole("heading", { name: "All Subs", exact: true }).waitFor();
  await owner.getByRole("button", { name: "Open Demo Aria Updated", exact: true }).waitFor();
  await owner.getByRole("button", { name: "Open Demo Second Sub", exact: true }).waitFor();
  await owner.getByRole("button", { name: "Paused", exact: true }).click();
  await owner.getByRole("button", { name: "Open Demo Aria Updated", exact: true }).waitFor();
  assert.equal(
    await owner.getByRole("button", { name: "Open Demo Second Sub", exact: true }).count(),
    0,
    "Paused filter must hide the unpaused relationship",
  );
  await owner.getByRole("button", { name: "All", exact: true }).click();
  await owner.getByLabel("Search by name", { exact: true }).fill("second");
  assert.equal(
    await owner.getByRole("button", { name: "Open Demo Aria Updated", exact: true }).count(),
    0,
  );
  // A Sub's dashboard lists only their own Masters, never the Master's other Subs.
  await secondPartner.goto(`${origin}/dashboard`);
  await secondPartner.getByRole("heading", { name: "My Masters", exact: true }).waitFor();
  assert.equal(await secondPartner.getByText("Demo Aria", { exact: false }).count(), 0);
  console.log("PASS browser: dashboard cards, filters, search and Sub-side isolation");
  // Phase 3: one Master manages two Subs from their profiles without signing out.
  const contextFor = async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const api = async (data, query = "") => {
      const response = data
        ? await context.request.post(`${origin}/api/space${query}`, { headers: { origin }, data })
        : await context.request.get(`${origin}/api/space${query}`);
      return response.json();
    };
    const command = async (spaceId, value) => {
      const current = await api(null, `?space=${spaceId}`);
      return api({ op: "command", spaceId, revision: current.revision, command: value });
    };
    return { context, api, command };
  };
  const register = (person, name, email) =>
    person.api({ op: "auth.register", name, email, password: PASSWORD, adult: true });
  const nina = await contextFor(),
    tara = await contextFor(),
    uma = await contextFor();
  await register(nina, "Demo Nina", "nina@e2e.test");
  await register(tara, "Demo Tara", "tara@e2e.test");
  await register(uma, "Demo Uma", "uma@e2e.test");
  const pairWith = async (sub, name) => {
    const created = await nina.api({ op: "create", name: "Demo Nina", role: "dom", adult: true });
    const id = created.state.space.id;
    await sub.api({ op: "join", token: created.invite.token, name, adult: true });
    await nina.command(id, { type: "agreement.ack" });
    await sub.command(id, { type: "agreement.ack" });
    return id;
  };
  const taraId = await pairWith(tara, "Demo Tara"),
    umaId = await pairWith(uma, "Demo Uma");
  await nina.command(umaId, {
    type: "routine.save",
    routine: {
      id: "uma-reading",
      title: "Uma reading",
      instructions: "One paragraph.",
      recurrence: { kind: "daily" },
      windowStart: "00:00",
      windowEnd: "23:59",
      reminderMinutes: null,
      enabled: true,
      requiresAck: false,
      optInDaily: false,
      proof: "text",
      revision: 1,
    },
  });
  await uma.command(umaId, { type: "submission", id: "uma-reading", text: "Read chapter two." });
  const manager = await nina.context.newPage();
  manager.on("pageerror", (error) => errors.push(error.message));
  await manager.goto(`${origin}/dashboard`);
  await manager.getByRole("button", { name: "Open Demo Tara", exact: true }).click();
  await manager.waitForURL(`**/subs/${taraId}/overview`);
  assert.equal(await manager.getByLabel("Switch Sub", { exact: true }).inputValue(), taraId);
  await manager.getByRole("link", { name: "Routines and tasks", exact: true }).click();
  await manager.waitForURL(`**/subs/${taraId}/routines`);
  await manager.getByRole("button", { name: "New routine", exact: true }).click();
  await manager.getByLabel("Title", { exact: true }).fill("Tara only routine");
  await manager.getByRole("button", { name: "Assign to Demo Tara", exact: true }).click();
  await manager.getByText("Tara only routine", { exact: true }).waitFor();
  // An unfinished edit is protected when switching Sub.
  await manager.getByRole("button", { name: "New routine", exact: true }).click();
  await manager.getByLabel("Title", { exact: true }).fill("Half typed for Tara");
  await manager.getByLabel("Switch Sub", { exact: true }).selectOption(umaId);
  await manager.getByText("You have unsaved changes for Demo Tara", { exact: true }).waitFor();
  await manager.getByRole("button", { name: "Keep editing", exact: true }).click();
  assert.ok(manager.url().endsWith(`/subs/${taraId}/routines`), "Keep editing must stay on Tara");
  assert.equal(
    await manager.getByLabel("Title", { exact: true }).inputValue(),
    "Half typed for Tara",
  );
  await manager.getByLabel("Switch Sub", { exact: true }).selectOption(umaId);
  await manager.getByRole("button", { name: "Discard", exact: true }).click();
  await manager.waitForURL(`**/subs/${umaId}/routines`);
  await manager.getByText("Uma reading", { exact: true }).waitFor();
  assert.equal(await manager.getByText("Tara only routine", { exact: true }).count(), 0);
  assert.equal(await manager.getByText("Half typed for Tara", { exact: true }).count(), 0);
  await manager.getByRole("link", { name: "Submissions", exact: true }).click();
  await manager.waitForURL(`**/subs/${umaId}/submissions`);
  await manager.getByRole("button", { name: "Accept Demo Uma's check-in", exact: true }).click();
  await manager.getByText("Review decision recorded", { exact: true }).waitFor();
  const taraState = (await nina.api(null, `?space=${taraId}`)).state;
  const umaState = (await nina.api(null, `?space=${umaId}`)).state;
  assert.ok(taraState.routines.some((r) => r.title === "Tara only routine"));
  assert.ok(!umaState.routines.some((r) => r.title === "Tara only routine"));
  assert.equal(umaState.submissions[0].status, "accepted");
  assert.equal(
    (await nina.api(null, "?account=1")).account.email,
    "nina@e2e.test",
    "Switching Subs must keep the same signed-in account",
  );
  // Two tabs can hold two different Subs.
  const secondTab = await nina.context.newPage();
  await secondTab.goto(`${origin}/subs/${taraId}/routines`);
  await secondTab.getByText("Tara only routine", { exact: true }).waitFor();
  await manager.reload();
  await manager.getByLabel("Switch Sub", { exact: true }).waitFor();
  assert.equal(await manager.getByLabel("Switch Sub", { exact: true }).inputValue(), umaId);
  // Editing the URL never opens someone else's relationship.
  const umaPage = await uma.context.newPage();
  await umaPage.goto(`${origin}/subs/${taraId}/overview`);
  await umaPage.getByText("This relationship isn't available to you.", { exact: true }).waitFor();
  assert.equal(await umaPage.getByText("Demo Tara", { exact: false }).count(), 0);
  const taraPage = await tara.context.newPage();
  await taraPage.goto(`${origin}/subs/${taraId}/points`);
  await taraPage.waitForURL(`**/today`);
  console.log(
    "PASS browser: Master → Sub A assign → switch (with unsaved warning) → Sub B review; URL tampering refused",
  );
  // Sign out ends the session; signing back in on a new device restores every relationship.
  await guest.goto(`${origin}/today`);
  await guest.getByRole("button", { name: "Account menu for Demo Aria", exact: true }).click();
  await guest.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  await guest.getByRole("heading", { name: "Welcome back", exact: true }).waitFor();
  const stale = await guest.evaluate(async () => (await fetch("/api/space")).status);
  assert.equal(stale, 401, "A signed-out browser must not read any space");
  const laptopContext = await browser.newContext();
  const laptop = await laptopContext.newPage();
  laptop.on("pageerror", (error) => errors.push(error.message));
  await laptop.goto(origin);
  await laptop.getByLabel("Email", { exact: true }).fill("aria@e2e.test");
  await laptop.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await laptop.locator('form button[type="submit"]').click();
  // Wait for the login to finish before moving on, as a person would.
  await laptop.getByRole("heading", { name: "Welcome back", exact: true }).waitFor({
    state: "detached",
  });
  await laptop.goto(`${origin}/today`);
  await laptop.getByLabel("Active space", { exact: true }).waitFor();
  assert.equal(
    await laptop.getByLabel("Active space", { exact: true }).locator("option").count(),
    2,
  );
  console.log(
    "PASS browser: sign out ends the session; sign in on another device restores both relationships",
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
