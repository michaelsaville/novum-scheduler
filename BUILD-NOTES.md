# BUILD NOTES — Novum Scheduler

Append-only build log. Newest entries at the bottom. If it isn't here, it's undocumented.

---

## 2026-04-25 — Sprint 0 scaffold

**Customer / project framing**
- Customer: Novum Designs (graphic design installer crew)
- Goal: replace Asana for installer scheduling. 4-installer drag-drop board for scheduler; phone PWA for installers (tasks, notes, photos).
- Constraint from customer: data isolated from any other PCC2K database.
- Future revenue line: ~$50–75/mo recurring once live; not yet quoted.

**Stack chosen**
- Next.js 15 (App Router) + TypeScript + Tailwind + (shadcn/ui later)
- Prisma + Postgres in own container, own named volume
- Auth.js v5 credentials provider (Sprint 1)
- dnd-kit for the board (Sprint 2)
- next-pwa for installer phone install (Sprint 3)
- sharp for photo resize (Sprint 3)
- Photos stored in a named docker volume `/uploads`, served via authed Next.js route

**Infra layout (resolved)**
- App host: 100.115.11.109 (the DocHub host, which already runs tickethub/smellymelly/bizhub/coins/portal/taskhub). Sharing the docker daemon is fine — isolation is at the Postgres-container level, not the host level.
- App port: **3008** (next free in the 30xx convention; 3000–3007 + 3400 already taken).
- Reverse proxy: existing nginx at 100.91.194.83 fronts every pcc2k.com app. Caddy was briefly considered then rejected — nginx already owns 80/443 there.
- DNS: `novum.pcc2k.com` A record → 153.66.120.215 (verified resolving 2026-04-25 17:24).
- TLS: Let's Encrypt via `certbot --nginx`, same as every sibling vhost.

**Files created this session**
- Repo root: `.gitignore`, `README.md`, `BUILD-NOTES.md` (this file), `docker-compose.yml`, `.env.example`, `.env` (uncommitted; secrets generated locally)
- `app/`: `Dockerfile`, `package.json`, `tsconfig.json`, `next.config.js`, `postcss.config.js`, `tailwind.config.ts`
- `app/app/`: `layout.tsx`, `page.tsx`, `globals.css`
- `app/prisma/schema.prisma` — initial models: User, Project, Task, Note, NotePhoto. Project + Task carry `externalId`/`externalSource` for future Asana import.
- `app/lib/prisma.ts` — singleton Prisma client

**Env vars introduced**
- `POSTGRES_PASSWORD` — strong random, generated locally, stored only in `.env`
- `DATABASE_URL` — `postgresql://novum:${POSTGRES_PASSWORD}@db:5432/novum?schema=public`
- `NEXTAUTH_SECRET` — strong random, generated locally for Sprint 1 auth (placeholder now)
- `NEXTAUTH_URL` — `https://novum.pcc2k.com`

**Why no Postgres host port mapping**
- Other apps on this host expose db on 127.0.0.1:5433/5434/5435 for ad-hoc psql. Novum's stack keeps Postgres compose-internal only — fewer surfaces, and `docker compose exec db psql` covers the rare debug case. Revisit if needed.

**Build & deploy (this session)**
- Pinned versions to match what taskhub runs in prod on this same host: `next@16.2.1`, `react@19.2.4`, `@prisma/client@^6.19.2`, `prisma@^6.19.2`. Avoids a one-off Next 15 / RC-React divergence.
- `docker compose build app` — clean on first try, ~50s.
- `docker compose up -d` — db healthy in ~5s, app in ~4s. Confirmed `127.0.0.1:3008` returns 200.
- Schema applied with a one-shot container in the compose network (runner image has @prisma/client but no `prisma` CLI by design — pruned dev deps):
  ```
  docker run --rm --network novum-scheduler_default \
    -v /home/msaville/novum-scheduler/app:/work -w /work \
    -e DATABASE_URL=postgresql://novum:***@db:5432/novum?schema=public \
    node:20-alpine \
    npx --yes prisma@6.19.2 db push --schema=prisma/schema.prisma --skip-generate
  ```
  Verified 5 tables present: User, Project, Task, Note, NotePhoto.

