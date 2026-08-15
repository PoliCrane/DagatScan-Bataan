// Resolves a municipality name to municipalities.id, creating the row on first sight.
// Case-insensitive. @param db - pool, or a transaction client inside BEGIN/COMMIT.
async function getOrCreateMunicipalityId(db, municipalityName) {
  const existing = await db.query(
    `SELECT id FROM municipalities WHERE LOWER(name) = LOWER($1)`,
    [municipalityName]
  );
  if (existing.rows[0]?.id) return existing.rows[0].id;

  const created = await db.query(
    `INSERT INTO municipalities (name) VALUES ($1) RETURNING id`,
    [municipalityName]
  );
  return created.rows[0].id;
}

module.exports = { getOrCreateMunicipalityId };
