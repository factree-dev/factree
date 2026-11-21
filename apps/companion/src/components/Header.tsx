// The header's pieces: the search box and the banner shown when the companion is older than the workspace
// (specs header-search, version-check).

/** The header's search box: opens the search palette (header-search R1). */
export function SearchButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" className="filter search-open" aria-label="Search" onClick={onOpen}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <span className="search-label">Search…</span>
      <span className="kbd">⌘ /</span>
    </button>
  );
}

/** Shown while this companion is older than the Factree that last wrote the workspace (version-check R3). */
export function VersionBanner({ gap }: { gap: { running: string; workspace: string } | null }) {
  if (!gap) return null;
  return (
    <div className="version-banner" role="status">
      Factree {gap.running} is older than the {gap.workspace} that last wrote this workspace. Update: /plugin → factree, then restart.
    </div>
  );
}

export function shortPath(p: string) {
  const home = p.match(/^\/(Users|home)\/[^/]+/)?.[0];
  return home ? "~" + p.slice(home.length) : p;
}
