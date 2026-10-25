import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { confirmDiscard, hasUnsavedChanges, useDiscardPrompt, useUnsavedChanges } from "./unsaved";

afterEach(cleanup);
function Editor({ dirty }: { dirty: boolean }) {
  useUnsavedChanges(dirty, "a routine");
  return null;
}
let prompt: ReturnType<typeof useDiscardPrompt> = null;
function Watcher() {
  prompt = useDiscardPrompt();
  return null;
}

describe("unsaved changes", () => {
  it("continues at once when nothing is unsaved", async () => {
    render(<Editor dirty={false} />);
    expect(hasUnsavedChanges()).toBe(false);
    await expect(confirmDiscard()).resolves.toBe(true);
  });

  it("asks, keeps the edit on Keep editing, and clears it on Discard", async () => {
    render(
      <>
        <Editor dirty />
        <Watcher />
      </>,
    );
    expect(hasUnsavedChanges()).toBe(true);
    let first!: Promise<boolean>;
    act(() => {
      first = confirmDiscard();
    });
    expect(prompt?.labels).toEqual(["a routine"]);
    act(() => prompt!.resolve(false));
    await expect(first).resolves.toBe(false);
    expect(hasUnsavedChanges()).toBe(true);
    let second!: Promise<boolean>;
    act(() => {
      second = confirmDiscard();
    });
    act(() => prompt!.resolve(true));
    await expect(second).resolves.toBe(true);
    expect(hasUnsavedChanges()).toBe(false);
  });

  it("stops tracking an editor once it is saved or closed", () => {
    const view = render(<Editor dirty />);
    expect(hasUnsavedChanges()).toBe(true);
    view.rerender(<Editor dirty={false} />);
    expect(hasUnsavedChanges()).toBe(false);
  });
});
