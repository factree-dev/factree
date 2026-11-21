# Lenses

The Factree skills follow one process everywhere. A **lens** carries what's specific to a kind of code: what patterns to look for, which scale questions matter, which gaps to check, which design sections to add, and how scenarios get tested.

`scripts/detect.sh` reports which lenses apply to each project. A full-stack project loads several. A project with no matching lens uses the core process alone, and the skill says so.

## Built-in lenses

| Lens | File | Status |
|---|---|---|
| Backend services and APIs | `backend.md` | Built in |
| Web frontends | `frontend.md` | Built in |
| Infrastructure, containers and CI/CD | `infra.md` | Built in |
| Mobile, data, library | — | Detected and reported; no lens yet |

## Precedence

1. What the user says in the conversation
2. The repo's `CLAUDE.md` files, and lens files in the workspace's `lenses/` folder (`.factree/lenses/frontend.md` replaces or extends the built-in `frontend.md`; say which at the top)
3. These built-in lenses
4. The skill's core process

## Lens contract

Every lens has these sections, so skills can rely on them:

- **Signals:** what detection looks for. For built-in lenses, `detect.sh` encodes these; here they're for reference.
- **Patterns to inventory:** the areas whose existing patterns a plan must find and reuse or justify replacing.
- **Gaps to check:** questions `/factree:spec` adds to its gap checklist for this kind of code.
- **Scale triggers:** situations where a plan must check or ask about load, with the question to ask.
- **Design sections:** sections `/factree:plan` adds to `design.md` for this kind of code.
- **Failure handling:** what to map each failure scenario onto.
- **Test mapping:** which kind of test proves which kind of scenario.

One section is optional:

- **Detect:** a list of path patterns, each in backticks, naming the files this lens covers, relative to the folder being detected, e.g. `plugins/*/scripts/*.sh`. `*` matches any characters, including `/`. `detect.sh` reports a workspace lens for the files that match, at the deepest folder holding all of them. Built-in lenses leave it out; every generated lens has it.

## Generated lenses

When a plan touches code that no lens covers, `/factree:plan` drafts a workspace lens for that kind of code. The draft takes the repo's own conventions, with paths, plus general knowledge of what usually goes wrong. The skill asks you to approve it by name, then saves it as `<workspace>/lenses/<name>.md`. Its first line says it was generated, when, for which plan, and who approved it. From then on `detect.sh` finds it through its Detect patterns, so later plans use it without asking. Edit it like any other workspace lens. If you decline, that code is planned in a `general` vertical.
