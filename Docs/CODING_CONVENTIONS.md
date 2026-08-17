# Coding Conventions

The standard for ALL new code in this repository. Existing code is migrated toward these
rules as files get touched — never in big rewrites without tests or screenshots.

## Backend

**Layering.** Routes stay thin: validate input, call a service, return the result. All
business logic (SQL, computation, file handling) lives in `services/`. `server.js` is
bootstrap only: middleware, mounts, error handler, listen.

**Auth.** Mount-time gating is the default — a whole router is protected where it is
mounted (`app.use("/admin", verifyToken, verifySuperadmin, usersRouter)`), so a newly
added route inherits protection. Public endpoints live in routers that are explicitly
public by design (the map/dashboard reads). `verifyToken` re-checks roles/active in the
database, so `req.user.roles` is always fresh.

**Validation.** New route bodies get a zod schema in `middleware/validate.js` and a
`validate(schemas.x)` middleware. Domain rules (password complexity, name format, PH
mobile) live in `utils/validators.js` and are reused, not re-written.

**Errors.** One response shape: `{ error: "message" }`. Never send `err.message` from a
caught exception to the client — log it, return a generic message. For new async routes,
prefer `asyncHandler` + `throw new AppError(status, message)` (`utils/httpErrors.js`);
the global handler in `server.js` formats the response.

**Constants.** Domain numbers (rate ceilings, minimum years, bands, TTLs) live in
`config/constants.js`. Required environment variables are declared in `config/env.js`,
which fails at startup with a clear message.

**Logging.** Use `utils/logger.js` (`logger.info/warn/error`) in new code; it adds
timestamps and levels and respects `LOG_LEVEL`.

**Sign convention.** Shoreline change is signed everywhere: NEGATIVE = erosion/retreat,
POSITIVE = accretion/advance, in m/year for rates and meters for cumulative change.
Seaward direction is resolved geographically via `services/geoUtils.js` — never from
point order.

**Tests.** Pure computation (EPR, LRR, geodesy, classification) is covered by
`npm test` (`node --test`, no extra dependency). New math gets a test in `backend/test/`.

## Frontend

**Auth.** `AuthContext` (`contexts/AuthContext.jsx` + `contexts/useAuth.js`) is the only
reader/writer of auth state; components use `useAuth()`. Route access is enforced by
`<ProtectedRoute allowedRoles={[...]}>` in `App.jsx` — never by an in-component redirect.

**Network.** New calls go through `api/client.js` (`api(path, { auth: true, body })`) —
it attaches the token, checks `res.ok`, normalizes errors, and clears the session on 401.
Do not hand-write `fetch` + `Authorization` headers in components.

**Data states.** Every data view renders all four states: loading, error, empty, data.
Never `catch { return {} }` — a failed request must look different from "no erosion".
Use `components/AsyncSection.jsx` or replicate its structure.

**Components.** Pages assemble; `components/` present. No direct `fetch` inside
components (use hooks or api modules). No `document.querySelector` positioning — use CSS.
Class names targeted by guided tours (`tours/steps/*.js`) must not be renamed without
updating the tour steps.

**Geometry.** All coordinate math goes through `utils/geometry.js` (cos-latitude
corrected, geographic seaward). Never use a bare `111000` conversion.

**Risk tiers.** Backend `services/riskClassification.js` is the source of truth. The
frontend copy in `utils/segmentData.js` is checked automatically by
`src/utils/riskTierSync.test.js` (`npm test`) — a mismatch fails the suite. The tiers are
also served at `GET /api/shoreline/config/risk-tiers`.

**Tests.** `npm test` runs vitest over `src/**/*.test.js`. New utils get tests.

## Both

- English for all UI text, errors, emails, commits, and docs.
- Commit subjects only — no bodies, no co-author trailers.
- No new code comments; explanations belong in `Docs/` or the PR discussion.
