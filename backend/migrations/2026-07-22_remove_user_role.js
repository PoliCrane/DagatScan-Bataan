/**
 * Remove 'user' role — 2026-07-22
 *
 * The app no longer allows guest/self-registered accounts (see the
 * 2026-07-21 municipal-role migration for the request/approve flow that
 * replaced it) — only 'municipal', 'admin', 'superadmin' accounts should
 * exist going forward. 3 existing accounts (ids 1, 9, 11) still have the
 * legacy roles='user' value.
 *
 * A CHECK constraint applies to every row regardless of `active` status,
 * so those 3 rows' `roles` column must become a valid remaining value for
 * the tightened constraint to be added — not just deactivated in place.
 * Reassigned to 'municipal' (least-presumptuous remaining role); since
 * they're also being deactivated here, the label has no functional effect
 * (deactivated accounts can't log in regardless of role).
 *
 * Full pg_dump backup taken beforehand:
 * db_backup_before_remove_user_role_2026-07-22.sql
 * Runs in a single transaction — any failed step rolls everything back.
 */
const pool = require("../db");

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`
      UPDATE users SET roles = 'municipal', active = false
      WHERE id IN (1, 9, 11) AND roles = 'user'
    `);

    const migrated = await client.query(
      `SELECT id, username, roles, active, municipality_id FROM users WHERE id IN (1, 9, 11) ORDER BY id`
    );
    const allMigrated = migrated.rows.every((r) => r.roles === "municipal" && r.active === false);
    if (!allMigrated) {
      throw new Error(`Sanity check failed: ids 1/9/11 did not all migrate as expected: ${JSON.stringify(migrated.rows)}`);
    }

    const stragglers = await client.query(
      `SELECT id, roles FROM users WHERE roles NOT IN ('municipal', 'admin', 'superadmin')`
    );
    if (stragglers.rows.length > 0) {
      throw new Error(`Sanity check failed: rows still outside the new role set: ${JSON.stringify(stragglers.rows)}`);
    }

    await client.query(`ALTER TABLE users DROP CONSTRAINT users_roles_check`);
    await client.query(`
      ALTER TABLE users
      ADD CONSTRAINT users_roles_check
      CHECK (roles IN ('municipal', 'admin', 'superadmin'))
    `);

    await client.query("COMMIT");
    console.log("Migration committed successfully.");

    const finalRows = await client.query(
      `SELECT id, username, roles, active, municipality_id FROM users WHERE id IN (1, 9, 11) ORDER BY id`
    );
    console.log("Migrated accounts:", finalRows.rows);
    const constraintDef = await client.query(`
      SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'users_roles_check'
    `);
    console.log("New constraint:", constraintDef.rows[0]?.def);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration FAILED and was rolled back:", err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
