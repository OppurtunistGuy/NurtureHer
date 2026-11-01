import "@testing-library/jest-dom/vitest";

// Production is invite-only. Most tests create accounts freely, so they run with the
// test-only open sign-up switch; the invite-only tests turn it off themselves.
process.env["OPEN_SIGNUP"] = "1";

if (typeof window !== "undefined") {
  Object.defineProperty(window, "scrollTo", {
    writable: true,
    value: () => {},
  });

  // jsdom has no ResizeObserver; Radix switches measure themselves with it.
  if (!("ResizeObserver" in window))
    Object.defineProperty(window, "ResizeObserver", {
      writable: true,
      value: class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    });

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    }),
  });
}
