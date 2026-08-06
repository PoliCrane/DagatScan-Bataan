/**
 * Supabase Storage client — durable, off-disk persistence for uploaded files
 * that must survive a redeploy on hosts with an ephemeral filesystem
 * (satellite images, GeoJSON, request-letter PDFs, the CNN model's
 * weights.json). Populating these is handled by services/storageSync.js and
 * services/imageCNNDetection.js, not by this file — this is just the client
 * + low-level read/write/delete primitives.
 */
require("dotenv").config();
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const BUCKET_NAME = process.env.SUPABASE_STORAGE_BUCKET || "uploads";

let client = null;
function getClient() {
  if (client) return client;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to use Supabase Storage."
    );
  }
  client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  return client;
}

/**
 * Creates the storage bucket if it doesn't already exist. Public, since
 * these files (satellite imagery, GeoJSON, request letters) were already
 * served unauthenticated via express.static locally — a public bucket
 * doesn't lower that existing security posture, just moves it.
 */
async function ensureBucketExists() {
  const supabase = getClient();
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw new Error(`Could not list Supabase buckets: ${listError.message}`);

  if (buckets.some((b) => b.name === BUCKET_NAME)) return;

  const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
    public: true,
  });
  if (createError) throw new Error(`Could not create Supabase bucket "${BUCKET_NAME}": ${createError.message}`);
  console.log(`✓ Created Supabase Storage bucket "${BUCKET_NAME}"`);
}

/**
 * Uploads a local file to Storage at `storagePath` (e.g. "geojson/foo.json")
 * and returns its public URL. Overwrites if something's already there.
 */
async function uploadLocalFile(localFilePath, storagePath) {
  const supabase = getClient();
  const buffer = fs.readFileSync(localFilePath);

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(storagePath, buffer, { upsert: true });
  if (error) throw new Error(`Supabase upload failed for ${storagePath}: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(storagePath);
  return data.publicUrl;
}

/** Uploads an in-memory buffer directly (used for the CNN weights file). */
async function uploadBuffer(buffer, storagePath) {
  const supabase = getClient();
  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(storagePath, buffer, { upsert: true });
  if (error) throw new Error(`Supabase upload failed for ${storagePath}: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(storagePath);
  return data.publicUrl;
}

/** Downloads a Storage object to a local file path, creating parent dirs as needed. */
async function downloadToLocalFile(storagePath, localFilePath) {
  const supabase = getClient();
  const { data, error } = await supabase.storage.from(BUCKET_NAME).download(storagePath);
  if (error) throw new Error(`Supabase download failed for ${storagePath}: ${error.message}`);

  const path = require("path");
  fs.mkdirSync(path.dirname(localFilePath), { recursive: true });
  const arrayBuffer = await data.arrayBuffer();
  fs.writeFileSync(localFilePath, Buffer.from(arrayBuffer));
}

/** Best-effort delete — a missing object shouldn't fail an otherwise-committed action. */
async function deleteFromStorage(storagePath) {
  const supabase = getClient();
  const { error } = await supabase.storage.from(BUCKET_NAME).remove([storagePath]);
  if (error) console.error(`Supabase delete failed for ${storagePath}:`, error.message);
}

module.exports = {
  BUCKET_NAME,
  ensureBucketExists,
  uploadLocalFile,
  uploadBuffer,
  downloadToLocalFile,
  deleteFromStorage,
};
