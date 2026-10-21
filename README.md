# VideoMax MBA

Upload a video, get a timestamped transcription you can click through and an AI
summary you can read in seconds.

## Getting Started

**Prerequisites:** Node.js 20+ and Docker (for the local Postgres).

```bash
npm install          # also runs `prisma generate`
cp .env.example .env.local
```

Open `.env.local` and set `SESSION_SECRET` to at least 32 random characters:

```bash
openssl rand -base64 32
```

Then start the database, apply the migrations, and run the dev server:

```bash
npm run db:up        # Postgres 16 on host port 5433
npm run db:migrate   # apply prisma/migrations
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> Postgres is published on **5433**, not the default 5432, so it does not
> collide with a system-wide Postgres. If 3000 is taken, `next dev` picks the
> next free port.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | Unit and integration tests |
| `npm run test:unit` | Unit and component tests only (no Docker needed) |
| `npm run test:integration` | Integration tests against a throwaway Postgres |
| `npm run lint` | ESLint |
| `npm run db:up` / `db:down` | Start/stop the local Postgres container |
| `npm run db:migrate` | Create and apply a migration (dev) |
| `npm run db:deploy` | Apply existing migrations (production) |
| `npm run db:generate` | Regenerate the Prisma client |
| `npm run db:studio` | Prisma Studio |

## Testing

Unit and component tests run in jsdom and need nothing external. Integration tests
spin up their own disposable Postgres with
[testcontainers](https://testcontainers.com/) and replay the committed
migrations against it, so **Docker must be running** for `npm test`. They never
touch the `db:up` development database.

## Environment variables

Both live in `.env.local` (see `.env.example`):

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `SESSION_SECRET` | Signs the `videomax_session` cookie; 32+ characters |

## Architecture notes

- **App Router** with [Cache Components](https://nextjs.org/docs/app/getting-started/caching)
  enabled. Anything that reads the session is a request-time read and must sit
  behind a `<Suspense>` boundary — see `app/_components/SessionRedirect.tsx`.
- **Mutations are Server Actions**, not route handlers, so they get Next.js's
  origin check for free and keep working without JavaScript.
- **Sessions are opaque rows** in the `session` table, referenced by a signed
  cookie — not JWTs — so revoking one (or all of a user's) is a single DELETE.
  They slide 30 days on use, with a hard 60-day cap.
- **`getSession()`** in `app/_lib/session.ts` is the one place that answers "who
  is making this request?". Authorization should go through it rather than
  reading the cookie directly.
