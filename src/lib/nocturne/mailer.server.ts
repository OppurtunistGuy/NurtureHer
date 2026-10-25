// Outgoing email through Resend's HTTP API. Needs RESEND_API_KEY (server-only secret, ideally a
// sending-only key limited to the domain); MAIL_FROM sets the sender, e.g.
// "BoundSome <no-reply@mail.yourdomain.com>". Without a verified domain Resend only delivers from
// its test address to the Resend account owner.
export type Mail = {
  to: string;
  subject: string;
  text: string;
  /** Same key → Resend creates the email once, even if a retry repeats the request. */
  idempotencyKey?: string;
};
export type Mailer = (mail: Mail) => Promise<boolean>;

const DEFAULT_FROM = "BoundSome <onboarding@resend.dev>";
const ATTEMPTS = 3;

export const mailConfigured = () => (process.env["RESEND_API_KEY"]?.trim().length ?? 0) > 10;

/** Retry only what can succeed later: network errors, rate limits and server errors. */
const retryable = (status: number) => status === 429 || status >= 500;

const resend: Mailer = async (mail) => {
  const key = process.env["RESEND_API_KEY"]?.trim();
  if (!key) return false;
  const headers: Record<string, string> = {
    authorization: `Bearer ${key}`,
    "content-type": "application/json",
  };
  if (mail.idempotencyKey) headers["idempotency-key"] = mail.idempotencyKey.slice(0, 256);
  const body = JSON.stringify({
    from: process.env["MAIL_FROM"]?.trim() || DEFAULT_FROM,
    to: [mail.to],
    subject: mail.subject,
    text: mail.text,
  });
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    let status = 0;
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(8000),
      });
      if (response.ok) return true;
      status = response.status;
    } catch {
      status = -1; // network error or timeout
    }
    // Never log the address, key or body; the status is enough to debug.
    console.error("Email send failed", status === -1 ? "network" : status, `attempt ${attempt}`);
    if (status !== -1 && !retryable(status)) return false;
    if (attempt < ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
  }
  return false;
};

let mailer: Mailer = resend;
/** Tests swap the sender so nothing leaves the machine. Pass nothing to restore. */
export function setMailer(replacement?: Mailer) {
  mailer = replacement ?? resend;
}
export const sendMail: Mailer = (mail) => mailer(mail);
