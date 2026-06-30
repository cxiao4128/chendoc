# ChenDoc engineering contract

ChenDoc is a single-site personal document and publishing system. It is not a multi-tenant SaaS.

## Security invariants

- `/admin` and system/user/R2/settings APIs require `requireSuperAdmin`.
- Normal administrators may manage non-super-admin documents only. They must never read, restore, delete, share, or upload into super-admin documents.
- Every document has a non-null `owner_id`, random `doc_uid`, `revision`, `deleted_at`, and `deleted_by`.
- Document authorization is server-side through `documentAccess.ts`. Frontend visibility is never authorization.
- Permanent deletion requires `requireDangerVerification` and an actor-scoped document query.
- Production business APIs stay behind packet-wrapped `POST /api/gateway`. Internal dispatch requires the process-only gateway token.
- HTML is sanitized on write and again before public rendering. SVG, HTML, and JavaScript uploads stay blocked.
- Uploads require a document binding, quotas, exact R2 metadata checks, and production malware scanning.
- Document, version, share-review reset, visibility, and revision updates must commit in one transaction.

## Change rules

- Do not edit `apps/admin/dist`, `server/dist`, `server/public/admin`, `.env`, `data`, backups, or logs.
- Keep API calls in `apps/admin/src/api`, permissions in middleware/access modules, and SQL/business logic in server services.
- Do not add fake metrics, inactive controls, hard-coded versions, or copy that promises behavior not implemented by the backend.
- Schema changes update MySQL, SQLite, bootstrap DDL, migration/backfill logic, and contract tests together.
- Run `npm.cmd run check` before handoff. Security changes also run `npm.cmd audit signatures`.
