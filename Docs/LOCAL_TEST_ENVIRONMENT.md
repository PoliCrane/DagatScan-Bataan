# Local Test Environment

How to stand up a full local copy of the system with a disposable database — no cloud
services needed. Used for the end-to-end verification on 2026-08-17; reusable any time a
change needs to be tested safely before touching production.

## 1. Database

```bash
brew install postgresql@16
export PG=/opt/homebrew/opt/postgresql@16/bin
$PG/initdb -D ~/dagat-pgdata -U dagatscan --auth=trust
$PG/pg_ctl -D ~/dagat-pgdata -o "-p 5544" -l ~/dagat-pgdata/log start
$PG/createdb -h localhost -p 5544 -U dagatscan dagatscan_test
$PG/psql -h localhost -p 5544 -U dagatscan -d dagatscan_test -f backend/schema.sql
```

`backend/schema.sql` is the canonical base schema (derived from the code). Then create
the auxiliary tables:

```bash
cd backend
export DB_HOST=localhost DB_PORT=5544 DB_USER=dagatscan DB_NAME=dagatscan_test \
       DB_PASSWORD=localtest JWT_SECRET=local-dev-secret PORT=5992
node migrations/2026-08-05_audit_log_table.js
node migrations/2026-08-10_ndwi_batch_jobs_table.js
node migrations/2026-08-16_validation_runs_table.js
```

## 2. Seed municipalities and users

Insert the 12 Bataan municipalities into `municipalities` and create test users with
bcrypt-hashed passwords (roles: superadmin, admin, municipal). See the users table
columns in schema.sql; `verified` and `active` must be true.

## 3. Run

```bash
cd backend && node server.js
cd frontend && npm run dev
```

Email (Brevo) and Supabase Storage are optional locally — the server warns but runs;
uploads stay on local disk.

## 4. Verification flows that must pass

1. Login as each role; confirm the security matrix in Docs/DEFENSE_CHECKLIST.md.
2. Upload `backend/sample-test-data/*.geojson` via the Data Upload page (or curl) —
   rates must compute with the signed convention (identical shorelines → 0, not fake erosion).
3. Seed a known-rate series (offset a shoreline by a fixed rate per year with
   `services/geoUtils.offsetCoastlineSeaward`), run `recomputeAreaTimeSeries`, and confirm
   the measured rate equals the known rate exactly, with the correct risk tier.
4. `node scripts/runHindcastValidation.js` — on clean synthetic data: 100% status
   accuracy, ~0 m MAE, baseline near 0%.
5. `node scripts/recomputeErosionData.js` — completes across all municipalities.
6. Deactivate a logged-in user — their existing token must fail immediately.

## Teardown

```bash
$PG/pg_ctl -D ~/dagat-pgdata stop
rm -rf ~/dagat-pgdata
```
