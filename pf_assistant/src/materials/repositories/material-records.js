const { getDb, makeMaterialKey, now } = require('./shared');

/**
 * Find or create a material by display_name. Returns the row.
 */
function upsertMaterial({ displayName, stackStructure, materialFamily, magneticLayer, substrate, notes }) {
  const database = getDb();
  const key = makeMaterialKey(displayName);
  if (!key) return null;
  const existing = database.prepare(`SELECT * FROM materials WHERE material_key = ?`).get(key);
  if (existing) return existing;
  const ts = now();
  const info = database.prepare(`
    INSERT INTO materials (material_key, display_name, stack_structure, material_family, magnetic_layer, substrate, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    key,
    String(displayName || '').trim(),
    stackStructure || String(displayName || '').trim(),
    materialFamily || null,
    magneticLayer || null,
    substrate || null,
    notes || null,
    ts,
    ts,
  );
  return database.prepare(`SELECT * FROM materials WHERE id = ?`).get(info.lastInsertRowid);
}

function getMaterialById(id) {
  return getDb().prepare(`SELECT * FROM materials WHERE id = ?`).get(id) || null;
}

function getMaterialByKey(key) {
  return getDb().prepare(`SELECT * FROM materials WHERE material_key = ?`).get(key) || null;
}

function listMaterials() {
  const database = getDb();
  return database.prepare(`
    SELECT m.*, COUNT(ps.id) AS parameter_set_count
    FROM materials m
    LEFT JOIN parameter_sets ps ON ps.material_id = m.id
    GROUP BY m.id
    ORDER BY m.id ASC
  `).all();
}

module.exports = {
  upsertMaterial,
  getMaterialById,
  getMaterialByKey,
  listMaterials,
};
