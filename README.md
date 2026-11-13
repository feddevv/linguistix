# linguistix

An all-in-one platform for private language tutors and their students. Teachers can run classes, schedule lessons, assign and review homework, and keep a shared vocabulary with spaced repetition, all in one place instead of 5–6 separate services.

- [About the project](./docs/about.md)
- [MVP scope & features](./docs/mvp.md)

## Repository structure

This is a pnpm monorepo:

| Path              | Description                                   |
| ----------------- | --------------------------------------------- |
| `apps/api`        | Backend API — [README](./apps/api/README.md)  |
| `apps/web`        | Frontend app — [README](./apps/web/README.md) |
| `packages/shared` | Code shared between apps                      |
| `docs`            | Product documentation                         |

## Getting started

Requirements: Node.js, pnpm, Docker.

```bash
pnpm install          # install dependencies for all workspaces
docker compose up -d  # start PostgreSQL
```

Database settings are read from the root `.env` (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DB_PORT`).

See each app's README for how to run it.

## Git hooks

Hooks are managed by [Husky](https://typicode.github.io/husky/) and installed automatically by `pnpm install`.

| Hook         | What it does                                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pre-commit` | [lint-staged](https://github.com/lint-staged/lint-staged): ESLint `--fix` + Prettier on staged files (configs: `.lintstagedrc.json`, `apps/api/.lintstagedrc.json`) |
| `commit-msg` | [commitlint](https://commitlint.js.org/): enforces [Conventional Commits](https://www.conventionalcommits.org/) (`commitlint.config.mjs`)                           |
| `pre-push`   | `pnpm typecheck` across all workspaces                                                                                                                              |

To skip hooks in an emergency, use `git commit --no-verify` / `git push --no-verify`.
