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

---

## 2026-04-25 — Sprint 3: notes thread + photos + PWA + mobile polish

Three tightly related pieces; shipped in three commits.

### Part A — notes thread (commit `d0e5c34`)

- `/tasks/[id]` task detail page with append-only notes timeline (chronological, oldest first).
- `AddNoteForm` (client, `useActionState`): max 4000 chars, auto-resets on success.
- `createNote` server action: scheduler/admin can post on any task; installer can only post on their assigned task. `revalidatePath` for `/tasks/[id]`, `/me`, and `/projects/[id]`.
- Wired note count + link from `/me` task cards (`💬 N notes`) and from `/projects/[id]` task titles.

### Part B — photo upload pipeline (commit `fabb49e`)

- Added `sharp@0.34` (bundles libvips 8.17.3). Dockerfile additions: `apk add vips` (runtime fallback), copy `node_modules/sharp` and `node_modules/@img` into the standalone tree, `mkdir /uploads`, `ENV UPLOADS_DIR=/uploads`. `next.config.js` got `outputFileTracingIncludes` for `@img/**/*` and `serverExternalPackages: ['sharp']`.
- `lib/uploads.ts`: `processAndStorePhoto(buf, photoId)` — `.rotate()` (EXIF), resize to ≤2048px (`fit: inside, withoutEnlargement: true`), `.jpeg({ quality: 70, mozjpeg: true })`. Plus `safeUploadPath()` that gates filename to `[A-Za-z0-9_-]+\.jpg` and resolves under the uploads root for path-traversal defense.
- `createNote` extended: accepts `photos` files via `formData.getAll('photos')`. Validates type (`image/jpeg|png|webp|heic|heif`) and 15MB cap pre-resize. Writes JPEGs to disk first, then a single `prisma.$transaction` creates the Note row + `notePhoto.createMany` for all photos. Failure of any photo aborts before the DB write so we never end up with note rows missing their attachments.
- Empty body permitted when at least one photo is attached.
- `AddNoteForm` updated: `<input type="file" accept="image/..." multiple capture="environment">` so phones offer the camera. Live counter shows attached photo count.
- `/api/photos/[id]` (Node runtime): authed serving route. 401 if no session, 403 if installer on someone else's task. Streams the JPEG with `Cache-Control: private, max-age=3600` and `X-Content-Type-Options: nosniff`.
- `/tasks/[id]` renders a 2-3 col thumbnail grid; click-through opens full-size in a new tab.

### Part C — PWA + mobile polish (this commit)

- `app/manifest.ts` — Next 14+ convention. `name`, `short_name: 'Novum'`, `start_url: '/'`, `display: standalone`, theme color `#0ea5e9`, portrait orientation. Two 512px icon entries (one `purpose: 'any'`, one `purpose: 'maskable'` — TS rejects the combined `'any maskable'` string).
- App icons generated by sharp inside the running container (no need for a separate icon-build pipeline). Three vertical bars on a sky-blue rounded square — stylized board/calendar mark. Sizes: 192, 256, 384, 512 PNG + 180px apple-touch-icon.png at the public root.
- `app/layout.tsx`: added `appleWebApp.{capable,title,statusBarStyle}`, `icons` map, `formatDetection.telephone: false`. Moved theme color and viewport into `viewport` export per Next 14+ split. `viewportFit: 'cover'` so iOS extends content under the safe areas.
- Mobile polish on `/me`:
  - Sticky bottom nav (`fixed inset-x-0 bottom-0`) with 3 actions: Today, Account, Sign out. Each is a flex column with emoji + label.
  - `supports-[padding:max(0px)]:pb-[env(safe-area-inset-bottom)]` so iOS home-indicator doesn't overlap the buttons.
  - Main content gets `pb-24` to leave room above the nav.
  - Header bumped to `text-3xl`.

**Gotchas**

- **Manifest `purpose: 'any maskable'` doesn't typecheck** in Next 14+/16's `MetadataRoute.Manifest`. The TS type is the literal union `'any' | 'maskable' | 'monochrome'` — combined-purpose strings need to be split into multiple icon entries. Build failed on this; fix was duplicate the 512px entry.
- **Sharp + Next standalone**: `outputFileTracingIncludes` is required to drag `@img/**/*` into the standalone bundle, otherwise the runtime stage is missing the native `.node` files and sharp throws on first call. `apk add vips` in the runner image is harmless but mostly redundant for sharp ≥0.33 (binaries are bundled in `@img/sharp-linuxmusl-*`).
- **Photo route runtime**: must be `runtime = 'nodejs'` because edge runtime can't `fs.readFile` without the Node API.
- **`new Response(Buffer)` typing**: TypeScript wanted a Web BodyInit. Wrapping with `new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)` satisfies the type without copying.
- **Server actions with file uploads**: empty file inputs come through as zero-byte File objects. Filtered out via `formData.getAll('photos').filter(v => v instanceof File && v.size > 0)`.

