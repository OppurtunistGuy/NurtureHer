// Outgoing email. Two providers, picked by which key is set:
//
//   BREVO_API_KEY  — Brevo (free tier, 300/day). Works with a single verified sender, so no domain
//                    is needed; MAIL_FROM must be that verified address, e.g.
//                    "BoundSome <you@gmail.com>". Preferred when set.
//   RESEND_API_KEY — Resend. Needs a verified domain to reach arbitrary inboxes; without one it only
//                    delivers from its test address to the Resend account owner. Used as a fallback.
//
// Secrets are server-only and never logged.
export type Mail = {
  to: string;
  subject: string;
  text: string;
  /** Resend only: same key → the email is created once even if a retry repeats the request. */
  idempotencyKey?: string;
};
export type Mailer = (mail: Mail) => Promise<boolean>;

const RESEND_URL = "https://api.resend.com/emails";
const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const RESEND_DEFAULT_FROM = "BoundSome <onboarding@resend.dev>";
const ATTEMPTS = 3;

const keyOf = (name: string) => {
  const value = process.env[name]?.trim();
  return value && value.length > 10 ? value : undefined;
};

/** MAIL_FROM as "Name <email>" or a bare address. Returns null when unset. */
function sender(): { name: string; email: string } | null {
  const raw = process.env["MAIL_FROM"]?.trim();
  if (!raw) return null;
  const match = /^(.*?)\s*<([^>]+)>$/.exec(raw);
  if (match) return { name: match[1]?.trim() || "BoundSome", email: match[2]!.trim() };
  return { name: "BoundSome", email: raw };
}

// Brevo needs a verified sender address; Resend can fall back to its own test sender.
export const mailConfigured = () =>
  (!!keyOf("BREVO_API_KEY") && !!sender()) || !!keyOf("RESEND_API_KEY");

/** Retry only what can succeed later: network errors, rate limits and server errors. */
const retryable = (status: number) => status === 429 || status >= 500;

type Request = { url: string; headers: Record<string, string>; body: string };

function buildRequest(mail: Mail): Request | null {
  const brevo = keyOf("BREVO_API_KEY");
  const from = sender();
  if (brevo && from) {
    return {
      url: BREVO_URL,
      headers: { "api-key": brevo, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: from,
        to: [{ email: mail.to }],
        subject: mail.subject,
        textContent: mail.text,
      }),
    };
  }
  const resend = keyOf("RESEND_API_KEY");
  if (resend) {
    const headers: Record<string, string> = {
      authorization: `Bearer ${resend}`,
      "content-type": "application/json",
    };
    if (mail.idempotencyKey) headers["idempotency-key"] = mail.idempotencyKey.slice(0, 256);
    return {
      url: RESEND_URL,
      headers,
      body: JSON.stringify({
        from: process.env["MAIL_FROM"]?.trim() || RESEND_DEFAULT_FROM,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
      }),
    };
  }
  return null;
}

const liveSend: Mailer = async (mail) => {
  const request = buildRequest(mail);
  if (!request) return false;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    let status = 0;
    let reason = "";
    try {
      const response = await fetch(request.url, {
        method: "POST",
        headers: request.headers,
        body: request.body,
        signal: AbortSignal.timeout(8000),
      });
      if (response.ok) return true;
      status = response.status;
      // The provider's own error message (e.g. "Key not found"). It names no recipient and holds
      // no secret of ours, so it is safe to log and tells us why a send was refused.
      reason = (await response.text().catch(() => "")).slice(0, 200);
    } catch {
      status = -1; // network error or timeout
    }
    // Never log our own key, the address or the message body.
    console.error(
      "Email send failed",
      status === -1 ? "network" : status,
      `attempt ${attempt}`,
      reason,
    );
    if (status !== -1 && !retryable(status)) return false;
    if (attempt < ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
  }
  return false;
};

let mailer: Mailer = liveSend;
/** Tests swap the sender so nothing leaves the machine. Pass nothing to restore. */
export function setMailer(replacement?: Mailer) {
  mailer = replacement ?? liveSend;
}
export const sendMail: Mailer = (mail) => mailer(mail);
