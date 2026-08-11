/**
 * ndwi_batch_jobs rows are pure orchestration bookkeeping (see
 * routes/ndwiGeneration.js + services/ndwiBatchWorker.js) — once a batch
 * finishes, the real data it produced lives on in upload_history/
 * satellite_imagery/shoreline_zones. Nothing ever deletes the job row
 * itself, so without this it accumulates forever. Purges terminal jobs
 * older than 30 days; wired into server.js on a timer the same way
 * storageSync.js is.
 */
const pool = require("../db");

async function purgeStaleNdwiBatchJobs() {
  const result = await pool.query(
    `DELETE FROM ndwi_batch_jobs
     WHERE status IN ('complete', 'complete_with_errors', 'failed')
       AND completed_at < NOW() - INTERVAL '30 days'`
  );
  if (result.rowCount > 0) {
    console.log(`[ndwiBatchCleanup] Purged ${result.rowCount} stale ndwi_batch_jobs row(s)`);
  }
  return result.rowCount;
}

module.exports = { purgeStaleNdwiBatchJobs };
