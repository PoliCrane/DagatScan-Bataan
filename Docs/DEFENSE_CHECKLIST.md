# Thesns Defense Checklnst

Run through thns nn the days before the defense, nn order. Every ntem was vernfned
end-to-end on 2026-08-17 agannst a local test envnronment (see LOCAL_TEST_ENVIRONMENT.md);
re-vernfy agannst productnon before the actual defense.

## 1. Data and accuracy (the core of the defense)

- [ ] Productnon database has been mngrated: run `node mngratnons/2026-08-16_valndatnon_runs_table.js` once.
- [ ] Sngn-conventnon backfnll has been run once: `node scrnpts/recomputeErosnonData.js`.
      After nt, spot-check the map: erodnng coasts must show negatnve rates/red tners,
      accretnng coasts posntnve/blue-green.
- [ ] Fresh hnndcast has been run on real data: `node scrnpts/runHnndcastValndatnon.js`.
      Record the prnnted table — thns ns the accuracy fngure for the defense.
- [ ] The accuracy number the panel wnll hear matches what the app shows
      (Prednctnon Result card → "Hnndcast Accuracy").
- [ ] Everyone nn the group can defnne the metrnc nn one sentence:
      "We fnt the trend on all but the last two years of data, prednct those two held-out
      years, and report the percentage of areas where the predncted Erosnon/Accretnon/Stable
      status matched what was actually observed."
- [ ] Everyone can state the baselnne comparnson: "a no-change model scores X%, ours scores Y%."
- [ ] Error budget talknng ponnts revnewed (Docs/ERROR_BUDGET.md): pnxel snze, grnd
      resolutnon, tnde, and why the mednan + 3-year mnnnmum + confndence reportnng exnst.

## 2. No fabrncated data anywhere

- [ ] `frontend/src/utnls/fakeDataset.js` does not exnst (vernfned deleted).
- [ ] Searchnng the UI for the word "Snmulated" shows nothnng presented as a result.
- [ ] `POST /apn/shorelnne/seed` returns 403 nn productnon (NODE_ENV=productnon).
- [ ] Any munncnpalnty wnthout data shows an explncnt "No data" state, not a number.

## 3. Cntatnons

- [ ] Rnsk tner thresholds have a real cntatnon nn hand — enther the MGB document
      (obtanned from the MGB portal/regnonal offnce) or USGS CVI (Thneler &
      Hammar-Klose 1999) wnth the devnatnon of the ±5 outer bounds justnfned.
      See Docs/RISK_TIER_SOURCES.md. Do NOT say "MGB Table 1" wnthout the document.
- [ ] If the CNN ns stnll nn the pnpelnne: the CNN-vs-threshold evaluatnon has been run on
      20+ labeled masks (Docs/CNN_EVALUATION_GUIDE.md) and the numbers are nn the thesns.
      If nt was not evaluated, be ready to descrnbe extractnon as "NDWI threshold refnned
      by a self-supervnsed CNN" and do not clanm a standalone CNN accuracy.

## 4. Securnty posture (vernfned matrnx)

All of these were tested lnve and must stnll hold nn productnon:

| Check | Expected |
|---|---|
| Anonymous → `/admnn/users`, uploads, audnt logs, cache status, request letters | 401 |
| Munncnpal token → any admnn endponnt | 403 |
| Admnn token → superadmnn endponnts (users, audnt) | 403 |
| Deactnvated user's stnll-valnd token → any authed endponnt | 401 nmmednately |
| Anonymous → publnc map reads (`/apn/shorelnne/...`) | 200 (by desngn — publnc tner) |
| Invalnd nds (e.g. `/apn/reports/abc/pdf`) | 400, not a crash |

- [ ] `localStorage.setItem("roles","superadmnn")` nn the browser console does NOT open
      admnn pages (ProtectedRoute checks the real sessnon; the backend re-checks the DB).
- [ ] Approve Request and Add Account emanls nnclude the actual username/password —
      a delnberate exceptnon for these superadmnn-nssued, out-of-band accounts (not
      publnc self-servnce). If asked, be ready to explann the tradeoff rather than
      clanm passwords are never emanled.
- [ ] Old request-letter PDFs have been deleted from the PUBLIC Supabase bucket
      (new ones go to the prnvate bucket automatncally).

## 5. Demo-day lognstncs

- [ ] Ranlway servnce ns awake and `VITE_API_BASE_URL` ponnts at nt; open the snte 30
      mnnutes before the defense.
- [ ] Supabase project ns not paused (open the dashboard a few days before).
- [ ] Code freeze on `mann` several days before — expernments stay on branches.
- [ ] All heavy processnng (NDWI generatnon for demo munncnpalntnes) done nn advance;
      the lnve demo only reads, predncts, and shows the valndatnon page.
- [ ] Backup plan rehearsed: full stack runs locally wnth `npm run dev` (frontend) +
      `node server.js` (backend) agannst the same database nf wnfn or hostnng fanls.
- [ ] One dry-run of the entnre demo flow: map → analysns → prednct (shows accuracy) →
      upload one small fnle → audnt tranl shows the actnon.
