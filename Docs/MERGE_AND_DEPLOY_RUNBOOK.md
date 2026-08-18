# Merge & Deploy Runbook — `improvements` branch

The exact order for taking the `improvements` branch to production. Do this WELL BEFORE
the defense (at least a week), not the night before. Steps marked ⚠️ are the ones that
break things when skipped or reordered.

## 0. Before merging

1. Review the branch: `git log --oneline main..improvements` (49+ commits, each scoped
   to one change). Read at least the commits touching `services/` — those change the
   math you will defend.
2. Run the test suites locally: `cd backend && npm test` (31 tests) and
   `cd frontend && npm test` (12 tests). Both must pass.
3. ⚠️ **Take a database backup and KEEP it**: `node scripts/dbBackup.js` (or a manual
   `pg_dump`). Label it `pre-merge`. This is your only clean rollback point — after the
   sign-convention backfill (step 4 below), OLD code can no longer read the data
   correctly, so "just revert the merge" stops being safe.

## 1. Environment variables (Railway dashboard) — BEFORE deploying the merge

| Variable | Action |
|---|---|
| `DB_PASSWORD` | ⚠️ Must be set — the server now refuses to boot without it |
| `NODE_ENV` | ⚠️ Set to `production` — enables Postgres TLS and disables the seed endpoint |
| `JWT_SECRET`, `FRONTEND_URL`, `BREVO_API_KEY`, `EMAIL_USER`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Confirm still set |
| `DB_SSL`, `DB_CA_CERT`, `LOG_LEVEL`, `SUPABASE_PRIVATE_BUCKET`, `DB_POOL_MAX` | Optional, defaults are fine |

Frontend (Vercel): confirm `VITE_API_BASE_URL` — production builds now fail loudly
without it.

## 2. Merge and deploy

1. Merge `improvements` into `main` (normal merge, keep history). Push → Vercel and
   Railway auto-deploy.
2. Watch both deploy logs. Backend must log `Server running...` and `Email service
   ready`; frontend build must succeed.
3. ⚠️ The FIRST upload/sync after deploy creates the private request-letters bucket —
   the `SUPABASE_SERVICE_ROLE_KEY` must have bucket-create permission (service role
   does by default).

## 3. One-time data migration — IN THIS ORDER, run from Railway (or locally against prod DB)

```
node migrations/2026-08-16_validation_runs_table.js
node migrations/2026-08-17_lrr_uncertainty_columns.js
node migrations/2026-08-18_query_indexes.js
node scripts/recomputeErosionData.js        # ⚠️ rewrites rates/cumulative to the signed convention
node scripts/runHindcastValidation.js       # first real accuracy numbers — SAVE the output
node scripts/fetchEventContext.js 2015 2025 # only if backend/data/eventContext.json is not deployed
```

After the backfill, spot-check the map: eroding coasts negative/red, accreting positive.
If anything looks wrong, STOP and restore the `pre-merge` backup instead of debugging live.

## 4. Post-deploy verification (15 minutes)

1. Security spot-checks: anonymous `GET /api/admin/uploads` → 401; anonymous
   `/uploads/request-letters/x.pdf` → 401; `/api/shoreline/municipalities` → 200.
2. Log in as each role; confirm admin pages block/allow correctly.
3. Open `/validation` — the hindcast run from step 3 must display.
4. Upload one small GeoJSON as admin; confirm rates compute and audit trail records it.
5. Delete old request-letter PDFs from the PUBLIC Supabase bucket (they pre-date the
   private bucket; new ones are private automatically).

## 5. Cleanup and freeze

1. Record the production accuracy + performance numbers in `Docs/PERFORMANCE_RESULTS.md`
   and the thesis.
2. Code freeze on `main` until after the defense; experiments go to branches (Vercel
   previews are free).
3. Run through `Docs/DEFENSE_CHECKLIST.md` end to end.

## Rollback plan

- Before step 3 (no backfill yet): revert the merge commit, push, done.
- After step 3: revert the merge AND restore the `pre-merge` database backup together.
  Never run old code against backfilled data or new code against unbackfilled data.
