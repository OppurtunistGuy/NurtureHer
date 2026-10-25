// Outgoing Telegram Bot API calls. Needs TELEGRAM_BOT_TOKEN (server-only secret).
// Without it the bot can still reply to whoever just wrote, but can't message the other person.
import type { BotMessage } from "./telegram-verification.server";

export const yesNoButtons = (ticketId: string) => ({
  inline_keyboard: [
    [
      { text: "Yes", callback_data: `y:${ticketId}` },
      { text: "No", callback_data: `n:${ticketId}` },
    ],
  ],
});

export const botCanMessage = () => (process.env["TELEGRAM_BOT_TOKEN"]?.trim().length ?? 0) > 20;

async function call(method: string, body: Record<string, unknown>) {
  const token = process.env["TELEGRAM_BOT_TOKEN"]?.trim();
  if (!token) return false;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    // Never log the token or message content; the method and status are enough to debug.
    if (!response.ok) console.error("Telegram call failed", method, response.status);
    return response.ok;
  } catch {
    console.error("Telegram call failed", method, "network");
    return false;
  }
}

/** Sends each message after the database has committed. A failed send never undoes a result. */
export async function deliver(messages: BotMessage[]) {
  for (const message of messages) {
    if (message.copy)
      await call("copyMessage", {
        chat_id: message.chatId,
        from_chat_id: message.copy.chatId,
        message_id: message.copy.messageId,
        protect_content: true,
      });
    await call("sendMessage", {
      chat_id: message.chatId,
      text: message.text,
      protect_content: true,
      ...(message.buttons ? { reply_markup: yesNoButtons(message.buttons) } : {}),
    });
  }
}
