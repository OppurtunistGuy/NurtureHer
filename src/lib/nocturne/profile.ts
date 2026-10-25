// The per-Sub profile a Master is looking at, taken from the URL (/subs/$spaceId/$section).
import { createContext, useContext } from "react";
import { useNocturne } from "./store";

export const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "routines", label: "Routines and tasks" },
  { id: "drafting", label: "AI drafting" },
  { id: "submissions", label: "Submissions" },
  { id: "points", label: "Points" },
  { id: "levels", label: "Levels and milestones" },
  { id: "agreement", label: "Agreement and limits" },
  { id: "history", label: "History" },
] as const;
export type SectionId = (typeof SECTIONS)[number]["id"];
export const isSection = (value: string): value is SectionId =>
  SECTIONS.some((section) => section.id === value);

export type Profile = { spaceId: string; section: SectionId; subName: string };
export const ProfileContext = createContext<Profile | null>(null);
export const useProfile = () => useContext(ProfileContext);

/**
 * The Sub that an action will affect, for a Master in a shared space. Used to name the person on
 * confirm buttons so a task can never be assigned to someone else by mistake.
 */
export function useSubName() {
  const s = useNocturne();
  return s.space.mode === "shared" && s.myRole === "dom" && s.space.paired ? s.names.sub : null;
}
