import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useWorkspace, decide } from "./api.ts";
import { Palette } from "./components/Palette.tsx";
import { isPaletteKey } from "./search.ts";
import { Logo, CopyCommand, LinkContext } from "./components/bits.tsx";
import { waitingCounts } from "./status.ts";
import { useSidebarWidth } from "./layout.ts";
import { NO_LINKS, decisionsRedirect, fromLegacyHash, fromLegacyPath, linkTarget, parsePath, type LinkEnv, type Route } from "./links.ts";
import { openCurrentHref } from "./progress.ts";
import { LoopLine } from "./components/LoopLine.tsx";
import { SpecView } from "./components/SpecView.tsx";
import { PlanView } from "./components/PlanView.tsx";
import { VerifyView } from "./components/VerifyView.tsx";
import { ReviewView } from "./components/ReviewView.tsx";
import { SpecLink, Empty, Resizer } from "./components/Sidebar.tsx";
import { SearchButton, VersionBanner, shortPath } from "./components/Header.tsx";
import { WaitingLine, NotFound } from "./components/Notices.tsx";

// The route comes from the path (spec deep-links); an old #spec= link or /specs/ path is swapped for the current path first (R4).
function fromLocation(): Route {
  const legacy = fromLegacyHash(window.location.hash) ?? fromLegacyPath(window.location.pathname);
  if (legacy) window.history.replaceState(null, "", legacy);
  return parsePath(window.location.pathname);
}
function planRouteOf(r: Route) {
  return r.page === "plan" ? { plan: r.plan ?? "", tab: r.tab, view: r.view } : { plan: null, tab: r.page === "verify" || r.page === "review" ? r.page : r.tab, view: null };
}

