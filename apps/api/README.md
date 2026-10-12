# linguistix API

Backend HTTP API for linguistix. It is an Express 5 app written in TypeScript and backed by PostgreSQL.

## Stack

| Area        | Tools                                                                      |
| ----------- | -------------------------------------------------------------------------- |
| Runtime     | Node.js (ESM, `"type": "module"`), TypeScript (strict, `nodenext`)         |
| HTTP        | Express 5                                                                  |
| Database    | PostgreSQL 18 via `pg` (connection pool, raw SQL, no ORM)                  |
| Migrations  | `node-pg-migrate`                                                          |
| Validation  | Zod 4; schemas and DTOs are shared from `@repo/shared` (`packages/shared`) |
| Auth        | `bcrypt` for password hashing                                              |
| API docs    | OpenAPI 3 (`docs/api/openapi.yaml`) served with `swagger-ui-express`       |
| Testing     | Vitest + Supertest, run against a real test database                       |
| Dev tooling | `tsx`, `nodemon`, `dotenv-cli`, ESLint (typescript-eslint), Prettier       |

> PostgreSQL **18+** is required, because the schema uses the built-in `uuidv7()` function for primary keys.

## Project structure

```
apps/api
├── docs/api/openapi.yaml   # OpenAPI spec (served at /api/docs)
├── migrations/             # node-pg-migrate migrations
└── src
    ├── server.ts           # entry point: starts the HTTP server
    ├── app.ts              # Express app: middlewares, Swagger UI, routers, error handler
    ├── auth/               # auth feature module
    │   ├── auth.route.ts       # routes + request validation
    │   ├── auth.controller.ts  # HTTP layer (req/res → service)
    │   ├── auth.service.ts     # business logic (e.g. password hashing)
    │   ├── auth.repository.ts  # SQL queries
    │   ├── auth.types.ts       # DB row / domain types
    │   └── tests/              # integration tests
    ├── db/pg.ts            # shared pg Pool (uses DATABASE_URL)
    ├── errors/HttpError.ts # error class carrying an HTTP status code
    ├── middlewares/
    │   ├── validator.ts    # validate({ body: zodSchema }) middleware
    │   └── errors.ts       # global error handler
    └── utils/mappers.ts    # snake_case DB rows → camelCase domain objects
```

Each feature module follows the **route → controller → service → repository** layering.

Every error response has the same shape: `{ "message": string }`.

- `HttpError` is returned with its own status code.
- `ZodError` becomes `400`, with the message of the first failed rule.
- Anything else becomes `500`.

## Getting started

### 1. Prerequisites

- Node.js 24 or newer
- pnpm
- Docker, to run PostgreSQL

### 2. Install dependencies

Run this from the **repository root**:

```bash
pnpm install
```

### 3. Configure environment variables

Both env files live in the **repository root** (`../../.env` and `../../.env.test` relative to this app). Git ignores them.

**`.env`** is used by `docker compose`, `pnpm dev` and `pnpm migrate:dev`:

```dotenv
# Used by compose.yml to create the PostgreSQL container
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=linguistix
DB_PORT=5432            # host port the container is published on

# Used by the API and migrations
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/linguistix"

# Optional: HTTP port of the API (default 3000)
# PORT=3000
```

**`.env.test`** is used by `pnpm test` and `pnpm migrate:test`. It points to a separate database, because the tests **truncate the `users` table**:

```dotenv
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/linguistix_test"
```

Keep the user, password and port in `DATABASE_URL` consistent with `POSTGRES_USER`, `POSTGRES_PASSWORD` and `DB_PORT`.

### 4. Start PostgreSQL

From the repository root:

```bash
docker compose up -d
```

This starts a `postgres:18` container. On the **first** start (when the `pgdata` volume is empty), `init-test-db.sh` also creates the `linguistix_test` database.

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

The API listens on `http://localhost:3000`, or on `PORT` if it is set.

- Swagger UI: <http://localhost:3000/api/docs>
- The spec is read from `docs/api/openapi.yaml` relative to the current working directory, so run the server from `apps/api`. The pnpm scripts already do this.

## Scripts

Run these from `apps/api`. From the repository root, use `pnpm --filter api <script>`.

| Script              | What it does                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`          | Runs `src/server.ts` with `tsx` and restarts on changes (`nodemon`). Loads env from root `.env`.                                |
| `pnpm build`        | Compiles `src` to `dist` with `tsc`. Test files are excluded.                                                                   |
| `pnpm start`        | Runs the compiled server (`node dist/server.js`). Env vars must already be set in the shell. See [Known issues](#known-issues). |
| `pnpm test`         | Applies migrations to the test DB, then runs Vitest with root `.env.test`.                                                      |
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

Tests are integration tests. They send real HTTP requests to the Express app with Supertest and check the results in PostgreSQL. A running database and a valid `.env.test` are required. **Never point `.env.test` at your dev database**: the tests run `TRUNCATE TABLE users CASCADE`.

## API

The full contract is in [`docs/api/openapi.yaml`](./docs/api/openapi.yaml). You can also browse it in Swagger UI at `/api/docs`.
