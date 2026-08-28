/**
 * Daily database backup — run on a schedule by .github/workflows/db-backup.yml,
 * independent of Render (whose free-tier web service spins down when idle,
 * which would make an in-process scheduler unreliable for a "daily" job).
 *
 * Dumps the live Supabase Postgres database via pg_dump, uploads it to a
 * dedicated PRIVATE Supabase Storage bucket ("db-backups" — deliberately not
 * the existing "uploads" bucket, which is public), and prunes backups older
 * than 30 days. On any failure, emails an alert (see email.js's
 * sendBackupFailureEmail) and exits non-zero so the GitHub Actions run also
 * shows as failed.
 */
require("dotenv").config();
const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { sendBackupFailureEmail } = require("../email");

const BACKUP_BUCKET = "db-backups";
const RETENTION_DAYS = 30;

function getSupabaseClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  }
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

function runPgDump(outputFile) {
  const { DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT } = process.env;
  if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME || !DB_PORT) {
    throw new Error("DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, and DB_PORT must all be set.");
  }

  return new Promise((resolve, reject) => {
    execFile(
      "pg_dump",
      [
        "-h", DB_HOST,
        "-U", DB_USER,
        "-p", DB_PORT,
        "-d", DB_NAME,
        "-f", outputFile,
        "--no-owner",
        "--no-privileges",
      ],
      // PGPASSWORD via the child's env, not a CLI flag, so it never shows up
      // in process listings (ps, task manager, etc.).
      { env: { ...process.env, PGPASSWORD: DB_PASSWORD } },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`pg_dump failed: ${stderr || error.message}`));
          return;
        }
        resolve();
      }
    );
  });
}

async function ensureBackupBucketExists(supabase) {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw new Error(`Could not list Supabase buckets: ${listError.message}`);

  if (buckets.some((b) => b.name === BACKUP_BUCKET)) return;

  const { error: createError } = await supabase.storage.createBucket(BACKUP_BUCKET, {
    public: false,
  });
  if (createError) throw new Error(`Could not create bucket "${BACKUP_BUCKET}": ${createError.message}`);
  console.log(`✓ Created private Supabase Storage bucket "${BACKUP_BUCKET}"`);
}

async function uploadBackup(supabase, localFile, storageFileName) {
  const buffer = fs.readFileSync(localFile);
  const { error } = await supabase.storage
    .from(BACKUP_BUCKET)
    .upload(storageFileName, buffer, { upsert: true, contentType: "application/sql" });
  if (error) throw new Error(`Upload failed for ${storageFileName}: ${error.message}`);
  console.log(`✓ Uploaded ${storageFileName} (${(buffer.length / 1024).toFixed(1)} KB)`);
}

async function pruneOldBackups(supabase) {
  const { data: objects, error } = await supabase.storage.from(BACKUP_BUCKET).list();
  if (error) throw new Error(`Could not list backups for pruning: ${error.message}`);

  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const stale = (objects || [])
    .filter((obj) => obj.created_at && new Date(obj.created_at).getTime() < cutoff)
    .map((obj) => obj.name);

  if (stale.length === 0) {
    console.log("No backups older than retention window — nothing to prune.");
    return;
  }

  const { error: removeError } = await supabase.storage.from(BACKUP_BUCKET).remove(stale);
  if (removeError) throw new Error(`Could not prune old backups: ${removeError.message}`);
  console.log(`✓ Pruned ${stale.length} backup(s) older than ${RETENTION_DAYS} days:`, stale.join(", "));
}

async function main() {
  const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const tmpFile = path.join(os.tmpdir(), `dagatscan_backup_${dateStr}.sql`);

  try {
    console.log(`Starting database backup for ${dateStr}...`);

    await runPgDump(tmpFile);
    console.log(`✓ pg_dump complete: ${tmpFile}`);

    const supabase = getSupabaseClient();
    await ensureBackupBucketExists(supabase);
    await uploadBackup(supabase, tmpFile, `backup_${dateStr}.sql`);
    await pruneOldBackups(supabase);

    console.log("Backup completed successfully.");
  } catch (err) {
    console.error("Backup FAILED:", err.message);
    try {
      await sendBackupFailureEmail(err.message);
    } catch (emailErr) {
      console.error("Additionally failed to send failure alert email:", emailErr.message);
    }
    process.exitCode = 1;
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
}

main();
