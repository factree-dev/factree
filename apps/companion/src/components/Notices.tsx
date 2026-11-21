// One-line notices on a spec's pages: decisions waiting, and an address that names nothing (specs companion-decisions,
// deep-links).

import { waitingLabel } from "../status.ts";

/** One line on a spec's views while decisions wait, opening its Decisions tab (companion-decisions R2). */
export function WaitingLine({ spec, n }: { spec: string; n: number }) {
  const label = waitingLabel(n);
  return label ? <a className="waiting-line" href={`/work/${spec}/spec/decisions`}>{label} waiting<span>Decide</span></a> : null;
}

/** A path that names nothing (deep-links R6). */
export function NotFound({ what, back }: { what?: string; back?: { href: string; label: string } }) {
  return (
    <div className="content">
      <div className="notice"><strong>{what ? `${what} wasn't found.` : "Nothing at this address."}</strong>{" "}
        <a href={back?.href ?? "/"}>{back?.label ?? "Go to the spec list"}</a></div>
    </div>
  );
}
