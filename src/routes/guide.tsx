import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { AccountMenu } from "@/components/nocturne/AppShell";
import { FeedbackForm } from "@/components/nocturne/FeedbackForm";

export const Route = createFileRoute("/guide")({
  head: () => ({ meta: [{ title: "Guide — BoundSome" }] }),
  component: GuidePage,
});

function Steps({ children }: { children: ReactNode }) {
  return <ol className="list-decimal space-y-3 pl-5 text-sm leading-6">{children}</ol>;
}
function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-24 space-y-4">
      <h2 id={`${id}-heading`} className="text-2xl text-ivory">
        {title}
      </h2>
      {children}
    </section>
  );
}

function GuidePage() {
  // Opening /guide#feedback from the menu lands on the form.
  useEffect(() => {
    if (window.location.hash)
      document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
  }, []);
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/dashboard" className="text-sm text-gold underline">
            ← Dashboard
          </Link>
          <AccountMenu />
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-10 px-4 pb-16 pt-8">
        <div>
          <p className="eyebrow">Guide</p>
          <h1 className="mt-2 text-4xl text-ivory md:text-5xl">How BoundSome works</h1>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            A private space for two consenting adults: a Master and a Sub. The Master sets routines;
            the Sub checks in; both can pause or stop at any time. This takes about three minutes to
            read.
          </p>
          <nav aria-label="On this page" className="mt-4 flex flex-wrap gap-2 text-xs">
            {[
              ["start", "Getting in"],
              ["master", "If you're the Master"],
              ["sub", "If you're the Sub"],
              ["telegram", "Telegram check"],
              ["safety", "Pause, RED and YELLOW"],
              ["help", "Help"],
              ["feedback", "Send feedback"],
            ].map(([id, label]) => (
              <a key={id} href={`#${id}`} className="rounded-full border px-3 py-1 text-gold">
                {label}
              </a>
            ))}
          </nav>
        </div>

        <Section id="start" title="1. Getting in">
          <Steps>
            <li>
              BoundSome is invite-only for now. Open the invite link you were sent; it works once
              and expires after 7 days.
            </li>
            <li>
              Create your account: your name, email and a password of at least 10 characters.
              Confirm you are 18+.
            </li>
            <li>
              A Sub doesn't need a separate invite: the Master's link to their space is enough.
            </li>
          </Steps>
        </Section>

        <Section id="master" title="2. If you're the Master">
          <Steps>
            <li>
              On the <strong>Dashboard</strong>, choose <strong>Invite your first Sub</strong>. Copy
              the private link and send it to your Sub. It lets one person join and expires after 7
              days.
            </li>
            <li>
              Open your Sub's card and go to <strong>Agreement and limits</strong>. Write your
              agreement in your own words. New to this? Choose{" "}
              <strong>Start from a short template</strong> and make it yours. With a second Sub, you
              can copy your first agreement and change it for them. Each Sub has their own.
            </li>
            <li>
              Your Sub reads it and can suggest changes. Nothing starts until you both acknowledge
              it, and any change asks you both again.
            </li>
            <li>
              Go to <strong>Routines and tasks → New routine</strong>. Set a title, short
              instructions, the time window, how often it repeats and a reminder. Then choose{" "}
              <strong>Assign</strong>.
            </li>
            <li>
              <strong>Verify on Telegram</strong> is on by default. Set the reward points for when
              both of you say yes, and the punishment points plus a consequence for when it isn't
              done. You can turn verification off for a day off or an emergency.
            </li>
            <li>
              In <strong>Submissions</strong>, review check-ins: accept, ask for a revision, or
              reject.
            </li>
            <li>
              <strong>Points</strong> shows rewards and punishments. A punishment is never added
              automatically: you record it with one tap, and can reverse any entry with a reason.
            </li>
          </Steps>
        </Section>

        <Section id="sub" title="3. If you're the Sub">
          <Steps>
            <li>Open your Master's invite link, create your account and accept.</li>
            <li>
              Read the agreement your Master wrote and acknowledge it. Want something changed? Use{" "}
              <strong>Propose an addition</strong> on the agreement page. Nothing starts until you
              both have acknowledged.
            </li>
            <li>
              <strong>Today</strong> shows your tasks. Where asked, opt in or acknowledge first,
              then send your check-in within the time window.
            </li>
            <li>
              Use <strong>Requests</strong> to ask for a change, and <strong>Notes</strong> to talk
              privately with your Master.
            </li>
          </Steps>
        </Section>

        <Section id="telegram" title="4. The Telegram check">
          <Steps>
            <li>
              For a routine with Verify on Telegram, open{" "}
              <strong>Submissions → Telegram verification</strong>, choose the routine and tap{" "}
              <strong>Get my Telegram link</strong>.
            </li>
            <li>
              It opens our bot, @BoundSomeVerifyBot. Tap <strong>Start</strong>. Each of you does
              this once.
            </li>
            <li>
              Answer Yes or No in Telegram or in the app. Both yes: the task is done and the reward
              is added. Either No: it is marked not performed. No answer by the end of the day: not
              verified.
            </li>
          </Steps>
        </Section>

        <Section id="safety" title="5. Pause, RED and YELLOW">
          <p className="text-sm leading-6">
            Either of you can use these at any time, from the top of every page.
          </p>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-6">
            <li>
              <strong>RED</strong> means stop now. <strong>YELLOW</strong> means slow down and talk.{" "}
              <strong>Pause</strong> is a break with a short reason.
            </li>
            <li>Any of the three pauses the whole space: routines, check-ins and changes lock.</li>
            <li>
              To resume, you both write in the discussion that opens, and both confirm you're ready.
              One person can never resume alone.
            </li>
          </ul>
        </Section>

        <Section id="help" title="6. Help">
          <ul className="list-disc space-y-2 pl-5 text-sm leading-6">
            <li>
              Forgot your password? Choose <strong>Forgot your password?</strong> on the log-in
              screen. The email can land in Spam or Promotions: mark it "Not spam" so the next one
              arrives in your inbox.
            </li>
            <li>
              Change your name or password under <strong>My account</strong>.
            </li>
            <li>Something broken or confusing? Tell us below.</li>
          </ul>
        </Section>

        <Section id="feedback" title="Send feedback">
          <p className="text-sm leading-6 text-muted-foreground">
            You're one of the first people using BoundSome. What you tell us shapes what comes next.
          </p>
          <FeedbackForm />
        </Section>
      </main>
    </div>
  );
}