export function App() {
  const [route, setRoute] = useState<Route>(fromLocation);
  const specId = route.spec;
  const planRoute = planRouteOf(route);
  const [focus, setFocus] = useState<{ ref: string | null; n: number }>({ ref: route.ref, n: 0 });
  const [searching, setSearching] = useState(false);
  const [sidebarWidth, setSidebarWidth, resetSidebar] = useSidebarWidth();
  const { state, detail, error, connection } = useWorkspace(specId);

  useEffect(() => {
    const onNavigate = () => {
      const r = fromLocation();
      setRoute(r);
      setFocus((f) => ({ ref: r.ref, n: f.n + 1 }));   // n changes on every jump, even to the same ref
    };
    window.addEventListener("popstate", onNavigate);
    window.addEventListener("hashchange", onNavigate);
    // In-app links move through history instead of reloading (deep-links R3).
    const onClick = (e: MouseEvent) => {
      const a = e.target instanceof Element ? e.target.closest("a") : null;
      const to = linkTarget(e, a);
      if (!to) return;
      e.preventDefault();
      if (to !== window.location.pathname) window.history.pushState(null, "", to);
      onNavigate();
    };
    document.addEventListener("click", onClick);
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      // ⌘ / opens search from anywhere, even while typing; / alone does too outside a text field (header-search R1).
      if (isPaletteKey(e, typing)) { e.preventDefault(); setSearching(true); return; }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("popstate", onNavigate); window.removeEventListener("hashchange", onNavigate); window.removeEventListener("keydown", onKey); document.removeEventListener("click", onClick); };
  }, []);

  const specs = useMemo(() => {
    return state?.specs ?? [];
  }, [state]);

  const activeId = specId ?? state?.specs[0]?.id ?? null;
  const decisions = state?.decisions ?? [];
  const waitingBySpec = useMemo(() => waitingCounts(decisions), [decisions]);
  const specCards = useMemo(() => decisions.filter((c) => c.spec === detail?.summary.id), [decisions, detail]);
  const onDecisionsTab = route.page === "spec" && route.tab === "decisions";
  const stageView = planRoute.plan === null ? (planRoute.tab === "verify" || planRoute.tab === "review" ? planRoute.tab : "spec") : planRoute.tab === "build" ? "build" : "plan";
  const links = useMemo<LinkEnv>(
    () => ({ ...NO_LINKS, specIds: new Set((state?.specs ?? []).map((s) => s.id)), repo: state?.repo ?? null }),
    [state],
  );

  // An old /decisions link opens the oldest waiting spec's Decisions tab, or home (companion-decisions R2.S5).
  useEffect(() => {
    if (route.page !== "decisions" || !state) return;
    window.history.replaceState(null, "", decisionsRedirect(decisions));
    setRoute(parsePath(window.location.pathname));
  }, [route.page, state, decisions]);

  // A spec's own address opens the stage its work is at now (spec-ring R3).
  useEffect(() => {
    const href = detail && openCurrentHref(window.location.pathname, detail.summary, detail.spec);
    if (!href) return;
    window.history.replaceState(null, "", href);
    setRoute(parsePath(window.location.pathname));
  }, [detail, route]);

  useEffect(() => {
    document.title = decisions.length ? `(${decisions.length}) Factree` : "Factree";
  }, [decisions.length]);

  return (
    <div className="app">
      <header className="header">
        <a className="brand" href="#"><Logo /> Factree</a>
        {state && <span className="workspace-path" title={state.workspace}>{shortPath(state.workspace)}</span>}
        <div className="spacer" />
        <SearchButton onOpen={() => setSearching(true)} />
        <span className="conn" title="Updates arrive as soon as files change">
          <span className="dot" style={{ background: connection === "live" ? "var(--ok)" : connection === "offline" ? "var(--accent)" : "var(--faint)" }} aria-hidden="true" />
          {connection === "live" ? "Live" : connection === "offline" ? "Reconnecting" : "Connecting"}
        </span>
      </header>

      <VersionBanner gap={state?.versionGap ?? null} />
      {searching && (
        <Palette onClose={() => setSearching(false)} onGo={(href, newTab) => {
          setSearching(false);
          if (newTab) { window.open(href, "_blank", "noopener"); return; }
          window.history.pushState(null, "", href);
          window.dispatchEvent(new PopStateEvent("popstate"));
        }} />
      )}

      <div className="body">
        <nav className="sidebar" aria-label="Specs" style={{ "--sidebar-w": `${sidebarWidth}px` } as CSSProperties}>
          <span className="label">Specs</span>
          {specs.map((s) => <SpecLink key={s.id} s={s} active={s.id === activeId} waiting={waitingBySpec.get(s.id) ?? 0} />)}
          {state && specs.length === 0 && <span className="count" style={{ padding: "4px 12px" }}>No specs yet.</span>}
          <div className="new-spec">
            <span>New spec</span>
            <CopyCommand command="/factree:spec " />
          </div>
        </nav>
        <Resizer width={sidebarWidth} onChange={setSidebarWidth} onReset={resetSidebar} />

        <main className="main">
          {error && <div className="content"><div className="notice problems" role="alert">Server unreachable ({error}). Restart with /factree:ui.</div></div>}
          {!error && state && route.page !== "decisions" && state.specs.length === 0 && <Empty />}
          {!error && route.page !== "decisions" && detail && (
            <>
              <div className="loop-band"><LoopLine summary={detail.summary} spec={detail.spec} view={stageView} waiting={specCards.length} /></div>
              <div className="loop-main">
              {!onDecisionsTab && <WaitingLine spec={detail.summary.id} n={specCards.length} />}
              <LinkContext.Provider value={links}>
                {planRoute.plan === null && planRoute.tab === "verify"
                  ? <VerifyView detail={detail} />
                  : planRoute.plan === null && planRoute.tab === "review"
                  ? <ReviewView detail={detail} />
                  : planRoute.plan !== null
                  ? <PlanView detail={detail} work={planRoute.plan || null} tab={planRoute.tab} view={planRoute.view} focus={detail.summary.id === activeId ? focus : null} />
                  : <SpecView detail={detail} user={state?.user ?? ""} focus={detail.summary.id === activeId ? focus : null} tab={planRoute.tab} cards={specCards} onDecide={decide} />}
              </LinkContext.Provider>
              </div>
            </>
          )}
          {!error && state && route.page === "notfound" && <NotFound />}
          {!error && state && route.page !== "notfound" && route.page !== "decisions" && state.specs.length > 0 && !detail && (
            <NotFound what={specId ? `Spec ${specId}` : undefined} />
          )}
        </main>
      </div>
    </div>
  );
}

