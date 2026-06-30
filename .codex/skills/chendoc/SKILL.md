---
name: chendoc
description: Use for ChenDoc project work in D:\desktop\bixu\js\chendoc, including code changes, local runtime recovery, encrypted gateway/auth work, security audits and remediation, frontend UI polish, build/test validation, release packaging, and deployment workflows. Applies when the user mentions ChenDoc, chendoc, this workspace, admin login, gateway packet layer, public shares, R2 uploads, local ports, or ChenDoc release work.
---

# ChenDoc

## Core Rules

- Work from `D:\desktop\bixu\js\chendoc` unless the user explicitly targets another checkout.
- Answer ChenDoc work in Chinese by default.
- Treat ChenDoc as a lightweight personal document and knowledge publishing system. Do not drift into enterprise OA, team collaboration, or heavyweight security/product patterns.
- Prefer `npm.cmd` on this Windows host. Avoid `npm.ps1` assumptions.
- Inspect current files and running state before relying on older notes; ports, DB schema, package versions, and audit findings can drift.

## Workflow

1. Identify the task area: runtime/login, gateway/auth, docs/shares/uploads, frontend UI, security audit/remediation, or release/deploy.
2. Read `references/chendoc-playbook.md` for the matching section before making non-trivial changes.
3. Read the local source of truth next: `PRODUCT.md`, `FILE_GUIDE.md`, `DESIGN_LANGUAGE.md`, `更改必读规范.md`, relevant `package.json` files, and the exact source module being edited.
4. Keep edits scoped to existing module boundaries. Do not hand-edit generated outputs such as `apps/admin/dist`, `server/dist`, or `server/public/admin`.
5. Validate with the smallest credible command set for the risk. For security, gateway, auth, release, or broad shared behavior, use the stronger validation set from the playbook.
6. For frontend-visible changes, rebuild the admin app and verify the local page in the in-app Browser when a local URL is known.

## Task Routing

- Runtime or login incident: verify port/process state, DB provider/path, schema migrations, and the actual service error before changing credentials or UI.
- Gateway or auth: preserve encrypted gateway responses and encrypted JWT-in-`Authorization` direction unless the user explicitly changes the architecture.
- Product or UI: preserve the personal-doc framing, Chinese copy, existing wallpaper/logo identity, restrained blue actions, and lightweight Vue stack.
- Release or deploy: check version sync rules and dual-zip packaging rules before generating artifacts.
- Audit or hardening: start from concrete findings and implementation evidence; avoid broad, speculative rewrites.
