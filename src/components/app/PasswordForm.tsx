import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "./ui";
import { errorMessage } from "@/lib/api";
import { useStore } from "@/lib/store";

export function PasswordForm() {
  const { changePassword, refresh, user } = useStore();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await changePassword(current, next);
      if (user?.must_change_password) await refresh();
      setCurrent("");
      setNext("");
      toast.success("Password changed");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="mt-4 space-y-3" onSubmit={submit}>
      <Field label="Current password">
        <Input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
        />
      </Field>
      <Field label="New password (at least 8 characters)">
        <Input
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
        />
      </Field>
      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy || !current || next.length < 8}>
        {busy && <LoaderCircle className="h-4 w-4 animate-spin" />}Change password
      </Button>
    </form>
  );
}
