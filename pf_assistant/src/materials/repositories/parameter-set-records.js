/**
 * parameter_sets table access.
 *
 * These helpers are split out from material-parameters-repository.js so each
 * material repository module owns one table-oriented responsibility.
 */

'use strict';

const { getDb, now } = require('./shared');

/**
 * Find or create a parameter set for a material.
 * setName is required (caller builds it from authors/year/context).
 * On re-import, if a set with the same (material_id, set_name) exists, it
 * is reused, then parameter values can be upserted by the caller.
 */
function upsertParameterSet({ materialId, sourceId, setName, setType, simulationContext, isDefault, confidenceLevel, notes }) {
  if (!materialId || !setName) throw new Error('materialId and setName are required');
  const database = getDb();
  const existing = database.prepare(`
    SELECT * FROM parameter_sets WHERE material_id = ? AND set_name = ?
  `).get(materialId, setName);
  if (existing) return existing;
  const ts = now();
  const info = database.prepare(`
    INSERT INTO parameter_sets (material_id, source_id, set_name, set_type, simulation_context, is_default, confidence_level, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    materialId,
    sourceId || null,
    setName,
    setType || 'unknown',
    simulationContext || 'unknown',
    isDefault ? 1 : 0,
    confidenceLevel || 'unknown',
    notes || null,
    ts,
    ts,
  );
  return database.prepare(`SELECT * FROM parameter_sets WHERE id = ?`).get(info.lastInsertRowid);
}

function getParameterSetById(id) {
  return getDb().prepare(`SELECT * FROM parameter_sets WHERE id = ?`).get(id) || null;
}

function listParameterSetsForMaterial(materialId) {
  return getDb().prepare(`
    SELECT * FROM parameter_sets WHERE material_id = ? ORDER BY id ASC
  `).all(materialId);
}

function getParameterSetsForMaterialWithSource(materialId) {
  return getDb().prepare(`
    SELECT ps.*, s.first_author, s.authors, s.journal, s.year, s.title, s.doi
    FROM parameter_sets ps
    LEFT JOIN sources s ON s.id = ps.source_id
    WHERE ps.material_id = ?
    ORDER BY ps.id ASC
  `).all(materialId);
}

module.exports = {
  upsertParameterSet,
  getParameterSetById,
  listParameterSetsForMaterial,
  getParameterSetsForMaterialWithSource,
};
