import { act, fireEvent, render, screen, waitFor, within, cleanup } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { describe, expect, it, afterEach } from "vitest";
import { Toaster } from "sonner";
import { Route as index } from "@/routes/index";
import { Route as today } from "@/routes/today";
import { Route as routines } from "@/routes/routines";
import { Route as goals } from "@/routes/goals";
import { Route as points } from "@/routes/points";
import { Route as proof } from "@/routes/proof";
import { Route as requests } from "@/routes/requests";
import { Route as notes } from "@/routes/notes";
import { Route as agreement } from "@/routes/agreements";
import { Route as discussion } from "@/routes/discussion";
import { Route as settings } from "@/routes/settings";
import { Route as activity } from "@/routes/activity";

afterEach(cleanup);
describe("rendered app workflow", () => {
  it("onboards, assigns, submits, reviews, locks and resumes after discussion", async () => {
    localStorage.clear();
    const root = createRootRoute({
      component: () => (
        <>
          <Outlet />
          <Toaster />
        </>
      ),
    });
    const page = (path: string, route: typeof index) =>
      createRoute({ getParentRoute: () => root, path, component: route.options.component! });
    // Mount the real page components under a minimal test root: avoid waiting for
    // browser stylesheet loading in jsdom. No application store/action mocks.
    const pages = [
      ["/", index],
      ["/today", today],
      ["/routines", routines],
      ["/goals", goals],
      ["/points", points],
      ["/proof", proof],
      ["/requests", requests],
      ["/notes", notes],
      ["/agreements", agreement],
      ["/discussion", discussion],
      ["/settings", settings],
      ["/activity", activity],
    ] as const;
    const router = createRouter({
      routeTree: root.addChildren(
        pages.map(([path, route]) => page(path, route as unknown as typeof index)),
      ),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    const go = async (to: string) => {
      await act(async () => {
        await router.navigate({ to });
      });
    };
    const click = async (element: HTMLElement) => {
      await act(async () => {
        fireEvent.click(element);
      });
    };
    const fill = (label: string, value: string) =>
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    render(<RouterProvider router={router} />);
    await screen.findByRole("heading", { name: "BoundSome" });
    expect(screen.getByRole("button", { name: "Create my space" })).toBeDisabled();
    await click(screen.getByRole("button", { name: "Try alone first" }));
    await click(screen.getByRole("checkbox"));
    await click(screen.getByRole("radio", { name: /Master/ }));
    fill("Your name", "Maya");
    await click(screen.getByRole("button", { name: "Enter solo demo" }));
    await screen.findByRole("heading", { name: "Good day, Maya" });

    await go("/agreements");
    expect(screen.getByRole("heading", { name: "Master & Sub Agreement" })).toBeInTheDocument();
    expect(screen.getByText("4. Rule Violations, Punishments & Consequences")).toBeInTheDocument();
    expect(screen.getByText("7. Communication & Review")).toBeInTheDocument();
    await click(screen.getByRole("button", { name: "I acknowledge this agreement" }));
    await go("/settings");
    await click(screen.getByRole("radio", { name: /Sub/ }));
    await go("/agreements");
    await click(screen.getByRole("button", { name: "I acknowledge this agreement" }));
    await go("/routines");
    expect(screen.queryByRole("button", { name: "New routine" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    await go("/today");
    const routine = screen.getByRole("heading", { name: "Wake-up check-in" }).closest("li")!;
    await click(within(routine).getByRole("button", { name: "Submit check-in" }));
    fill("Your check-in", "Water, breakfast, and ready for the day.");
    await click(screen.getByRole("button", { name: "Submit for review" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(routine).getByText("Awaiting review")).toBeInTheDocument();
    await go("/proof");
    expect(screen.queryByRole("button", { name: "Accept check-in" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Camera · next phase" })).toBeDisabled();
    await go("/settings");
    await click(screen.getByRole("radio", { name: /Master/ }));
    await go("/proof");
    await click(screen.getByRole("button", { name: "Accept check-in" }));
    await go("/today");
    expect(screen.getByText("Completed")).toBeInTheDocument();
    await go("/proof");
    await click(screen.getByRole("button", { name: "History" }));
    expect(screen.getByText("Water, breakfast, and ready for the day.")).toBeInTheDocument();

    await go("/points");
    await screen.findByRole("heading", { name: "Points & milestones" });
    fill("Points (1–100)", "50");
    fill("Reason visible to both people", "Reviewed effort this week");
    await click(screen.getByRole("button", { name: "Record points" }));
    await screen.findByText("+50 reward points");
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "0");
    await go("/settings");
    await click(screen.getByRole("radio", { name: /Sub/ }));
    await go("/points");
    expect(screen.queryByRole("button", { name: "Record points" })).not.toBeInTheDocument();
    expect(screen.getByText("+50 reward points")).toBeInTheDocument();
    await go("/settings");
    await click(screen.getByRole("radio", { name: /Master/ }));
    await go("/goals");
    await click(screen.getByRole("button", { name: "New goal" }));
    fill("Goal title", "A focused week");
    fill("Instructions", "One daily focus block.");
    fill("Success criteria", "Five written reflections.");
    await click(screen.getByRole("button", { name: "Save goal" }));
    expect(screen.getByRole("heading", { name: "A focused week" })).toBeInTheDocument();

    await click(screen.getByRole("button", { name: "Pause" }));
    fill("Optional pause note", "Let's discuss timing.");
    await click(screen.getByRole("button", { name: "Pause now" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(screen.getByText("Paused. Your space is read-only.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New goal" })).toBeDisabled();
    await go("/proof");
    expect(screen.getByRole("button", { name: "History" })).toBeEnabled();
    await click(screen.getByRole("button", { name: "History" }));
    expect(screen.getByText("Water, breakfast, and ready for the day.")).toBeInTheDocument();
    await go("/routines");
    expect(screen.getByRole("button", { name: "New routine" })).toBeDisabled();
    await go("/notes");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    await go("/discussion");
    expect(screen.getByRole("button", { name: "We've discussed — I'm ready" })).toBeDisabled();
    fill("Your message", "Can we move the evening check-in?");
    await click(screen.getByRole("button", { name: "Send discussion message" }));
    await go("/settings");
    expect(screen.getByRole("button", { name: "Clear demo data" })).toBeDisabled();
    await click(screen.getByRole("radio", { name: /Sub/ }));
    await go("/discussion");
    fill("Your message", "Yes, a later time would help.");
    await click(screen.getByRole("button", { name: "Send discussion message" }));
    await click(screen.getByRole("button", { name: "We've discussed — I'm ready" }));
    expect(screen.getByText("Paused. Your space is read-only.")).toBeInTheDocument();
    await go("/settings");
    await click(screen.getByRole("radio", { name: /Master/ }));
    await go("/discussion");
    await click(screen.getByRole("button", { name: "We've discussed — I'm ready" }));
    expect(screen.queryByText("Paused. Your space is read-only.")).not.toBeInTheDocument();
    await go("/goals");
    expect(screen.getByRole("button", { name: "New goal" })).toBeEnabled();
    await go("/activity");
    expect(
      screen.getByText("Both acknowledged after discussion. Dynamic resumed."),
    ).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("nocturne.demo.v1")!).pause.active).toBe(false);
  }, 30000);
});
