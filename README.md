# Cadence

A calm, personal work/break timer built with Next.js 16.3.5 App Router, TypeScript, Tailwind, Recharts, Neon PostgreSQL, and Better Auth. Light and midnight-blue themes with electric and neon-blue accents. No fabricated stats or shared account data.

## Run locally

```sh
npm ci
npm run dev
```

Open http://localhost:3000. The home page is a profile chooser. Without database/auth configuration, a clearly labeled local preview saves real timer data in this browser. Local preview data is not password-protected or uploaded to an account.

## Neon setup

This workspace is linked to project `icy-moon-84080057`, branch `production`. The requested config is intentionally:

```ts
import { defineConfig } from "@neon/config/v1";
export default defineConfig({});
```

Setup commands:

```sh
npm i -g neon@latest
neon login
neon skills -y
neon mcp -y
neon link --project-id icy-moon-84080057 --branch production -y
neon config init
# Restore the exact config above if init generates a starter policy.
neon deploy
```

`neon deploy` reconciles backend configuration and pulls database environment variables. It does **not** publish the Next.js frontend. `.neon` and `.env*` are ignored. The CLI's `mcp -y` installs into detected agents and uses its default API-key scope; manage/revoke that key in your Neon account if needed.

Copy `.env.example` to `.env.local` when configuring a new workspace, then set:

| Variable                | Purpose                                                                        |
| ----------------------- | ------------------------------------------------------------------------------ |
| `DATABASE_URL`          | Pooled Neon connection for app traffic                                         |
| `DATABASE_URL_UNPOOLED` | Direct connection for migrations                                               |
| `BETTER_AUTH_SECRET`    | Random secret, at least 32 characters; generate with `openssl rand -base64 32` |
| `BETTER_AUTH_URL`       | App origin, `http://localhost:3000` for development                            |
| `GOOGLE_CLIENT_ID`      | Optional Google OAuth client                                                   |
| `GOOGLE_CLIENT_SECRET`  | Optional Google OAuth secret                                                   |

All are server-only; never add `NEXT_PUBLIC_` to database credentials or auth secrets. This app requires no Supabase project or service-role key.

Apply migrations before enabling the connected app:

```sh
npm run db:migrate
```

The migration runner takes an advisory lock, tracks applied files, and applies each migration transactionally over the direct connection. Test schema changes on a Neon branch first. It creates `cadence_*` authentication tables and the separate `cadence` application schema; no existing tables are dropped.

## Profiles and authentication

Create a profile with a name, email, and password. Profiles previously used on **this browser** appear on the home page; the app does not publish a global user directory. Every account profile requires its password (or configured Google sign-in) to open. The profile name/email index is stored on this device so the chooser can remember it. Timer data remains private.

Better Auth runs in Next.js route handlers and stores auth data in Neon. The app manages authentication with Better Auth, while the empty Neon service config declares PostgreSQL only. Password hashing, sessions, and OAuth are handled by Better Auth. The profile trigger creates a profile at signup. Email/password signup is enabled without mandatory email verification; add a mail provider and the Better Auth verification/reset callbacks if email verification or password-recovery email is required.

Google sign-in appears only when both Google variables exist. Set the Google authorized redirect URI to `https://YOUR_DOMAIN/api/auth/callback/google` and its authorized JavaScript origin to your app origin. Use localhost equivalents for development.

Returning to the profile chooser or using Lock/switch profile signs out and clears cached account timer/profile data from this browser. The chooser remembers only the profile index. On a shared device, use Lock/switch profile before leaving. As with ordinary web apps, a person with access to an already-unlocked browser session can use that session.

## Data isolation

- `cadence.profiles`: preferences and identity; profile `id` matches the auth user UUID.
- `cadence.sessions`: work/break plans, timestamps, `completed`/`abandoned` status; `NULL` means active, with only one active session per user.
- `cadence.intervals`: interval-level duration, planned duration, completion, and timestamps; one open interval per session.
- Every application query validates the session on the server, uses parameterized SQL, starts a transaction, switches to the **non-BYPASSRLS** `cadence_authenticated` role, and sets a transaction-local user ID. RLS checks profile ownership, session ownership, and interval ownership through the session.
- The database login is server-only. Clients cannot set the transaction-local identity. Auth tables are not granted to the application role.
- Atomic `cadence.save_timer` saves a snapshot and its interval rows under an optimistic revision lock. It rejects stale updates and finished-session rewrites. Unique indexes prevent duplicate active sessions/intervals.
- Insights read actual interval rows from PostgreSQL and refresh every 15 seconds while visible and on returning to the tab. This uses polling rather than Supabase Realtime.

