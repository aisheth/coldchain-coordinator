import { useEffect, useRef, useState } from "react";
import type { ApiUser } from "./api-types";

export function draftKey(user: Pick<ApiUser, "id" | "org_id">, form: string) {
  return `coldtrack:draft:v1:${encodeURIComponent(user.org_id)}:${encodeURIComponent(user.id)}:${encodeURIComponent(form)}`;
}
// An allow-list is supplied by each form; this second guard excludes credentials and binary inputs.
export function safeDraft(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(safeDraft);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !/password|token|secret|photo|file/i.test(key))
        .map(([key, entry]) => [key, safeDraft(entry)]),
    );
  }
  return value;
}
function restoreShape(template: unknown, value: unknown): unknown {
  if (value === undefined || value === null) return template;
  if (template === null) return safeDraft(value);
  if (Array.isArray(template)) {
    if (!Array.isArray(value)) throw new Error("Invalid draft array");
    return safeDraft(value);
  }
  if (template && typeof template === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Invalid draft object");
    const entries = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(template).map(([field, fallback]) => [
        field,
        restoreShape(fallback, entries[field]),
      ]),
    );
  }
  if (typeof template !== typeof value) throw new Error("Invalid draft field");
  return value;
}
export function useDraft<T extends object>(user: ApiUser | null, form: string, initial: T) {
  const key = user ? draftKey(user, form) : null;
  const defaults = useRef(initial);
  defaults.current = initial;
  const current = useRef(initial);
  const saved = useRef<T | null>(null);
  const [data, update] = useState(initial);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<"empty" | "saved" | "unavailable">("empty");
  const [error, setError] = useState("");
  useEffect(() => {
    current.current = defaults.current;
    update(defaults.current);
    setPending(false);
    setStatus("empty");
    saved.current = null;
    if (!key) return;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (
        !parsed ||
        typeof parsed !== "object" ||
        !("data" in parsed) ||
        !parsed.data ||
        typeof parsed.data !== "object"
      )
        throw new Error("Invalid draft");
      saved.current = restoreShape(defaults.current, safeDraft(parsed.data)) as T;
      setPending(true);
      setStatus("saved");
    } catch {
      setPending(true);
      setStatus("unavailable");
      setError("This browser could not read the draft. Your saved input has not been removed.");
    }
  }, [key]);
  function setData(next: T | ((previous: T) => T)) {
    if (pending) return;
    const value = typeof next === "function" ? next(current.current) : next;
    current.current = value;
    update(value);
    if (!key) return;
    try {
      localStorage.setItem(
        key,
        JSON.stringify({ data: safeDraft(value), updatedAt: new Date().toISOString() }),
      );
      setStatus("saved");
      setError("");
    } catch {
      setStatus("unavailable");
      setError(
        "Draft not saved: browser storage is unavailable or full. Keep this form open to avoid losing input.",
      );
    }
  }
  function resume() {
    if (!saved.current) return;
    current.current = saved.current;
    update(saved.current);
    setPending(false);
  }
  function clear(next?: T) {
    try {
      if (key) localStorage.removeItem(key);
      saved.current = null;
      current.current = next ?? defaults.current;
      update(next ?? defaults.current);
      setPending(false);
      setStatus("empty");
      setError("");
    } catch {
      setError("The draft could not be removed from this browser.");
    }
  }
  return { data, setData, pending, status, error, resume, clear };
}
export function draftField<T extends object, K extends keyof T>(
  draft: ReturnType<typeof useDraft<T>>,
  key: K,
): [T[K], (value: T[K]) => void] {
  return [draft.data[key], (value) => draft.setData((previous) => ({ ...previous, [key]: value }))];
}
