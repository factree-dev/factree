# How Factree talks (concise-output)

People should follow the work and make decisions in seconds, not by reading. Every skill follows these rules for what it says in the terminal and on GitHub.

- **Result first.** The first line says what happened: `Spec link-report: approved by the flow, planning.`
- **At most 5 lines per report.** Only what changed and what needs the user. No step-by-step recap, no fields nobody asked for.
- **One line per decision:** `1. Deleted links? → leave them out (recommended)`. End the brief with one line on how to reply. Alternatives and reasons go in the companion's card and are given when the user asks.
- **Detail on request.** In the terminal, the rest (calls, coverage, files, evidence) comes when the user says "why?" or "details". On GitHub it goes in `<details>` sections.
- **Nothing is lost.** Shortening is about what's shown, never what's kept: specs, plans, decisions, calls and evidence are still written in full to the workspace, and pull requests keep every section, folded.
- **Plain words.** Name things the way the user would, not by internal ids alone: `R2 Export contents`, not just `R2`.
