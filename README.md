# Agentic Software Factory

Linear tickets go through a refine agent and an implementor agent, then CI gates (lint, typecheck, tests, e2e, Fallow) with a fix loop of at most 3 rounds, AI code review and a browser QA agent, then merge and deploy to AWS Amplify + RDS. It runs on BugBoard, a customer-feedback app.

![Software factory pipeline](https://tsd-blog-content.s3.eu-central-1.amazonaws.com/classroom/uploads/10565876-dd9f-4b9f-a70c-9fcd5a86a2fe/full-factory-v2.png)

## What's in here

- `factory/agents/`: agent prompts: `refiner.md`, `implementor.md`, `reviewer.md`, `qa.md`
- `.github/workflows/`: `factory-refine.yml`, `factory-implement.yml`, `factory-review.yml`, `factory-qa.yml`, and `main.yml` (CI gates + deploy)
- `.claude/skills/`: `bugboard-browser-qa` (the QA agent's browser checks) and `vercel-react-best-practices`
- the rest of the repo: BugBoard itself, the product the factory ships changes to

## BugBoard (the app)

A customer-feedback board (Next.js + a legacy Express API + Postgres) that you build a software factory on.

### Run locally

```bash
npm ci
cp .env.example .env
docker compose up -d --wait db
npm run db:migrate && npm run db:seed
npm run dev
```

Open http://localhost:3000 and pick **Continue as Ada** or **Continue as Lin**. Admin password: `bugboard-admin` locally.

### Scripts

| Script | Does |
|---|---|
| `dev` / `build` / `start` | Next.js |
| `lint` / `typecheck` | ESLint / `tsc --noEmit` |
| `test` | Vitest against `DATABASE_URL` |
| `e2e` | Playwright (set `BASE_URL` to test a running app) |
| `db:migrate` / `db:seed` / `db:generate` | Drizzle migrations, demo data, new migration |
| `seed:backlog` | your Linear backlog (`-- --dry-run` to preview) |
| `factory:metrics` | PR stats for your factory |

### Env

| Variable | |
|---|---|
| `DATABASE_URL` | Postgres (local, CI) |
| `DATABASE_SECRET_ARN` | Secrets Manager secret with the URL (Amplify) |
| `SESSION_SECRET` | signs the session cookie |
| `ADMIN_PASSWORD` | admin sign-in; required in production |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | Sentry (off when unset) |
| `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | PostHog (off when unset) |
| `LINEAR_API_KEY`, `LINEAR_TEAM_KEY` | `seed:backlog` |

### Links

- Course: [Build Your Own Software Factory](https://www.theseniordev.com/app/classroom)

---

Built by [theSeniorDev](https://www.theseniordev.com) · part of the Software Mastery program