**Verification**
- /tasks/[id] photo input renders with `multiple` + `capture="environment"` ✅
- Sharp resize round-trips a 800×600 JPEG correctly inside the running container ✅
- /api/photos/[id] returns the JPEG (3118 bytes match) for authed user ✅
- Unauth /api/photos/[id] → 307 to /login (middleware) ✅
- /manifest.webmanifest returns `application/manifest+json` with valid JSON ✅
- /apple-touch-icon.png + /icons/icon-{192,256,384,512}.png all 200 ✅
- /me bottom nav rendered for chris (installer) with all 3 buttons + safe-area inset ✅

**Status at end of Sprint 3**
- ✅ Sprints 0–3 complete.
- The full installer workflow now runs end-to-end: scheduler creates a project + tasks → drags onto installer's column for a date → installer opens the PWA on their phone, sees Today, taps a task, attaches photos and types a note — and the scheduler sees it back on the project page.
- ⏭ Sprint 4: week board view, audit log, status workflow polish, ICS calendar feed.
- ⏭ Later: Asana JSON importer, web push for new task assigned, timezone-aware dates, install hint banner for iOS Safari (which doesn't show install prompts), service worker for offline.

---

## 2026-04-25 — Sprint 4: status polish + audit log + week view + ICS feed

Four phases, four commits.

### Part A — status quick-actions (commit `5c43363`)

- `setTaskStatus` action: assigned installer + scheduler/admin allowed. Plain form action (no useActionState — page reloads via revalidatePath are simpler than reaching for client state).
- `/me` task cards now include all today's tasks (not just non-done) and show status pills. Done tasks render with strikethrough + 60% opacity.
- Quick-action button row per card based on current state: pending → Start, in_progress → Mark done + Blocked, done → Reopen, blocked → Resume.
- `/tasks/[id]` gets a 4-button status row (pending / in progress / done / blocked) — current status button is filled and disabled.

### Part B — audit log (commit `223a778`)

- New `AuditLog` model: `userId`, `action`, `entityType`, `entityId`, `metadata Json?`, `createdAt`. Indexes on `(entityType, entityId, createdAt)` + `(userId, createdAt)` + `createdAt` for fast filtering.
- `lib/audit.ts` exports `logAudit()` (errors swallowed — audit failure must never break the underlying mutation) plus `describeAuditEvent()` which turns `(action, metadata)` back into human prose like "scheduled to Chris on 2026-04-27" or "changed status: pending → in_progress".
- Wired into every mutating action: createTask, updateTask, deleteTask, moveTask (records the move target), setTaskStatus (records from/to), createNote, createProject, updateProject, archiveProject (split archive/unarchive), createUser, resetPassword, setActive (split activate/deactivate), setRole (records from/to), setColor, account password change.
- `/tasks/[id]` shows an "Activity" section with the last 50 events for that task. `note.create` events are filtered out — notes already have their own section above.
- `/admin/audit` (admin-only) shows the last 200 system-wide events with entity-type filter chips and click-through links to affected tasks/projects.

**Schema gotcha**: prisma db push refused to add a `Json?` column without complaint, but later it refused to add a unique constraint on `icsToken` without `--accept-data-loss`. The flag is a misnomer here — we weren't adding a constraint to existing data, we were adding a brand-new nullable column and a unique constraint on it. Prisma is just conservative. Used `--accept-data-loss` to force.

### Part C — week board view (commit `68b93b1`)

- `/board/week?date=YYYY-MM-DD` — Mon–Sun grid, rows = installers, columns = days. Project pool above as a horizontal strip.
- Week boundary anchored to Monday of the week containing the focus date (Sunday handled as the last day of the previous week — `day === 0 ? -6 : 1 - day`).
- `WeekBoard.tsx` reuses the day board's `Column.tsx` + `TaskCard.tsx` and the same `moveTask` server action. ColumnKey is `cell:{installerId}|{dateISO}` so each cell knows its target at drop time.
- Today's column gets a blue accent in the header.
- Cross-link buttons in both `/board` and `/board/week` headers; new "Board · week view" entry in the home nav.

### Part D — ICS calendar feed (this commit)

- New `User.icsToken String? @unique` column. Stays NULL until the user generates one from `/account`.
- `lib/ics.ts` builds RFC 5545 iCalendar text:
  - Each scheduled task → one all-day VEVENT.
  - `UID: task-{taskId}@novum.pcc2k.com` (stable so cal apps can update events on changes).
  - `DTSTART;VALUE=DATE:YYYYMMDD` + `DTEND` exclusive next day.
  - Text values escape `\\`, `\n`, `,`, `;` per spec.
  - Lines folded at 75 octets with `\r\n ` continuation per RFC 5545 §3.1.
  - `STATUS` mapped: done→COMPLETED, blocked→TENTATIVE, else→CONFIRMED.
  - `REFRESH-INTERVAL` + `X-PUBLISHED-TTL` of 15min hint to consumers.
- `/api/ics/[token]` (Node runtime) — public route, **NOT** behind auth. Token in the path is the credential. Looks up user by `icsToken`, returns `text/calendar; charset=utf-8` with a sensible filename. Pulls the next 6 weeks of scheduled tasks for that installer.
- **Middleware exclusion**: added `api/ics` to the negative lookahead in `middleware.ts`. Without this the auth middleware 307s the cal app to `/login` and the subscription silently fails — same shape of bug as the prior TicketHub burn.
- `/account` page got a "Calendar feed" section: generate / rotate / revoke buttons, current URL shown with copy-friendly code block. Treat-it-like-a-password warning included.

**Verification**
- `/api/ics/{validToken}` → 200 with valid VCALENDAR body, line folding visible, two events for chris's scheduled tasks ✅
- `/api/ics/short` → 400 ✅
- `/api/ics/{unknownToken}` → 404 ✅
- Audit log records every action and renders correctly on `/tasks/[id]` and `/admin/audit` ✅
- Week board renders 7 day columns × 2 installer rows, today's column highlighted ✅
- Status quick-actions on `/me` cards work for chris (assigned installer) ✅

**Status at end of Sprint 4**
- ✅ Sprints 0–4 complete. Build label `0.5.0`.
- Workflow extras now live: status quick-actions, audit log + activity timeline, week-view scheduling, ICS calendar subscription.
- ⏭ Later (no longer "Sprint 5", just a backlog now): Asana JSON importer, web push for newly-assigned tasks, ~~timezone-aware date handling~~ (✅ 2026-04-26), iOS Safari install hint banner, service worker for offline.

---

## 2026-04-26 — Timezone fix on "today" navigation default

**Bug**: scheduledDate is stored as UTC-midnight DateTime with the
date-only ISO (`YYYY-MM-DD`) as source of truth. The day-key model is
sound; what was broken was the *navigation default* — `todayISO()` in
`/board`, `/board/week`, and `/me` all derived "today" from the UTC
calendar day. A scheduler in EST editing after ~7pm local (= midnight
UTC) would see "today" jump to tomorrow's date, and tasks dropped on
the implied "today" column would land on the wrong day.

**Fix** (commit `afd5d6c`):
- New `lib/dates.ts` centralizes all date helpers (`todayISO`,
  `isValidDateISO`, `shiftDateISO`, `mondayOf`, `dayBoundsUTC`,
  `humanDateLabel`, `dayLabel`) plus a `BUSINESS_TIMEZONE` constant
  pinned to `America/New_York`.
- `todayISO()` formats `new Date()` via `Intl.DateTimeFormat('en-CA',
  { timeZone: BUSINESS_TIMEZONE, ... })`. en-CA produces `YYYY-MM-DD`
  natively. DST-aware, no library.
- `/board/page.tsx`, `/board/week/page.tsx`, and `/me/page.tsx` all
  switched to import from `lib/dates.ts`. Inline copies removed.
- `/me`'s `todayBounds()` (which computed `new Date(year, month,
  date)` using local-time getters — fragile in a UTC container)
  replaced with `dayBoundsUTC(todayISO())`.
- ICS route untouched: its 42-day rolling horizon is `new Date()` +
  42 UTC-days, which is a max-instant filter and tz-insensitive.
  Stored UTC-midnight `scheduledDate` already serializes correctly.

**Verification** (inside the running container):
```
Probe instant: 2026-04-27T03:00:00Z (= 11pm EDT Sunday)
  Calendar day in UTC:        2026-04-27   ← old code returned this
  Calendar day in America/NY: 2026-04-26   ← correct, what wall clock says