**Reverse proxy + TLS**
- nginx vhost authored at `/etc/nginx/sites-available/novum` on 100.91.194.83, symlinked into `sites-enabled/`. Mirrors the taskhub vhost shape — same proxy headers, `client_max_body_size 25m` (Sprint 3 photo uploads), proxy buffers tuned for Next.js streamed responses.
- Cert via `certbot --nginx -d novum.pcc2k.com --redirect` — issued and deployed in one shot. Certbot rewrote the vhost in-place to add the SSL block + 80→443 301. Auto-renewal is on (certbot's systemd timer).
- Cert expires 2026-07-24.

**Smoke test results**
- `https://novum.pcc2k.com/` → 200, 6172B, valid TLS (`ssl_verify_result=0`)
- `http://novum.pcc2k.com/` → 301 → https
- Page title and Sprint 0 placeholder text both render through end-to-end.

**Status at end of session**
- ✅ Sprint 0 complete. Stack live, schema in DB, TLS valid, public URL reachable.
- ⏭ Sprint 1 ready to start: Auth.js v5 credentials provider, `/admin/users` panel, projects + tasks CRUD. Still need real names/emails for the 4 installers + scheduler before seeding accounts; will surface that to user.
- 🚫 Not yet committed to git remotely — local-only repo, no GitHub remote configured. Following the taskhub precedent (local-only git, no GitHub).

---

## 2026-04-25 — Sprint 1 part 1: auth + seeded users (resumed after disconnect)

**What shipped this session**
- Auth.js v5 credentials provider with bcrypt — username + password (no email infra).
- Edge-safe `auth.config.ts` (used by middleware) + Node-runtime `auth.ts` (Credentials provider, JWT callbacks).
- `app/api/auth/[...nextauth]/route.ts` re-exports `GET`/`POST` from `handlers`.
- Login page at `/login` (server-action, username/password, error rendering).
- Root page is auth-gated: installers redirect to `/me`, admin/scheduler land on a nav stub.
- 3 seed users created: `msaville` (admin), `chris` (installer), `jgoodrum` (installer). Dave dropped at user request — narrowed initial roster while we focus on Mark + 2 installers.

**Schema change**
- `User.email` → optional, `User.username` → required & unique (this is the login key now). Pushed via the same one-shot `prisma db push` pattern as Sprint 0. Note: schema had already been pushed before the disconnect, so this session's push was a no-op.

**Middleware matcher**
- Negative lookahead: `^(?!_next/static|_next/image|favicon.ico|api/auth|api/cron|api/webhooks|api/health).*` — explicitly excludes any future cron/webhook routes from withAuth, mirroring the prior TicketHub burn where withAuth 307'd a cron path silently for a day.

**Authorization rules (in `auth.config.ts`)**
- `/login`, `/api/auth` → public
- `/admin/*` → admin only
- `/board`, `/projects` → admin or scheduler
- everything else → any logged-in user
- unauthenticated → middleware redirects to `/login?callbackUrl=<requested>`

**Gotchas hit this session**
- **Route handler bug**: had `export { GET, POST } from '@/auth'` but `auth.ts` exports `handlers` (an object containing GET/POST), so the re-export resolved to `undefined`. Fixed to `import { handlers } from '@/auth'; export const { GET, POST } = handlers`.
- **`UntrustedHost` from Auth.js v5 behind nginx**: needed `trustHost: true` in `authConfig`. Without it `/api/auth/session` errors and the JWT cookie never sets. Set in the edge-safe config so middleware also sees it.
- **TS strict types**: declaring `User`/`Session` strict in `types/next-auth.d.ts` invalidated the loose `as { role?: string }` casts in `auth.ts`. Fixed by accessing `user.role` / `user.username` directly (now strongly typed).
- **Empty `name` in session**: my callbacks didn't propagate `user.name` → `token.name` → `session.user.name`. Default population didn't kick in because we declared `Session.user` with `name: string` required. Added explicit copies in both jwt and session callbacks.

**Seed**
- `prisma/seed.ts` — `tsx`-based, idempotent (skips existing usernames). Generates 18-char base64url passwords (~108 bits entropy). Prints once, never stored.
- Ran via one-shot `node:20-alpine` container in the compose network (the runner image has no `prisma`/`tsx`, intentionally — pruned dev deps).

**Initial credentials (printed once on 2026-04-25)**
- `msaville` → `pf3DhsUuZwvBL72zR8`
- `chris` → `AsL6Uc12UYVPDEneyS`
- `jgoodrum` → `RUbsHZtdFT-4me1i7_`
- These are also relayed in the chat session for the user to capture and distribute. **Recommend rotation via `/account` first sign-in; that page is not yet built — coming with the rest of Sprint 1.**

**Verification**
- `GET /` (unauth) → 307 → `/login?callbackUrl=…` ✅
- `GET /login` → 200 with form ✅
- Login as `msaville` via CSRF + `/api/auth/callback/credentials` → `__Secure-authjs.session-token` cookie set ✅
- `GET /` with cookie → 200, RSC payload contains "Welcome, Mark Saville (admin)." with admin nav links and Sign out form ✅
- No `[auth][error]` lines in container logs after the `trustHost: true` rebuild ✅

**Status at end of session**
- ✅ Sprint 1 part 1 (auth + seeded users) deployed live.
- ⏭ Sprint 1 part 2: `/admin/users` panel (create/edit/disable, password reset), `/account` (self-serve password change), projects CRUD, tasks CRUD.
- ⏭ Sprint 2: dnd-kit board.
