# Backend lens

For services, APIs, workers and anything that owns data.

## Signals
Express, Fastify, NestJS, Koa, Hono, Rails, Django, FastAPI, Flask, Spring Boot, Laravel, Go HTTP routers, gRPC, ORMs and query builders (Prisma, Knex, TypeORM, Sequelize, ActiveRecord).

## Patterns to inventory
Find two or three real examples of each that are relevant to the change, with file paths:
- **Routing and handlers:** how endpoints are declared, versioned and grouped
- **Auth and permissions:** middleware, guards, policies, role checks
- **Validation:** request schemas, DTOs, form objects
- **Data access:** ORM models, repositories, query scopes, raw SQL conventions
- **Migrations:** tool, naming, how backfills are done, zero-downtime conventions
- **Transactions and consistency:** where transactions are opened, isolation used
- **Background work:** queues, jobs, schedulers, retries, idempotency keys
- **External calls:** HTTP clients, timeouts, retries, circuit breakers
- **Errors:** error types, response shape, logging and alerting
- **Config and flags:** feature flags, environment config, secrets
- **Caching:** what's cached, where, invalidation
- **Tests:** frameworks, factories and fixtures, how the database is handled in tests

## Gaps to check
- Who may call this, and what happens when someone who may not tries?
- Is the operation idempotent? What happens on retry or a double submit?
- What happens when two requests change the same thing at once?
- What happens to existing data: backfill, migration, or left as is?
- What happens when a dependency is slow, down or returns an error?
- Are there limits: page size, payload size, rate limits?
- Does anything need an audit trail, notification or event for other systems?

## Scale triggers
Check the repo first (migrations, indexes, existing similar features, docs on table sizes). Ask only what the repo can't answer, one question at a time, and say what the answer changes.

| Trigger | Ask |
|---|---|
| New table, or a column on a large table | How many rows will it hold in a year? Does adding the column need a backfill on a table of that size? |
| Query on a large table with no matching index | How many rows does the table have, and how often will this run? |
| New endpoint on a hot path | How many requests per second at peak? |
| Fan-out: one request causing many writes or calls | What's the largest N realistically? |
| Background job | How often does it run and how much does each run process? What if it overlaps with itself? |
| External call inside a request | What's that service's latency and rate limit? |
| Long-running request or export | What's the largest input, and what's the request timeout? |

## Design sections
- **Data:** schema changes, migrations, backfills, indexes
- **API contract:** method, path, request and response shapes, status codes

## Failure handling
Map each failure scenario to: the status code and response body, whether a transaction rolls back, retries and their limits, what gets logged or alerted.

## Test mapping
| Scenario kind | Test |
|---|---|
| Pure logic: formatting, calculations, mapping | Unit test |
| Endpoint behaviour, permissions, status codes | Route or request test against a real test database |
| Multi-step flows, jobs, external calls | Integration test, with external services stubbed at the boundary |
| Latency or volume targets | Performance test, following the repo's existing perf setup |
