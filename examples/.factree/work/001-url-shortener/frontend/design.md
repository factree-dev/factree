---
work: 001-url-shortener
vertical: frontend
---
# Design: Short links (frontend)

## Patterns

### Reused
- **P4 Forms that post JSON:** `useSubmit` posts, tracks loading and shows the server's error under the field (`web/src/hooks/useSubmit.ts:6`, used by `web/src/members/InviteForm.tsx:18`). Fits R5.S1 and shows R1.S2's message.
- **P5 Copy to clipboard:** `CopyButton` writes to the clipboard and says "Copied" for two seconds (`web/src/ui/CopyButton.tsx:3`, used on `web/src/settings/ApiKeys.tsx:51`). Fits R5.S2 exactly.
- **P6 Component tests:** Testing Library with mocked fetch, as in `web/src/members/InviteForm.test.tsx`. Fits because R5 is component behaviour.

### New
None.

## Approach
A `LinksPage` with a one-field form. On success it shows the short link with a `CopyButton` and adds it to the list of the member's links with their open counts.

## Load and scale
Not applicable.

## Components

| Component | Change | Responsibility | Serves |
|---|---|---|---|
| `web/src/links/LinksPage.tsx` | New | Form, result, list | R5 |
| `web/src/routes.tsx` | Modify | Add `/links` | R5 |

## Interfaces
`<LinksPage />`.

### API contract consumed
`POST /links` and `GET /links`: defined in [backend/design.md](../backend/design.md#api-contract), not repeated here.

## Data
Not applicable.

## Flows
Paste → Shorten → `useSubmit` → the short link with Copy appears at the top of the list.

## Error handling

| Scenario | Handling |
|---|---|
| R1.S2 Not a link | The server's message under the field |
| Network error | `useSubmit`'s existing toast |

## Test strategy

| Scenario | Test type | File |
|---|---|---|
| R5.S1, R5.S2 | Component test, fetch mocked | `web/src/links/LinksPage.test.tsx` |

## Component tree
`LinksPage` → form, result (`CopyButton`), list.

## UI states

| Scenario | Loading | Error | Success |
|---|---|---|---|
| R5.S1 | Shorten shows a spinner and is disabled | Message under the field | Short link with Copy |
| R5.S2 | — | — | "Copied" for two seconds |

## Accessibility
The field has a label; the result is announced with `role="status"`.

## Risks and rollout
A new page behind the nav link; rollback is removing the route.
