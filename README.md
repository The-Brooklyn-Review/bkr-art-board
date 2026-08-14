# TBR Art Board

Internal review tool for The Brooklyn Review's art submissions. Imports submissions from Submittable, renders and classifies every page/image, and gives editors a fast grid + lightbox for reviewing, tagging, and selecting work — including sharing an individual piece outside the tool via a short-lived public link (see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#sharing-an-artwork-outside-the-tool)).

## Local setup

```bash
npm install
cp .env.local.example .env.local   # fill in the values — see docs/OPERATIONS.md
npx prisma generate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and log in with `APP_PASSWORD`.

To browse the already-imported library you only need the Postgres and R2 credentials plus `APP_PASSWORD` — Submittable and Anthropic credentials are only needed for the import and tagging scripts. See [`docs/OPERATIONS.md`](docs/OPERATIONS.md) for the full environment variable reference.

## Scripts

```bash
npm run dev           # start the dev server
npm run build          # production build
npm run test           # run the test suite (vitest)
npm run lint            # eslint
npm run format:check    # prettier --check
npx tsx scripts/process-submission.ts   # import from Submittable (mutating)
npx tsx scripts/tag-all-artwork.ts      # run auto-tagging (mutating)
```

Full script reference, including which ones are read-only vs. mutating and what each one does, is in [`docs/OPERATIONS.md`](docs/OPERATIONS.md).

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how data flows from Submittable through storage to the review UI, and how the data model is organized.
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md) — running scripts, the two scheduled GitHub Actions workflows, troubleshooting, environment variables.
- [`docs/TAGGING.md`](docs/TAGGING.md) — the quarterly Claude API auto-tagging job: schedule, cost, scope, and how to run it manually.

## Stack

Next.js (App Router) · TypeScript · Prisma + Supabase Postgres · Cloudflare R2 · Claude API (tagging) · Vitest
