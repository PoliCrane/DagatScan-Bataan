/**
 * Background sync: uploads any local files not yet mirrored to Supabase
 * Storage, and records the resulting public URL back on the owning row.
 * Deliberately decoupled from the upload routes themselves (which have
 * several branchy, transactional processing paths for GeoJSON/CSV/satellite
 * files) — this runs independently on a timer (see server.js) so none of
 * that existing logic needs to change. Safe to call repeatedly; only rows
 * with a NULL storage_url and a file that still exists locally do anything.
 */
const fs = require("fs");
const path = require("path");
const pool = require("../db");
const { uploadLocalFile } = require("./supabaseStorage");

const UPLOAD_DIR = path.join(__dirname, "../uploads");
const REQUEST_LETTERS_DIR = path.join(UPLOAD_DIR, "request-letters");

function toStoragePath(localPath) {
  return path.relative(UPLOAD_DIR, localPath).split(path.sep).join("/");
}

async function syncPendingFilesToStorage() {
  // Local path -> already-uploaded public URL, so a file referenced by both
  // upload_history and satellite_imagery (the satellite upload case) only
  // gets uploaded once per run.
  const uploadedUrlCache = new Map();

  async function uploadOnce(localPath) {
    if (uploadedUrlCache.has(localPath)) return uploadedUrlCache.get(localPath);
    const url = await uploadLocalFile(localPath, toStoragePath(localPath));
    uploadedUrlCache.set(localPath, url);
    return url;
  }

  let synced = 0;
  let failed = 0;

  // 1. upload_history — GeoJSON/CSV/satellite source files.
  const pendingUploads = await pool.query(
    `SELECT id, file_path FROM upload_history
     WHERE storage_url IS NULL AND file_path IS NOT NULL AND process_status != 'Failed'`
  );
  for (const row of pendingUploads.rows) {
    if (!fs.existsSync(row.file_path)) continue;
    try {
      const url = await uploadOnce(row.file_path);
      await pool.query(`UPDATE upload_history SET storage_url = $1 WHERE id = $2`, [url, row.id]);
      synced++;
    } catch (err) {
      failed++;
      console.error(`[storageSync] upload_history id=${row.id}:`, err.message);
    }
  }

  // 2. satellite_imagery — same physical file as its upload_history row for
  // satellite uploads, deduped via uploadedUrlCache above.
  const pendingImages = await pool.query(
    `SELECT id, image_path FROM satellite_imagery WHERE storage_url IS NULL AND image_path IS NOT NULL`
  );
  for (const row of pendingImages.rows) {
    if (!fs.existsSync(row.image_path)) continue;
    try {
      const url = await uploadOnce(row.image_path);
      await pool.query(`UPDATE satellite_imagery SET storage_url = $1 WHERE id = $2`, [url, row.id]);
      synced++;
    } catch (err) {
      failed++;
      console.error(`[storageSync] satellite_imagery id=${row.id}:`, err.message);
    }
  }

  // 3. account_requests — signed request-letter PDFs (only a filename is
  // stored, not a full path, so it's joined against the known directory).
  const pendingLetters = await pool.query(
    `SELECT id, request_letter_filename FROM account_requests
     WHERE request_letter_url IS NULL AND request_letter_filename IS NOT NULL`
  );
  for (const row of pendingLetters.rows) {
    const localPath = path.join(REQUEST_LETTERS_DIR, row.request_letter_filename);
    if (!fs.existsSync(localPath)) continue;
    try {
      const url = await uploadOnce(localPath);
      await pool.query(`UPDATE account_requests SET request_letter_url = $1 WHERE id = $2`, [url, row.id]);
      synced++;
    } catch (err) {
      failed++;
      console.error(`[storageSync] account_requests id=${row.id}:`, err.message);
    }
  }

  if (synced > 0 || failed > 0) {
    console.log(`[storageSync] ${synced} file(s) synced to Supabase Storage${failed > 0 ? `, ${failed} failed` : ""}.`);
  }

  return { synced, failed };
}

module.exports = { syncPendingFilesToStorage };