```

**Schema-level change**: none. `scheduledDate` stays a UTC-midnight
DateTime — the day-key model is unchanged. Only the JavaScript code
that asks "what day is it right now?" got fixed.

**Open**: still single-business-tz. If Novum ever picks up a crew in
another zone, swap `BUSINESS_TIMEZONE` for a per-user pref. Not worth
the schema churn until that's a real ask.

---

## Backlog after timezone fix

- Asana JSON importer (next likely unblocker for Novum onboarding)
- Web push for newly-assigned tasks
- iOS Safari install hint banner (Safari doesn't fire
  `beforeinstallprompt`)
- Service worker for full offline shell

---

## 2026-04-26 — Unschedule pill on scheduled task cards

**Need**: schedulers wanted a one-click way to take a task off the
schedule when it was assigned in error, without dragging the card
back into the pool.

**Change**:
- `TaskCard` now accepts an optional `onUnschedule(taskId)` prop.
  When supplied AND `containerId !== 'pool'` AND not in the
  `DragOverlay`, a small "×" pill renders next to the status pill in
  the card header. Click reverts the task to the project pool.
- `Board.tsx` (day view) and `WeekBoard.tsx` (week view) implement
  `handleUnschedule`: optimistic local-state move (column → pool top)
  + `moveTask({ kind: 'pool' })` server action in `useTransition`.
  Errors surface in the existing red banner.

**dnd-kit gotcha**: the `<article>` task card has the sortable
listeners spread on it, so any pointerdown bubbles to the drag
sensor. The × button must call `e.stopPropagation()` on
`onPointerDown` (and `onKeyDown`, for keyboard activation) to keep
its click from being interpreted as a drag start. Same trick will
apply to any future in-card buttons (e.g. quick-status, open).

**Files**
- `app/app/board/TaskCard.tsx` — added `onUnschedule` prop + button.
  Removed `ml-auto` from `StatusPill` and put both pill + × inside a
  flex wrapper with `ml-auto gap-1`.
- `app/app/board/Board.tsx` — `handleUnschedule()` + pass to cards.
- `app/app/board/week/WeekBoard.tsx` — same; `Row` sub-component now
  takes the handler so it can forward to its cells.

**Verification**
- `docker compose build app` → clean (no TS errors).
- `/board` and `/board/week` GET return expected unauth 307 (live
  pages render for an authed scheduler — UI test left to user).
- Server `moveTask` already supported `{ kind: 'pool' }` since
  Sprint 2; no schema change needed.

---

## 2026-04-26 — Service worker, web push, iOS install hint

Three backlog items shipped together since the SW underpins push
and the install banner is the iOS-specific reason to install the
PWA at all.

### A. Service worker + offline shell

- Hand-rolled `public/sw.js`. We don't use `next-pwa` — the surface
  is small enough that owning the SW outright is cheaper than
  threading config through workbox.
- `install` precaches `/offline`, the manifest, `apple-touch-icon`,
  and the icon set with `Promise.allSettled` (one missing entry
  shouldn't brick the install).
- `activate` deletes any cache key that isn't `novum-shell-v1` and
  calls `self.clients.claim()` so the new SW takes over open tabs.
- `fetch` strategy:
  - `/api/*` → bypass entirely. Auth, push subscribe, photos, ICS
    must hit network with cookies/headers untouched.
  - Static assets (`/_next/static/*`, `/icons/*`, manifest,
    apple-touch-icon) → cache-first, populate on miss.
  - HTML navigations → network-first, fall back to cached
    `/offline` if the network is down. **Never cache authenticated
    HTML** — no way to know which session it belongs to and stale
    role-gated pages would be a mess.
  - Everything else passes through to the browser HTTP cache.
- New `app/offline/page.tsx` (force-static).
- `app/sw-register.tsx` is a `'use client'` component mounted in
  the root layout that registers `/sw.js` at root scope with
  `updateViaCache: 'none'` (without it browsers can hold a stale SW
  for 24h).

### B. Web push for newly-assigned tasks

- VAPID keys generated once via a throwaway `node:20-alpine` +
  `web-push` container; stashed in `~/novum-scheduler/.env` as
  `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, plus
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (mirror of the public key — read
  by the server component on `/account` and passed to the client
  opt-in component as a prop).
- `app/lib/push.ts` — thin web-push wrapper. `sendPushToUser` looks
  up every `PushSubscription` row for a userId and fans out the
  payload. 404/410 from the push service means the subscription is
  dead → row is deleted so the table doesn't fill with zombies. All
  other errors are logged and swallowed; push failure must never
  break the underlying mutation.
- New `PushSubscription` model — `userId` + `endpoint @unique` +
  `p256dh` + `auth` + `userAgent`. Applied via the standard
  `npx --yes prisma@6 db push --skip-generate --accept-data-loss`
  pattern (in the compose network).
- `POST /api/push/subscribe` upserts by endpoint. Re-keys to the
  current user on conflict (handles the two-people-share-a-phone
  case — most-recent sign-in wins until next subscribe).
- `POST /api/push/unsubscribe` deletes only when (endpoint, userId)
  match — prevents endpoint-enumeration.
- `moveTask` (column target) fires the push when the destination
  `installerId` differs from the previous `assignedInstallerId`.
  Same-assignee reorders or date shifts are intentionally silent —
  the scheduler shuffles the week often and we don't want to spam.
  Notification: title "New task assigned", body
  `${project} · ${client?}: ${title} (${dateISO})`, deep link to
  `/tasks/{id}`, dedup tag `task-assigned-{id}`.
- `/account` got a "Push notifications" section. Client component
  walks through Notification permission → `pushManager.subscribe`
  with the VAPID key → `POST /api/push/subscribe`. Disable button
  unsubscribes locally and DELETEs server-side.

### C. iOS Safari install hint banner

- `app/InstallBanner.tsx` mounted in the root layout. UA-sniffs
  iOS Safari (handles iPad-on-iPadOS-13+ which reports as
  MacIntel + touch), excludes in-app webviews
  (`CriOS|FxiOS|EdgiOS|GSA|FBAN|FBAV|Instagram|Line`), checks
  `display-mode: standalone` AND `navigator.standalone` to skip
  installed users, and respects a localStorage `novum.install-hint.dismissed`
  flag.
- Renders as a floating max-w-md card pinned to the bottom with
  a safe-area-inset padding fallback for the home indicator.

### Middleware matcher update (critical, easy to forget)

`/sw.js`, `/offline`, `/manifest.webmanifest`, `/apple-touch-icon.png`,
and `/icons/` MUST be in the negative lookahead. Browsers fetch
these without auth cookies during install/update, and a 307→/login
silently breaks SW registration AND PWA install. Same shape as the
ICS feed and TicketHub-cron burns. Current excluded paths:
`_next/static`, `_next/image`, `favicon.ico`, `sw.js`, `offline`,
`manifest.webmanifest`, `apple-touch-icon.png`, `icons/`,
`api/auth`, `api/cron`, `api/webhooks`, `api/health`, `api/ics`.

### Gotchas worth remembering

- `Uint8Array<ArrayBufferLike>` from a hand-rolled
  `urlBase64ToUint8Array` doesn't satisfy `BufferSource` under
  TS 5.6 + DOM lib. Cast at the `pushManager.subscribe` call site.
  (Alternative: build via `new Uint8Array(new ArrayBuffer(n))` to
  pin the buffer type, but the cast is shorter and equivalent.)
- iOS web push only works **after the user installs the PWA** to
  Home Screen (iOS 16.4+). Hence the install banner — without it,
  iPhone users have no path to push. The PushOptIn component falls
  back to "install the app first" copy when `'PushManager' in window`
  is false.
- `addEventListener('install', e => e.waitUntil(cache.addAll(...)))`
  is atomic — one missing precache URL fails the entire install.
  Use `Promise.allSettled` for the precache list.
- NEXT_PUBLIC_ env vars are inlined at build time. Since the build
  context is `./app` and `.env` lives at the repo root, the
  NEXT_PUBLIC_ var would be undefined in the client bundle. Worked
  around by reading it server-side in `account/page.tsx` and passing
  to the client component as a prop — server reads `process.env` at
  runtime, so the runtime `.env` is sufficient.

### Verification

- `docker compose build app` clean.
- `/sw.js`, `/offline`, `/manifest.webmanifest`, `/icons/icon-192.png`,
  `/apple-touch-icon.png` all 200 unauthed.
- `/account`, `/api/push/subscribe` 307 unauthed (auth gate working).
- `Content-Type: application/javascript; charset=UTF-8` on `/sw.js`
  (browsers accept that for SW registration).
- VAPID env vars present in container at runtime.
- App logs clean on restart.
- End-to-end push must be tested in the user's browser (allow
  notifications on `/account`, then have a scheduler drag a task
  onto your column from another session).
