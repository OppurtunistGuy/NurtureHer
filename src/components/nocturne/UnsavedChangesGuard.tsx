import { useBlocker } from "@tanstack/react-router";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useSubName } from "@/lib/nocturne/profile";
import { confirmDiscard, hasUnsavedChanges, useDiscardPrompt } from "@/lib/nocturne/unsaved";

/** Asks before any navigation, Sub switch, sign-out or tab close would lose unsaved edits. */
export function UnsavedChangesGuard() {
  useBlocker({
    shouldBlockFn: async ({ current, next }) =>
      current.pathname !== next.pathname && !(await confirmDiscard()),
    enableBeforeUnload: () => hasUnsavedChanges(),
  });
  const prompt = useDiscardPrompt(),
    subName = useSubName();
  return (
    <AlertDialog open={!!prompt} onOpenChange={(open) => !open && prompt?.resolve(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {subName ? `You have unsaved changes for ${subName}` : "You have unsaved changes"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {prompt?.labels.length ? `Not saved yet: ${prompt.labels.join(", ")}. ` : ""}
            Discard them? They will not be carried over to anyone else.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => prompt?.resolve(false)}>Keep editing</AlertDialogCancel>
          <Button variant="destructive" onClick={() => prompt?.resolve(true)}>
            Discard
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