## Timer behavior

- Defaults: 50 minutes work / 10 minutes break. Presets: 25/5, 50/10, 90/20, plus step controls/sliders/custom input. Save default durations in Settings; duration changes before starting affect that session.
- Work → break → work continues until Finish or Reset. Pause excludes wall-clock time; Skip records a partial, incomplete interval; Reset records an abandoned session. Every actual focus second counts, including partial work and reset/abandoned sessions.
- The pure engine in `lib/timer/core.ts` calculates from timestamps. The hook updates the display every 250 ms and catches up across all elapsed boundaries after tab suspension, reload, or device sleep. A sleeping browser cannot deliver an exact-time notification; it catches up when resumed.
- Browser storage holds a per-account outbox. Serial, coalesced saves retain unsynced work across reloads and retry on reconnect. Web Locks prevent two tabs in the same browser from independently running the same account timer. A cross-device conflict offers an export before choosing the saved account version.
- Distinct transition chimes and banners accompany phase changes. Notifications require the explicit reminder button and browser permission, and appear when the page is not visible. Browser autoplay/OS notification restrictions still apply.
- System theme is the default. A header toggle and Settings appearance options persist the user's choice.

## Insights

Today's actual focus, completed work intervals, completion rate, longest daily streak, 7/30-day focus chart, and 90-day heatmap. Additional insights: all-time focus, average and longest actual work interval, focus-active days, actual break time, completed breaks, and comparison with the previous seven days.

Focus includes the current interval and unfinished/abandoned work. Totals are displayed in minutes rounded to one decimal for today's/chart values and whole minutes in the broader overview. Data is grouped by the interval's **start date in the viewer's current local timezone**; intervals crossing midnight are attributed to that start date. A streak day has at least one fully completed work interval.

Concentration score = `(completed work / started work) × average(min(actual duration / planned duration, 1)) × 100`. Hover or keyboard-focus the info icon for the day's factors. It is a descriptive measure, not a medical or productivity assessment.

## Verify

```sh
npm test
npm run lint
npm run typecheck
npm run build
```

Timer tests cover sleep catch-up, pause/resume, skip, completed vs abandoned sessions, serialization, concentration, streaks, invalid durations, and counting reset/live focus.

Backend smoke tests use only the disposable validation app on port 3001. RLS tests require `NEON_BRANCH=cadence-validation-20260922` and refuse other branches:

```sh
node tests/backend.smoke.mjs
node --env-file=/tmp/cadence-validation.env tests/rls.smoke.mjs
```

They exercise signup/profile creation, signin/out, protected requests, interval persistence, revision conflicts, profile preferences, and API plus SQL-level cross-account isolation. The validation branch automatically expires on 2026-09-23; test accounts live only there.

For simultaneous build and preview work, set a separate output directory: `CADENCE_DIST_DIR=.next-build npm run build`. Do not run a dev server and build against the same output directory.

## Vercel

1. Push this folder to a Git repository and import it into Vercel as a Next.js project.
2. Use Node.js 22, install `npm ci`, build `npm run build`; leave the output directory at its framework default.
3. Set `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL` in Vercel. `BETTER_AUTH_URL` must match the deployed HTTPS origin. Add Google variables if using OAuth. Keep `DATABASE_URL_UNPOOLED` in your migration environment; the running app does not need it.
4. Apply reviewed migrations with `npm run db:migrate` before directing traffic to the app. Do not run migrations in every preview build. Use separate Neon branches and origins for previews.
5. Deploy, then verify two separate accounts cannot see each other's history, reload an active timer, and test profile locking.

The database pool uses `@vercel/functions` pool lifecycle support. No Vercel account is connected in this workspace; the frontend has not been publicly deployed. The Neon backend setup is separate from frontend hosting.

## Dependency audit

Upgraded to Next.js 16.3.5 and React 19.3.0 with user approval. The installation audit reports zero vulnerabilities as of 2026-09-22. Re-run `npm audit` as part of maintenance.
