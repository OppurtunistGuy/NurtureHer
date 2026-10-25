import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { AuthPanel } from "@/components/nocturne/AuthPanel";
import { useAccount } from "@/lib/nocturne/account";
import { isSection, ProfileContext, type SectionId } from "@/lib/nocturne/profile";
import { spaceActions, useNocturne, useSpaceConnection } from "@/lib/nocturne/store";
import { Route as today } from "./today";
import { Route as routines } from "./routines";
import { Route as proof } from "./proof";
import { Route as points } from "./points";
import { Route as agreements } from "./agreements";
import { Route as activity } from "./activity";

export const Route = createFileRoute("/subs/$spaceId/$section")({
  head: () => ({
    meta: [{ title: "Sub profile — BoundSome" }, { name: "referrer", content: "no-referrer" }],
  }),
  component: SubProfile,
});

/** Each section reuses the existing page, scoped to this one relationship. */
const PAGES: Record<SectionId, ComponentType> = {
  overview: today.options.component as ComponentType,
  routines: routines.options.component as ComponentType,
  drafting: routines.options.component as ComponentType,
  submissions: proof.options.component as ComponentType,
  points: points.options.component as ComponentType,
  levels: points.options.component as ComponentType,
  agreement: agreements.options.component as ComponentType,
  history: activity.options.component as ComponentType,
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function SubProfile() {
  const { spaceId, section } = Route.useParams();
  const me = useAccount(),
    s = useNocturne(),
    connection = useSpaceConnection();
  const [failure, setFailure] = useState(""),
    [attempted, setAttempted] = useState("");
  const loaded = s.space.mode === "shared" && s.space.id === spaceId;

  // The URL decides which relationship is open. The server refuses any ID this account isn't in.
  useEffect(() => {
    if (me.status !== "signedIn" || loaded || connection.busy || attempted === spaceId) return;
    if (!UUID.test(spaceId)) {
      setFailure("This relationship isn't available to you.");
      return;
    }
    setAttempted(spaceId);
    setFailure("");
    void spaceActions.open(spaceId).then((result) => {
      if (!result.ok) setFailure("This relationship isn't available to you.");
    });
  }, [me.status, loaded, connection.busy, attempted, spaceId]);
  useEffect(() => {
    if (attempted && attempted !== spaceId) setAttempted("");
  }, [attempted, spaceId]);

  const profile = useMemo(
    () => (isSection(section) ? { spaceId, section, subName: s.names.sub } : null),
    [spaceId, section, s.names.sub],
  );

  if (!isSection(section))
    return (
      <Navigate to="/subs/$spaceId/$section" params={{ spaceId, section: "overview" }} replace />
    );
  if (me.status === "checking") return <Centered>Checking your account…</Centered>;
  if (me.status !== "signedIn")
    return (
      <main className="mx-auto max-w-md px-6 py-12">
        <AuthPanel intro="Log in to open this profile." />
      </main>
    );
  if (failure)
    return (
      <Centered>
        <p role="alert">{failure}</p>
        <Link to="/dashboard" className="mt-4 inline-block text-gold underline">
          Back to All Subs
        </Link>
      </Centered>
    );
  if (!loaded || !profile) return <Centered>Opening profile…</Centered>;
  // Profiles are for managing a Sub. In relationships where this person is the Sub, use their own pages.
  if (s.myRole !== "dom") return <Navigate to="/today" replace />;
  const Page = PAGES[profile.section];
  return (
    <ProfileContext.Provider value={profile}>
      <Page />
    </ProfileContext.Provider>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center text-sm text-muted-foreground">
      {children}
    </main>
  );
}
