import { useEffect, useRef, useState, useCallback } from "react";
import type { SpecDetail, WorkspaceState } from "../shared/types.ts";

async function getJson<T>(path: string): Promise<T | null> {
  const res = await fetch(path, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return (await res.json()) as T;
}

export type Connection = "connecting" | "live" | "offline";

/** Make a decision through the companion's one write endpoint; returns an error message, or null (companion-decisions R3–R6). */
export async function decide(body: object): Promise<string | null> {
  try {
    const res = await fetch("/api/decisions", { method: "POST", headers: { "Content-Type": "application/json", "X-Factree": "decide" }, body: JSON.stringify(body) });
    if (res.ok) return null;
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    return j.error ?? `Failed (${res.status})`;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** The server runs a different build than the one this page loaded with (companion-handoff R3). */
export function buildChanged(seen: string | null, now: string): boolean {
  return Boolean(seen && now && seen !== now);
}

/** Workspace state plus the selected spec, refreshed whenever the server says files changed. */
export function useWorkspace(specId: string | null) {
  const [state, setState] = useState<WorkspaceState | null>(null);
  const [detail, setDetail] = useState<SpecDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<Connection>("connecting");
  const specRef = useRef(specId);
  const buildRef = useRef<string | null>(null);
  specRef.current = specId;

  const refresh = useCallback(async () => {
    try {
      const s = await getJson<WorkspaceState>("/api/state");
      setState(s);
      const id = specRef.current ?? s?.specs[0]?.id ?? null;
      setDetail(id ? await getJson<SpecDetail>(`/api/specs/${id}`) : null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { void refresh(); }, [specId, refresh]);

  useEffect(() => {
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const open = () => {
      es = new EventSource("/api/stream");
      es.addEventListener("hello", (e) => {
        let b = "";
        try { b = String((JSON.parse((e as MessageEvent).data) as { build?: string }).build ?? ""); } catch { /* old server */ }
        if (buildChanged(buildRef.current, b)) { window.location.reload(); return; }   // keeps the address, hash included
        if (b) buildRef.current = b;
        setConnection("live");
        void refresh();
      });
      es.addEventListener("change", () => void refresh());
      es.onerror = () => {
        setConnection("offline");
        es?.close();
        retry = setTimeout(open, 2000);
      };
    };
    open();
    return () => { es?.close(); if (retry) clearTimeout(retry); };
  }, [refresh]);

  // Relative times ("2 min ago") drift without file changes; re-render every 30s.
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(t); }, []);

  return { state, detail, error, connection };
}

export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function clock(iso: string): string {
  // A date with no time (an approval's date) shows as the date, never as midnight.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
