import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { seed } from "./mock-data";
import type { AppState, Project, Task, TaskEvent, TaskStatus, Vendor, Worker } from "./types";

// Data access is centralised here so a real backend can replace localStorage later.
const KEY = "coldtrack-state-v1";
const uid = () => Math.random().toString(36).slice(2, 10);

interface Store {
  state: AppState;
  addProject: (p: Omit<Project, "id" | "createdAt">) => Project;
  updateProject: (id: string, patch: Partial<Project>) => void;
  createTask: (t: Omit<Task, "id" | "ref" | "createdAt" | "events" | "status">) => Task;
  addEvent: (taskId: string, e: { by: string; status?: TaskStatus | undefined; note?: string | undefined; photo?: string | undefined }) => void;
  addWorker: (w: Omit<Worker, "id">) => void;
  addVendor: (v: Omit<Vendor, "id">) => Vendor;
  setCurrentWorker: (id: string) => void;
  reset: () => void;
}
const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(seed);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try { const raw = localStorage.getItem(KEY); if (raw) setState(JSON.parse(raw)); } catch { /* ignore */ }
    setLoaded(true);
    const onStorage = (e: StorageEvent) => { if (e.key === KEY && e.newValue) setState(JSON.parse(e.newValue)); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { console.warn("Storage full; photos may not persist"); }
  }, [state, loaded]);

  const addEvent = useCallback<Store["addEvent"]>((taskId, e) => {
    setState((s) => ({ ...s, tasks: s.tasks.map((t) => t.id !== taskId ? t : {
      ...t, status: e.status ?? t.status, events: [...t.events, { id: uid(), at: new Date().toISOString(), ...e } as TaskEvent],
    }) }));
  }, []);

  const value = useMemo<Store>(() => ({
    state,
    addProject: (p) => { const np = { ...p, id: uid(), createdAt: new Date().toISOString() }; setState((s) => ({ ...s, projects: [np, ...s.projects] })); return np; },
    updateProject: (id, patch) => setState((s) => ({ ...s, projects: s.projects.map((p) => p.id === id ? { ...p, ...patch } : p) })),
    createTask: (t) => {
      const now = new Date().toISOString();
      const nt: Task = { ...t, id: uid(), ref: `PR-${1000 + state.tasks.length + 1 + Math.floor(Math.random() * 90)}`, createdAt: now, status: "assigned",
        events: [{ id: uid(), at: now, by: "Owner", status: "assigned", note: "Task assigned" }] };
      setState((s) => ({ ...s, tasks: [nt, ...s.tasks], projects: s.projects.map((p) => p.id === t.projectId && p.status === "planning" ? { ...p, status: "procurement" } : p) }));
      return nt;
    },
    addEvent,
    addWorker: (w) => setState((s) => ({ ...s, workers: [...s.workers, { ...w, id: uid() }] })),
    addVendor: (v) => { const nv = { ...v, id: uid() }; setState((s) => ({ ...s, vendors: [...s.vendors, nv] })); return nv; },
    setCurrentWorker: (id) => setState((s) => ({ ...s, currentWorkerId: id })),
    reset: () => setState(seed()),
  }), [state, addEvent]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside provider");
  return s;
}

export function fmtDate(iso: string) { return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
export function fmtDateTime(iso: string) { return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
export function timeAgo(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now"; if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
