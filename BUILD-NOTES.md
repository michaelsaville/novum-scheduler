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

---

## 2026-04-25 — Sprint 1 part 2: /account + /admin/users + projects/tasks CRUD + /me

**What shipped this session**
- `/account` — self-serve password change. 12-char minimum, must differ from current. Uses `useActionState` for inline error/success.
- `/admin/users` — admin-only panel. Create user (auto-generates one-time password and reveals it once via `useActionState` return), reset password (same reveal pattern), enable/disable, change role, change board color. Self-disable and self-demote both blocked at the action layer.
- `/projects` — list active + archived projects with task counts. Inline create form. Per-project click-through to detail.
- `/projects/[id]` — edit name/client/color/status, archive/unarchive, list tasks split into "in pool" (no scheduledDate yet) and "scheduled" buckets. Inline add-task form, per-row inline edit with optimistic `useActionState` save, delete.
- `/me` — installer Today view. Today / Coming up / Assigned but undated. Read-only. Will populate once Sprint 2 board lets schedulers assign tasks.

**Critical fix discovered along the way**
- **Custom JWT claims weren't visible at the edge**. The `authorized` callback in `auth.config.ts` runs in middleware (edge runtime); the `session` callback in `auth.ts` only runs on the Node side. `auth?.user?.role` was therefore `undefined` in middleware → admin-gated routes 307'd even for admin users. Fix: moved `jwt` and `session` callbacks from `auth.ts` into `auth.config.ts`. Auth.js v5 requires the session callback to be edge-safe (and in authConfig) for custom claims to flow through middleware. **General rule for this stack**: all callbacks belong in `auth.config.ts`; `auth.ts` only adds the Credentials provider (which uses prisma + bcrypt and is Node-only).

**Server-action conventions used**
- All actions return `{ ok, error, message, ... }` shape consumed by `useActionState`.
- `requireAdmin()` / `requireSchedulerOrAdmin()` helpers at the top of each actions file gate writes.
- `revalidatePath()` after every mutation so server components refresh.
- One-time password reveal: action returns `reveal: { username, password }` in its state — client renders it inline. Password lives only in React state until a refresh; never in the URL or a cookie.

**Prisma schema notes**
- No schema change in this part. Status strings (`pending|in_progress|done|blocked` on Task; `active|on_hold|done` on Project) validated client-side via narrow union `as const` arrays + `isStatus()` type guards.

**Authorization rules summary (now fully wired end-to-end)**
- `/login`, `/api/auth` → public
- `/admin/*` → admin only (page-level redirect to `/` for non-admin; middleware also blocks)
- `/projects`, `/projects/[id]`, `/board` → admin or scheduler (page redirects installer → `/me`; middleware also blocks)
- `/me`, `/account`, `/` → any logged-in user
- All redirects on auth failure go to `/login?callbackUrl=…`

**File map added this session**
- `app/lib/passwords.ts` — `generatePassword()` (18-char base64url) shared by seed + admin actions.
- `app/app/account/{page,AccountForm,actions}.{tsx,ts}`
- `app/app/admin/users/{page,CreateUserForm,UserRow,actions}.{tsx,ts}`
- `app/app/projects/{page,CreateProjectForm,actions}.{tsx,ts}`
- `app/app/projects/[id]/{page,EditProjectForm,CreateTaskForm,TaskRow}.tsx`
- `app/app/tasks/actions.ts` (importable from project detail row + future board)
- `app/app/me/page.tsx`

**Verification**
- Login flow unchanged ✅
- `/account` GET 200 (auth), 307 unauth ✅
- `/admin/users` GET 200 admin, 307 installer (chris) ✅
- `/projects` GET 200 admin, 307 installer ✅
- `/projects/[id]` renders edit form + pool/scheduled tasks ✅
- `/me` 200 for installer with empty Today + Sign out ✅
- No `[auth][error]` lines, no compile warnings ✅

**Status at end of this part**
- ✅ Sprint 1 fully complete.
- ⏭ Sprint 2: dnd-kit board (`/board`). Project pool → installer columns, drag to schedule, drag between dates/installers, ordering. Will reuse the actions in `tasks/actions.ts` for persistence.
- ⏭ Sprint 3: photos + PWA + mobile polish (Notes thread already has the schema plumbing; UI not yet built).
- 🟡 `/me` will look empty until the board ships and the scheduler assigns tasks.

