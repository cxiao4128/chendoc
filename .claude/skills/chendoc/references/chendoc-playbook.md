# ChenDoc Playbook

## Project Shape

- Root: `D:\desktop\bixu\js\chendoc`.
- Monorepo workspaces: `apps/admin` for the Vue 3/Vite/Pinia admin SPA, `server` for Fastify 5, Drizzle ORM, JWT/session logic, and Cloudflare R2 integrations.
- User-facing copy should be Chinese.
- Product direction: personal document management and knowledge publishing for one owner or a very small private workflow. Keep login, writing, publishing, review, and recovery direct.
- Avoid enterprise OA, team collaboration assumptions, marketing landing pages, generic AI dashboards, and heavy UI/security flows that slow normal local use.

## High-Value Files

- Project map and module routing: `FILE_GUIDE.md`.
- Product and design constraints: `PRODUCT.md`, `DESIGN_LANGUAGE.md`.
- Change/release constraints: `更改必读规范.md`.
- Root scripts and version: `package.json`, plus `apps/admin/package.json`, `server/package.json`, and `package-lock.json`.
- Server entry and route registration: `server/src/server.ts`, `server/src/app.ts`.
- DB schema and migrations: `server/src/db/schema.ts`, `server/src/db/schema.sqlite.ts`, `server/src/db/mysql.ts`, `server/src/db/migrate.ts`.
- Gateway packet layer: `apps/admin/src/gateway/client.ts`, `server/src/gateway/routes.ts`, `server/src/gateway/middleware.ts`.
- Auth/session: `server/src/modules/auth/*`, `server/src/middleware/auth.ts`, `apps/admin/src/api/auth.ts`, `apps/admin/src/pages/login/*`.
- Documents/editor/trash: `server/src/modules/docs/*`, `apps/admin/src/pages/docs/*`, `apps/admin/src/components/editor/*`.
- Shares/public pages: `server/src/modules/shares/*`, `server/src/modules/public/*`, `apps/admin/src/components/docs/ShareDialog.vue`.
- Uploads/R2/settings: `server/src/modules/uploads/*`, `server/src/modules/settings/*`, `apps/admin/src/api/uploads.ts`, `apps/admin/src/pages/settings/SettingsStoragePage.vue`.
- Admin settings/users/invites: `apps/admin/src/pages/settings/*`, `apps/admin/src/pages/invites/*`, `server/src/modules/invites/*`.

## Windows Commands

Use `npm.cmd` from `D:\desktop\bixu\js\chendoc`.

```powershell
npm.cmd install --workspaces --include-workspace-root
npm.cmd run dev
npm.cmd run build
npm.cmd --prefix apps/admin run build
npm.cmd --prefix server run build
npm.cmd --workspace @chendoc/server run test
npm.cmd --prefix server run db:migrate
npm.cmd audit --omit=dev
npm.cmd audit signatures
```

Root `npm.cmd run dev` is the production-like local path. It builds the admin app, copies it into `server/public/admin`, starts the server, and uses the root script's SQLite runtime override. If a task depends on the current port or DB, verify `.env`, process state, and `Get-NetTCPConnection` instead of assuming an old port is still active.

## Temporary Review Port

- For browser annotation on a temporary port, start the real `D:\desktop\bixu\js\chendoc` app, not a helper utility.
- If the chosen port has the wrong app, stop that process first, then rebuild and start ChenDoc.
- Fast path env: `PORT=<temp>`, `HOST=127.0.0.1`, `DATABASE_PROVIDER=sqlite`, `DATABASE_URL=./data/chendoc.sqlite`, `CHENDOC_ALLOW_SQLITE_RUNTIME=true`.
- Final report for temp-port setup: `URL`, `PID`, `logs`, verification, blockers.

## Validation Sets

- Frontend-only source change: `npm.cmd --prefix apps/admin run build`, then browser-verify the relevant local page if possible.
- Backend compile-level change: `npm.cmd --prefix server run build`.
- Backend behavior, auth, gateway, docs, shares, uploads, DB, or security change: run the focused server test or `npm.cmd --workspace @chendoc/server run test`; add `npm.cmd --prefix server run build`.
- Cross-workspace or release-sensitive change: run `npm.cmd run build`.
- Security/remediation release confidence: run `npm.cmd --workspace @chendoc/server run test`, `npm.cmd --prefix server run build`, `npm.cmd --prefix apps/admin run build`, `npm.cmd run build`, `npm.cmd audit --omit=dev`, and `npm.cmd audit signatures`.

If a validation command cannot run because of environment policy, missing external service, or existing local state, report the exact blocker and any narrower command that did run.

## Gateway and Auth Constraints

- Production API traffic goes through `POST /api/gateway` with AES-256-GCM plus RSA-OAEP key exchange. Do not bypass it for normal admin flows unless the task is explicitly about dev-only debugging.
- Gateway responses must stay packet-wrapped. For gateway traffic, raw business JSON is a regression; a good canary is `/api/crypto/public-key` through the gateway path and a wrapped body shaped like `{"data":"G21R..."}`.
- `server/src/gateway/middleware.ts` is the response re-wrap hook. `server/src/gateway/routes.ts` decrypts and dispatches internally through Fastify injection.
- Current auth direction is encrypted JWT carried in `Authorization`. Do not reintroduce `Set-Cookie`, cookie forwarding, or browser-persisted session storage unless the user explicitly changes this direction.
- Local login failures can mask schema drift. Check the real SQLite DB path, auth service error, and `auth_sessions.last_seen_at` before blaming credentials.

## Product and UI Constraints

- Keep ChenDoc lightweight and personal. Prefer small targeted UX improvements over broad redesigns.
- Preserve existing identity assets such as the anime wallpaper and logo when working on login or branded surfaces.
- Use restrained blue actions, white document surfaces, concise Chinese copy, visible focus states, WCAG AA contrast, 44px touch targets on mobile, and reduced-motion-safe transitions.
- Prefer the existing Vue stack, local tokens, and lucide icons. Do not add a new UI framework for small changes.
- For visual polish, use the installed `ui-ux-pro-max` skill when relevant, but keep its output inside ChenDoc's personal-doc direction.
- Do not remove existing admin entry points for invite codes, R2 settings, article deletion, recycle bin, users, or operation logs unless the user asks for that exact removal.

## Change and Release Constraints

- Except for pure README/open-source page copy updates, code or deployable changes are treated as versioned changes. Keep displayed version, root package version, workspace versions, and lockfile versions synchronized when doing release work.
- Do not hand-edit generated outputs (`apps/admin/dist`, `server/dist`, `server/public/admin`) as a substitute for source changes. Rebuild instead.
- Public GitHub release zip excludes internal docs/policy files such as `FILE_GUIDE.md`, `docs/`, and `更改必读规范.md`, plus `.env`, `data`, `node_modules`, `.git`, logs, DB files, and old zips.
- Private server/self-hosted zip also excludes `.env`, `data`, `node_modules`, `.git`, logs, DB files, and old zips, but keeps internal docs such as `FILE_GUIDE.md` and `docs/`.
- Release zips should be flat: after extraction, files like `deploy.sh`, `package.json`, `apps`, and `server` should appear directly in the extraction directory, not inside an extra `chendoc/` wrapper.

## Reporting Style

- Report in Chinese.
- For implementation work, mention changed files, validation commands, and any skipped checks or environmental blockers.
- For audit/remediation work, structure around concrete findings and implementation evidence. Include rollback/deploy notes only when they materially help the user act.
