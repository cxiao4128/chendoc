# Gateway Boundary

The Gateway Packet Layer is a transport hardening layer only.

It may reject malformed, replayed, stale, or forged packets before a request reaches business routes.

It must not be treated as authentication or authorization.

Every non-public business route still needs the normal server-side guard:

- `authenticate` for logged-in APIs.
- `requireSuperAdmin` for system/user/R2/settings/admin-only APIs.
- `canAccessDocument` or an equivalent owner check for document, share, upload, trash, and version APIs.

Adding a route to `server/src/gateway/routes.ts` only maps an action code to an internal API request. It does not grant permission.
