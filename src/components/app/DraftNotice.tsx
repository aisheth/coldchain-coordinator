import { FilePenLine, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DraftNotice({
  draft,
  onResume,
}: {
  draft: { pending: boolean; status: string; error: string; resume: () => void; clear: () => void };
  onResume?: () => void;
}) {
  if (draft.status === "empty" && !draft.error) return null;
  return (
    <div
      className="my-3 flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 p-3 text-sm"
      role="status"
    >
      <FilePenLine className="h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {draft.pending
            ? "Unsaved draft available"
            : draft.status === "saved"
              ? "Draft saved"
              : "Draft not saved"}
        </p>
        <p className="text-xs text-muted-foreground">
          Local to this browser/device. Photos and passwords are not saved.
        </p>
        {draft.error && (
          <p role="alert" className="text-danger">
            {draft.error}
          </p>
        )}
      </div>
      {(draft.pending || onResume) && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            draft.resume();
            onResume?.();
          }}
        >
          <RotateCcw className="h-4 w-4" />
          Resume
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          if (window.confirm("Discard this unsaved draft?")) draft.clear();
        }}
      >
        <Trash2 className="h-4 w-4" />
        Discard
      </Button>
    </div>
  );
}
