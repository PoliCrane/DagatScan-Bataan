// Background sync: uploads local files not yet mirrored to Supabase Storage, records the
// public URL on the owning row. Runs independently on a timer (server.js), decoupled from
// the upload routes. Safe to call repeatedly - only NULL storage_url rows with a local file do anything.
const logger = require("../utils/logger");
const fs = require("fs");
const path = require("path");
const pool = require("../db");
const { uploadLocalFile, uploadPrivateFile } = require("./supabaseStorage");
const { thumbnailPathFor } = require("./thumbnailGenerator");

const UPLOAD_DIR = path.join(__dirname, "../uploads");
const REQUEST_LETTERS_DIR = path.join(UPLOAD_DIR, "request-letters");

function toStoragePath(localPath) {
  return path.relative(UPLOAD_DIR, localPath).split(path.sep).join("/");
}

async function syncPendingFilesToStorage() {
  // local path -> uploaded URL, so a file shared by upload_history and satellite_imagery is only uploaded once
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
      logger.error(`[storageSync] upload_history id=${row.id}:`, err.message);
    }
  }

  // 2. satellite_imagery - same physical file as its upload_history row; deduped via uploadedUrlCache
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
      logger.error(`[storageSync] satellite_imagery id=${row.id}:`, err.message);
    }
  }

  // 3. account_requests - letters contain PII, so they sync to the PRIVATE bucket and
  // request_letter_url stores the storage path (served via a signed URL, never public).
  const pendingLetters = await pool.query(
    `SELECT id, request_letter_filename FROM account_requests
     WHERE request_letter_url IS NULL AND request_letter_filename IS NOT NULL`
  );
  for (const row of pendingLetters.rows) {
    const localPath = path.join(REQUEST_LETTERS_DIR, row.request_letter_filename);
    if (!fs.existsSync(localPath)) continue;
    try {
      const storagePath = await uploadPrivateFile(localPath, toStoragePath(localPath));
      await pool.query(`UPDATE account_requests SET request_letter_url = $1 WHERE id = $2`, [storagePath, row.id]);
      synced++;
    } catch (err) {
      failed++;
      logger.error(`[storageSync] account_requests id=${row.id}:`, err.message);
    }
  }

  // 4. upload_history thumbnails - the preview PNG lives on the same ephemeral disk and
  // wasn't covered by #1, so it still vanished on every redeploy
  const pendingThumbnails = await pool.query(
    `SELECT id, file_path FROM upload_history
     WHERE thumbnail_storage_url IS NULL AND file_path IS NOT NULL AND process_status != 'Failed'`
  );
  for (const row of pendingThumbnails.rows) {
    const thumbPath = thumbnailPathFor(row.file_path);
    if (!fs.existsSync(thumbPath)) continue;
    try {
      const url = await uploadOnce(thumbPath);
      await pool.query(`UPDATE upload_history SET thumbnail_storage_url = $1 WHERE id = $2`, [url, row.id]);
      synced++;
    } catch (err) {
      failed++;
      logger.error(`[storageSync] upload_history thumbnail id=${row.id}:`, err.message);
    }
  }

  if (synced > 0 || failed > 0) {
    console.log(`[storageSync] ${synced} file(s) synced to Supabase Storage${failed > 0 ? `, ${failed} failed` : ""}.`);
  }

  return { synced, failed };
}

// Event-driven trigger for upload routes, debounced so near-simultaneous uploads collapse into
// one sync call. Also avoids a poll loop keeping scale-to-zero hosts (e.g. Railway) from sleeping.
let debounceTimer = null;
const DEBOUNCE_MS = 8000;

function scheduleSync() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    syncPendingFilesToStorage().catch((err) => logger.error("[storageSync] Scheduled sync failed:", err.message));
  }, DEBOUNCE_MS);
}

module.exports = { syncPendingFilesToStorage, scheduleSync };
