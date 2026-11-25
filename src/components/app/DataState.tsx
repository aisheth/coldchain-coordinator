import { AlertCircle, LoaderCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LoadingState({ label = "Loading live data…" }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted-foreground">
      <LoaderCircle className="h-7 w-7 animate-spin text-primary" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  busy = false,
}: {
  message: string;
  onRetry: () => void;
  busy?: boolean;
}) {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center text-center">
      <AlertCircle className="h-8 w-8 text-danger" />
      <h1 className="mt-3 text-lg font-semibold">Live data could not be loaded</h1>
      <p role="alert" className="mt-2 text-sm text-muted-foreground">
        {message}
      </p>
      <Button className="mt-5" onClick={onRetry} disabled={busy}>
        <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
        Try again
      </Button>
    </div>
  );
}
