import { useState, type FormEvent } from "react";
import { LoaderCircle, LockKeyhole, Snowflake } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, Field } from "./ui";
import { errorMessage } from "@/lib/api";
import { useStore } from "@/lib/store";

export function Login() {
  const { login } = useStore();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const user = await login(identifier.trim(), password);
      await navigate({ to: user.role === "worker" ? "/worker" : "/", replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md p-6 md:p-8">
        <div className="mb-8 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Snowflake className="h-6 w-6" />
          </span>
          <h1 className="mt-4 font-display text-2xl font-semibold">ColdTrack</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to procurement & deployment</p>
        </div>
        <form className="space-y-4" onSubmit={submit}>
          <Field label="Username or email">
            <Input
              autoFocus
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          {error && (
            <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
              {error}
            </p>
          )}
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={busy || !identifier.trim() || !password}
          >
            {busy ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <LockKeyhole className="h-4 w-4" />
            )}
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p className="mt-5 text-center text-xs text-muted-foreground">
          Use an account created in the ColdTrack backend.
        </p>
      </Card>
    </main>
  );
}
