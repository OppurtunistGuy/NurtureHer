import "@testing-library/jest-dom/vitest";

// Production is invite-only. Most tests create accounts freely, so they run with the
// test-only open sign-up switch; the invite-only tests turn it off themselves.
process.env["OPEN_SIGNUP"] = "1";

if (typeof window !== "undefined") {
  Object.defineProperty(window, "scrollTo", {
    writable: true,
    value: () => {},
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
