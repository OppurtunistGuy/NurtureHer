import { createFileRoute } from "@tanstack/react-router";
import { handleSpaceRequest } from "@/lib/nocturne/space-api.server";

export const Route = createFileRoute("/api/space")({
  server: {
    handlers: {
      GET: ({ request }) => handleSpaceRequest(request),
      POST: ({ request }) => handleSpaceRequest(request),
    },
  },
});
