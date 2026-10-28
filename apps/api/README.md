# linguistix API

Backend HTTP API for linguistix. It is an Express 5 app written in TypeScript and backed by PostgreSQL and Redis.

## Stack

| Area          | Tools                                                                             |
| ------------- | --------------------------------------------------------------------------------- |
| Runtime       | Node.js (ESM, `"type": "module"`), TypeScript (strict, `nodenext`)                |
| HTTP          | Express 5, `cookie-parser`                                                        |
| Database      | PostgreSQL 18 via `pg` (connection pool, raw SQL, no ORM)                         |
| Migrations    | `node-pg-migrate`                                                                 |
| Redis         | `redis` (node-redis): rate-limit counters, email cooldowns, job queue             |
| Rate limiting | `express-rate-limit` + `rate-limit-redis`                                         |
| Job queue     | BullMQ (verification emails), sent with `nodemailer` over SMTP                    |
| Validation    | Zod 4; schemas and DTOs are shared from `@repo/shared` (`packages/shared`)        |
| Auth          | JWTs in `HttpOnly` cookies (`jsonwebtoken`), `bcrypt` passwords, Google OAuth 2.0 |
| API docs      | OpenAPI 3 (`docs/api/openapi.yaml`) served with `swagger-ui-express`              |
| Testing       | Vitest + Supertest against a real test database and Redis                         |
| Dev tooling   | `tsx`, `nodemon`, `dotenv-cli`, ESLint (typescript-eslint), Prettier              |

> PostgreSQL **18+** is required, because the schema uses the built-in `uuidv7()` function for primary keys.

## Project structure

```
apps/api
├── docs/
│   ├── api/openapi.yaml        # OpenAPI spec (served at /api/docs in dev)
│   └── database.md             # database schema
├── migrations/                 # node-pg-migrate migrations
├── Dockerfile
└── src
    ├── server.ts               # entry point: starts the HTTP server and the email worker
    ├── app.ts                  # Express app: middlewares, global rate limit, Swagger UI, routers, error handler
    ├── features/
    │   ├── auth/               # auth feature module
    │   │   ├── auth.route.ts       # routes, request validation, auth rate limits, email cooldown
    │   │   ├── auth.controller.ts  # HTTP layer (req/res → service), cookies, redirects
    │   │   ├── auth.service.ts     # business logic (sessions, Google sign-in, email verification)
    │   │   ├── auth.repository.ts  # SQL queries for refresh and verification tokens
    │   │   ├── auth.schemas.ts     # Zod schemas for query strings and API-only bodies
    │   │   ├── auth.types.ts       # DB row / domain types
    │   │   ├── google.service.ts   # Google token exchange
    │   │   ├── utils/              # cookie and hashing helpers
    │   │   └── tests/              # integration tests
    │   └── user/               # user repository and types
    ├── jobs/
    │   ├── queues/email.queue.ts   # BullMQ queue for emails
    │   └── workers/email.worker.ts # worker that sends queued emails
    ├── lib/                    # shared clients: pg Pool, Redis client, SMTP transporter
    ├── shared/services/        # email service (verification email)
    ├── errors/AppError.ts      # error class carrying an ErrorCode and HTTP status
    ├── middlewares/
    │   ├── validator.ts        # validate({ body, query }) middleware
    │   └── errors.ts           # global error handler
    ├── types/express.d.ts      # adds req.validatedQuery
    └── utils/mappers.ts        # snake_case DB rows → camelCase domain objects
```

Each feature module follows the **route → controller → service → repository** layering.

### Errors

Every JSON error response has the same shape: `{ "errorCode": ErrorCode, "message": string }`. `ErrorCode` is defined in `@repo/shared`.

- `AppError` is returned with its own status code (by default from `ERROR_STATUS_MAP`).
- `ZodError` becomes `400` `VALIDATION_ERROR`, with the message of the first failed rule.
- Malformed JSON becomes `400` and a body over 100 KB becomes `413`, both `VALIDATION_ERROR`.
- Anything else becomes `500` `SERVER_ERROR`.

Rate-limit responses (`429`) use `errorCode` `REQUEST_LIMIT` or `COOLDOWN`. The Google callback and email verification endpoints redirect to the frontend with an `error` query parameter instead of returning JSON.

### Rate limiting

All counters live in Redis and are keyed by client IP. The app trusts one proxy hop (`trust proxy = 1`).

| Limit                      | Applies to                           | Redis prefix                  |
| -------------------------- | ------------------------------------ | ----------------------------- |
| 100 requests / 1 minute    | every route                          | `rl:global:`                  |
| 3 requests / 5 minutes     | `POST /api/auth/login`               | `rl:auth:login:`              |
| 3 requests / 5 minutes     | `POST /api/auth/resend-verification` | `rl:auth:resendVerification:` |
| 1 request / 60 s per email | `POST /api/auth/resend-verification` | `cooldown:<email>:send_email` |

### Email

Verification emails are not sent in the request. The service adds a job to the BullMQ `email-queue`, and the worker started by `server.ts` sends it (up to 3 attempts, exponential backoff). SMTP goes to the Mailtrap sandbox (`sandbox.smtp.mailtrap.io`), so emails show up in your Mailtrap inbox and are not delivered.

