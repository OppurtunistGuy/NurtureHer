// Outgoing email through Resend's HTTP API. Needs RESEND_API_KEY (server-only secret);
// MAIL_FROM sets the sender, e.g. "BoundSome <hello@yourdomain.com>".
// Without a verified domain Resend only delivers from its test address to the account owner.
export type Mail = { to: string; subject: string; text: string };
export type Mailer = (mail: Mail) => Promise<boolean>;

const DEFAULT_FROM = "BoundSome <onboarding@resend.dev>";

export const mailConfigured = () => (process.env["RESEND_API_KEY"]?.trim().length ?? 0) > 10;

const resend: Mailer = async (mail) => {
  const key = process.env["RESEND_API_KEY"]?.trim();
  if (!key) return false;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: process.env["MAIL_FROM"]?.trim() || DEFAULT_FROM,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
      }),
      signal: AbortSignal.timeout(8000),
    });
    // Never log the address, key or body; the status is enough to debug.
    if (!response.ok) console.error("Email send failed", response.status);
    return response.ok;
  } catch {
    console.error("Email send failed", "network");
    return false;
  }
};

let mailer: Mailer = resend;
/** Tests swap the sender so nothing leaves the machine. Pass nothing to restore. */
export function setMailer(replacement?: Mailer) {
  mailer = replacement ?? resend;
}
export const sendMail: Mailer = (mail) => mailer(mail);
