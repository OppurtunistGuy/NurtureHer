import { createFileRoute } from "@tanstack/react-router";
import { handleTelegramRequest } from "@/lib/nocturne/space-api.server";

export const Route = createFileRoute("/api/space/telegram")({
  server: { handlers: { POST: ({ request }) => handleTelegramRequest(request) } },
});