## Getting started

### 1. Prerequisites

- Node.js 24 or newer
- pnpm
- Docker, to run PostgreSQL and Redis

### 2. Install dependencies

Run this from the **repository root**:

```bash
pnpm install
```

### 3. Configure environment variables

Both env files live in the **repository root** (`../../.env` and `../../.env.test` relative to this app). Git ignores them.

**`.env`** is used by `docker compose`, `pnpm dev` and `pnpm migrate:dev`:

```dotenv
# Used by compose.yml to create the PostgreSQL and Redis containers
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=linguistix
DB_PORT=5432            # host port PostgreSQL is published on
# REDIS_PORT=6379       # host port Redis is published on (default 6379)
# REDIS_ARGS=           # extra arguments for redis-server

# Used by the API and migrations
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/linguistix"
REDIS_URL="redis://localhost:6379"

# Signing key for access and refresh tokens
SECRET_KEY=change-me

# Public URLs
BACKEND_URL=http://localhost:3000    # used in verification email links
FRONTEND_URL=http://localhost:5173   # redirect target after Google sign-in and email verification

# Google OAuth client
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

# Mailtrap sandbox SMTP credentials
SMTP_USER=
SMTP_PASS=

# Set to "dev" to serve Swagger UI at /api/docs
NODE_ENV=dev

# Optional: HTTP port of the API (default 3000)
# PORT=3000
```

`NODE_ENV=production` adds the `Secure` attribute to cookies.

**`.env.test`** is used by `pnpm test` and `pnpm migrate:test`. It points to a separate database, because the tests **truncate the `users` table**:

```dotenv
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/linguistix_test"
SECRET_KEY=test-secret
```

Keep the user, password and port in `DATABASE_URL` consistent with `POSTGRES_USER`, `POSTGRES_PASSWORD` and `DB_PORT`.

### 4. Start PostgreSQL and Redis

From the repository root:

```bash
docker compose up -d postgres_db redis
```

This starts a `postgres:18` container and a `redis` container. On the **first** start (when the `pgdata` volume is empty), `init-test-db.sh` also creates the `linguistix_test` database.

If the volume already existed before that script was added, create the test database yourself:

```bash
docker exec -it postgres_db psql -U postgres -c "CREATE DATABASE linguistix_test;"
```

### 5. Run migrations

```bash
pnpm migrate:dev up
```

### 6. Run the server

```bash
pnpm dev
```

The API listens on `http://localhost:3000`, or on `PORT` if it is set. The email worker runs in the same process.

- Swagger UI: <http://localhost:3000/api/docs> (only when `NODE_ENV=dev`)
- The spec is read from `docs/api/openapi.yaml` relative to the current working directory, so run the server from `apps/api`. The pnpm scripts already do this.

## Scripts

Run these from `apps/api`. From the repository root, use `pnpm --filter api <script>`.

| Script              | What it does                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`          | Runs `src/server.ts` with `tsx` and restarts on changes (`nodemon`). Loads env from root `.env`.                                |
| `pnpm build`        | Builds `@repo/shared`, then compiles `src` to `dist` with `tsc`. Test files are excluded.                                       |
| `pnpm start`        | Runs the compiled server (`node dist/server.js`). Env vars must already be set in the shell. See [Known issues](#known-issues). |
| `pnpm test`         | Applies migrations to the test DB, then runs Vitest with root `.env.test`, one file at a time.                                  |
| `pnpm migrate`      | Raw `node-pg-migrate` CLI. Reads `DATABASE_URL` from the environment.                                                           |
| `pnpm migrate:dev`  | `node-pg-migrate` with root `.env`, e.g. `pnpm migrate:dev up` or `pnpm migrate:dev down`.                                      |
| `pnpm migrate:test` | `node-pg-migrate` with root `.env.test`.                                                                                        |
| `pnpm lint`         | Runs ESLint.                                                                                                                    |
| `pnpm lint:fix`     | Runs ESLint and auto-fixes problems.                                                                                            |

To create a new migration:

```bash
pnpm migrate create <migration-name>
```

## Testing

```bash
pnpm test                 # watch mode
pnpm test --run           # single run (e.g. in CI)
```

Tests are integration tests. They send real HTTP requests to the Express app with Supertest and check the results in PostgreSQL. The Google token exchange, the email queue and the SMTP transporter are mocked with `vi.mock`.

A running database, a running Redis and a valid `.env.test` are required.

- **Never point `.env.test` at your dev database**: the tests run `TRUNCATE TABLE users CASCADE`.
- Before each test, all Redis keys matching `rl:*` and `cooldown:*` are deleted. Without `REDIS_URL` in `.env.test` the tests use `localhost:6379`, so this also resets the rate limits of a dev server that uses the same Redis.

## API

The full contract is in [`docs/api/openapi.yaml`](./docs/api/openapi.yaml). You can also browse it in Swagger UI at `/api/docs`. The database schema is described in [`docs/database.md`](./docs/database.md).
