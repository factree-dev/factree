// People's names, as the specs and the companion compare and show them (spec codebase-health R4).

/** The first word of a name, lower-cased, to match an owner to the user ("John Doe" and "john"). */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
}

/** A name with its first letter capitalised. */
export function cap(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}
