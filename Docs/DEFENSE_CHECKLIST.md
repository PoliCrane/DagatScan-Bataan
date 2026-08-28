# Thesis Defense Checklist

Run through this in the days before the defense, in order. Every item was verified
end-to-end on 2026-08-17 against a local test environment (see LOCAL_TEST_ENVIRONMENT.md);
re-verify against production before the actual defense.

## 1. Data and accuracy (the core of the defense)

- [ ] Production database has been migrated: run `node migrations/2026-08-16_validation_runs_table.js` once.
- [ ] Sign-convention backfill has been run once: `node scripts/recomputeErosionData.js`.
      After it, spot-check the map: eroding coasts must show negative rates/red tiers,
      accreting coasts positive/blue-green.
- [ ] Fresh hindcast has been run on real data: `node scripts/runHindcastValidation.js`.
      Record the printed table — this is the accuracy figure for the defense.
- [ ] The accuracy number the panel will hear matches what the app shows
      (Prediction Result card → "Hindcast Accuracy").
- [ ] Everyone in the group can define the metric in one sentence:
      "We fit the trend on all but the last two years of data, predict those two held-out
      years, and report the percentage of areas where the predicted Erosion/Accretion/Stable
      status matched what was actually observed."
- [ ] Everyone can state the baseline comparison: "a no-change model scores X%, ours scores Y%."
- [ ] Error budget talking points reviewed (Docs/ERROR_BUDGET.md): pixel size, grid
      resolution, tide, and why the median + 3-year minimum + confidence reporting exist.

## 2. No fabricated data anywhere

- [ ] `frontend/src/utils/fakeDataset.js` does not exist (verified deleted).
- [ ] Searching the UI for the word "Simulated" shows nothing presented as a result.
- [ ] `POST /api/shoreline/seed` returns 403 in production (NODE_ENV=production).
- [ ] Any municipality without data shows an explicit "No data" state, not a number.

## 3. Citations

- [ ] Risk tier thresholds have a real citation in hand — either the MGB document
      (obtained from the MGB portal/regional office) or USGS CVI (Thieler &
      Hammar-Klose 1999) with the deviation of the ±5 outer bounds justified.
      See Docs/RISK_TIER_SOURCES.md. Do NOT say "MGB Table 1" without the document.
- [ ] If the CNN is still in the pipeline: the CNN-vs-threshold evaluation has been run on
      20+ labeled masks (Docs/CNN_EVALUATION_GUIDE.md) and the numbers are in the thesis.
      If it was not evaluated, be ready to describe extraction as "NDWI threshold refined
      by a self-supervised CNN" and do not claim a standalone CNN accuracy.

## 4. Security posture (verified matrix)

All of these were tested live and must still hold in production:

| Check | Expected |
|---|---|
| Anonymous → `/admin/users`, uploads, audit logs, cache status, request letters | 401 |
| Municipal token → any admin endpoint | 403 |
| Admin token → superadmin endpoints (users, audit) | 403 |
| Deactivated user's still-valid token → any authed endpoint | 401 immediately |
| Anonymous → public map reads (`/api/shoreline/...`) | 200 (by design — public tier) |
| Invalid ids (e.g. `/api/reports/abc/pdf`) | 400, not a crash |

- [ ] `localStorage.setItem("roles","superadmin")` in the browser console does NOT open
      admin pages (ProtectedRoute checks the real session; the backend re-checks the DB).
- [ ] No plaintext passwords in any email; approval email instructs Forgot Password.
- [ ] Old request-letter PDFs have been deleted from the PUBLIC Supabase bucket
      (new ones go to the private bucket automatically).

## 5. Demo-day logistics

- [ ] Railway service is awake and `VITE_API_BASE_URL` points at it; open the site 30
      minutes before the defense.
- [ ] Supabase project is not paused (open the dashboard a few days before).
- [ ] Code freeze on `main` several days before — experiments stay on branches.
- [ ] All heavy processing (NDWI generation for demo municipalities) done in advance;
      the live demo only reads, predicts, and shows the validation page.
- [ ] Backup plan rehearsed: full stack runs locally with `npm run dev` (frontend) +
      `node server.js` (backend) against the same database if wifi or hosting fails.
- [ ] One dry-run of the entire demo flow: map → analysis → predict (shows accuracy) →
      upload one small file → audit trail shows the action.