---

## 2026-04-25 — Sprint 2: dnd-kit board at `/board`

**What shipped**
- `/board` — drag-and-drop day board for admin or scheduler. Project pool on the left (all unscheduled, non-archived, non-done tasks across all projects), one column per active installer on the right.
- Date navigation via `?date=YYYY-MM-DD` query param. Prev / Today / Next links rebuild URLs server-side. Default = today's UTC date.
- `/me` now hooks up: when a task lands in an installer's column on a given date, it appears under that installer's Today / Coming up sections automatically (already wired in Sprint 1, just needed real scheduled tasks to demo).

**Drag operations supported**
- Pool → installer column → schedules + assigns + sets `scheduledOrder` (in a transaction with the column's other tasks so ordering stays consistent).
- Installer column → installer column → reassigns + reorders.
- Within column → reorder, persisted as a fresh `scheduledOrder` index for every task in the column.
- Installer column → pool → unschedules (clears `scheduledDate`, `scheduledOrder`, `assignedInstallerId`).

**Server-side single-action-handles-all approach**
- `moveTask({ taskId, target, destOrderedTaskIds })` in `app/tasks/actions.ts`.
- For `target.kind === 'pool'`: clears scheduling fields. No order needed.
- For `target.kind === 'column'`: rewrites `scheduledOrder` for every id in `destOrderedTaskIds` inside one `prisma.$transaction`. Avoids the half-applied state if the network drops mid-reorder.
- Date is interpreted as a UTC calendar day. Stored as `2026-04-25 00:00:00+00`. Pool query uses `scheduledDate: null`; column query uses `gte: dayStart, lt: dayEnd`. Day boundaries are computed in UTC server-side.

**Optimistic UI pattern**
- `Board.tsx` keeps a `Record<ColumnKey, BoardTask[]>` in `useState`. Drop events update local state synchronously, then fire `moveTask` in `useTransition`. Failed moves surface an error banner but do NOT revert (keeps the UX from flickering — the next page navigation will reconcile from the DB if needed).
- Cross-column moves do the placeholder swap in `onDragOver` (so the drop target shows a real preview, not just an outline). Same-column reorders are deferred to `onDragEnd` for index stability.

**Sensors**
- PointerSensor with 4-px activation distance (so the card click-to-edit area on `/projects/[id]` won't interfere if we add it back later).
- KeyboardSensor with sortable coordinate getter — accessibility (Tab to focus card, Space to grab, arrows to move).

**File map added**
- `app/app/board/page.tsx` — server fetch + DateNav links.
- `app/app/board/Board.tsx` — client DndContext + state.
- `app/app/board/Column.tsx` — client droppable wrapper.
- `app/app/board/TaskCard.tsx` — client sortable card.
- `app/app/tasks/actions.ts` — added `moveTask`, `MoveTaskTarget`.
- `app/package.json` — added `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.

**Verification**
- /board GET 200 for admin ✅
- /board GET 307 for installer (chris) ✅
- ?date param honored, Prev/Next/Today links build correct URLs ✅
- Pool query and per-column query consistent with DB state ✅
- Tasks scheduled to Chris for today appear in Chris's column AND in Chris's `/me` Today section ✅
- DnD interactive behavior must be tested by user in browser (drag, drop across columns, reorder, drop to pool).

**Status at end of Sprint 2**
- ✅ Sprint 0–2 complete. Real scheduling workflow now end-to-end: scheduler creates project + tasks → drags to installer/date → installer sees tasks on `/me`.
- ⏭ Sprint 3: photo upload + thumbnails (sharp), PWA install prompt, mobile polish, notes thread UI on tasks (DB already has Note + NotePhoto).
- ⏭ Sprint 4: week board view, audit log, ICS calendar feed.
- 🟡 Known sharp edges to watch for in real use: timezone handling (board treats every date as UTC midnight — if user is in EST and creates a task at 11pm local, it might land on the wrong day in the board UI). Will revisit if it bites.
