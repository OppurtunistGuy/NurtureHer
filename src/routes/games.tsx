import { createFileRoute } from "@tanstack/react-router";
import { GamesPage } from "@/components/nocturne/GamesPage";

export const Route = createFileRoute("/games")({
  head: () => ({ meta: [{ title: "Games — BoundSome" }] }),
  component: GamesPage,
});
