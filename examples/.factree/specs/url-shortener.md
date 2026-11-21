---
id: url-shortener
title: Short links
status: approved
owner: priya
sources:
  - LINK-12
approved_by: John Doe
approved_at: 2026-11-21
retired: []
created: 2026-11-21
updated: 2026-11-21
---
# Short links

## Purpose
Members share long links as short ones that redirect to the original, and see how often each was opened.

## Scope
**In:** shortening a link, redirecting from the short link, counting opens, a page to shorten and copy.
**Out:** custom domains, custom codes, QR codes, analytics beyond a count.
**Anti-goals:** a short link that ever leads anywhere other than the link that was shortened; codes someone can guess by counting.

## Observations
- O1 The API already serves JSON routes with request validation from a shared schema helper (`api/src/routes/index.ts:9`, `api/src/validate.ts:4`)
- O2 There's a Postgres database with migrations, and no links table yet (`api/migrations/`)

## Requirements

### Requirement: R1 Shorten a link
The service SHALL turn a full web link into a short link.
Source: LINK-12

#### Scenario: S1 A valid link
- **GIVEN** a member signed in
- **WHEN** they shorten `https://example.com/a/very/long/path?with=query`
- **THEN** they get a short link ending in a 7-character code

#### Scenario: S2 Not a link
- **GIVEN** a member signed in
- **WHEN** they shorten `example dot com`
- **THEN** they see "Enter a full link starting with http:// or https://"
- **AND** no short link is created

#### Scenario: S3 The same link twice
- **GIVEN** a member who already shortened a link
- **WHEN** they shorten the same link again
- **THEN** they get the same short link back

### Requirement: R2 Redirect
Opening a short link SHALL take the visitor to the original link.
Source: LINK-12

#### Scenario: S1 A known code
- **GIVEN** a short link for `https://example.com/page`
- **WHEN** anyone opens it
- **THEN** they land on `https://example.com/page`

#### Scenario: S2 An unknown code
- **GIVEN** no short link with the code `zzzzzzz`
- **WHEN** someone opens it
- **THEN** they see "This link doesn't exist" with a not-found status

### Requirement: R3 Count opens
The service SHALL count every time a short link is opened and show the count to its owner.
Source: LINK-12

#### Scenario: S1 Opened three times
- **GIVEN** a short link opened 3 times
- **WHEN** its owner looks at their links
- **THEN** it shows 3 opens

### Requirement: R4 Codes can't be guessed
Short codes MUST be random, never sequential.
Source: technical necessity, from the anti-goals

#### Scenario: S1 Two in a row
- **GIVEN** two links shortened one after the other
- **WHEN** their codes are compared
- **THEN** neither can be worked out from the other

### Requirement: R5 Shorten from the page
The page SHALL let a member paste a link, shorten it and copy the result.
Source: LINK-12

#### Scenario: S1 Shorten and see it
- **GIVEN** a member on the links page
- **WHEN** they paste a link and press Shorten
- **THEN** the short link appears with a Copy button

#### Scenario: S2 Copy
- **GIVEN** a short link on the page
- **WHEN** they press Copy
- **THEN** it's on their clipboard and the button says "Copied"

## Sketch

```
 Short links
 ┌─────────────────────────────────────────────┬──────────┐
 │ https://example.com/a/very/long/path?with=… │ Shorten  │
 └─────────────────────────────────────────────┴──────────┘
  sho.rt/k3X9q2a   [ Copy ]                    3 opens
```

## Code
Not built yet.

## Decisions
- D1 Random 7-character codes and no custom codes yet, because sequential codes let anyone walk through every link and custom codes need a naming policy first. (2026-11-21, Priya)
- D2 Links never expire unless their owner deletes them, because shared links live in docs and chats for years. (2026-11-21, Priya)

## Open questions
None yet.
