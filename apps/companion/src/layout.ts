// The spec list's width (companion-layout R1, R2): 280px to start, resizable between 200px and 480px,
// remembered in this browser only. Storage can be blocked; the width then lasts for the session.

import { useCallback, useState } from "react";

export const DEFAULT_SIDEBAR = 280;
export const MIN_SIDEBAR = 200;
export const MAX_SIDEBAR = 480;
export const KEY_STEP = 10;
const KEY = "factree.sidebar";

export function clampWidth(px: number): number {
  return Math.round(Math.min(MAX_SIDEBAR, Math.max(MIN_SIDEBAR, px)));
}

/** The width after an arrow key on the border, or null for other keys. */
export function keyWidth(width: number, key: string): number | null {
  if (key === "ArrowRight") return clampWidth(width + KEY_STEP);
  if (key === "ArrowLeft") return clampWidth(width - KEY_STEP);
  if (key === "Home") return MIN_SIDEBAR;
  if (key === "End") return MAX_SIDEBAR;
  return null;
}

export function storedWidth(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    return v ? clampWidth(v) : DEFAULT_SIDEBAR;
  } catch { return DEFAULT_SIDEBAR; }
}

export function useSidebarWidth(): [number, (px: number) => void, () => void] {
  const [width, setWidth] = useState(storedWidth);
  const set = useCallback((px: number) => {
    const w = clampWidth(px);
    setWidth(w);
    try { localStorage.setItem(KEY, String(w)); } catch { /* blocked: keep it for this session */ }
  }, []);
  const reset = useCallback(() => set(DEFAULT_SIDEBAR), [set]);
  return [width, set, reset];
}
