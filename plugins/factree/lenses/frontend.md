# Frontend lens

For web apps and component libraries running in the browser.

## Signals
React, Next.js, Angular, Vue, Nuxt, Svelte, SolidJS; state libraries (Redux, NgRx, Zustand, MobX); data fetching (TanStack Query, SWR, Apollo, RxJS services); component libraries (MUI, Angular Material, Tailwind, design-system packages).

## Patterns to inventory
Find two or three real examples of each that are relevant to the change, with file paths:
- **Components:** the design system or component library, how new components are structured and named, presentational vs container split
- **State:** local, shared and server state; where each lives
- **Data fetching:** clients, hooks or services, caching, loading and error handling, optimistic updates
- **Forms:** form library, validation, error display
- **Routing:** route definitions, guards, lazy loading
- **Styling:** CSS approach, tokens, theming, responsive breakpoints
- **i18n:** how strings are translated, date and number formatting
- **Feature flags and permissions:** how UI is hidden or disabled per role or flag
- **Accessibility:** existing patterns for focus, labels, keyboard navigation, live regions
- **Analytics:** how events are tracked
- **Tests:** component testing library, end-to-end tool, mocks for API calls, visual or snapshot tests

## Gaps to check
- What does the user see while it's loading, when it's empty, when it fails, and when it partly fails?
- What happens on a slow or flaky connection, or if the user navigates away midway?
- What happens on double click or repeated submit?
- Is there a visual design (Figma, screenshot) for this? Which frames? If there isn't one, say so rather than inventing a layout.
- Keyboard and screen reader behaviour: focus order, labels, announcements.
- Small screens: does the layout change?
- Text: is it translated? What happens with long translations or long user data (names, emails)?
- Which roles or flags see this, and what do others see instead?

## Scale triggers
Check the repo first (existing lists, pagination, virtualisation, bundle budgets). Ask only what the repo can't answer, one question at a time, and say what the answer changes.

| Trigger | Ask |
|---|---|
| Rendering a list or table | How many items at most? Above a few hundred this needs pagination or virtualisation. |
| Large API payloads | How big is the response for the largest customer? |
| Polling or live updates | How fresh must the data be? Polling every few seconds multiplies backend load by active users. |
| New dependency | What does it add to the bundle, and is there an existing library that does the job? |
| Heavy computation in the browser | What's the largest input, and what's the slowest device we support? |
| Many API calls on one screen | Can they be combined, and what happens if one fails? |

## Design sections
- **Component tree:** new and changed components, where they sit, and which are reused from the design system
- **UI states:** for each user-facing scenario, what the user sees while loading, empty, on error and on success
- **API contract consumed:** endpoints used, request and response shapes, and what to do if the endpoint isn't built yet (build against a mock that matches the contract)
- **Accessibility:** focus management, labels, keyboard support, announcements

## Failure handling
Map each failure scenario to: the UI state shown, the message text, whether the user can retry, and what happens to anything they had entered.

## Test mapping
| Scenario kind | Test |
|---|---|
| Component rendering and states (loading, empty, error) | Component test (Testing Library or the repo's equivalent) with mocked data |
| User flows across screens, permissions, real navigation | End-to-end test (Playwright, Cypress or the repo's equivalent) |
| Visual layout matching a design | Visual or screenshot test, if the repo has them; otherwise list for manual review |
| Accessibility | Automated checks (axe or the repo's equivalent) plus keyboard steps in end-to-end tests |
| Formatting and pure logic | Unit test |
