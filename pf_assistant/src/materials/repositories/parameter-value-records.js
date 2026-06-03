/**
 * parameter_values table access.
 *
 * These helpers are split out from material-parameters-repository.js so value
 * writes and reads can evolve independently from material/source/set records.
 */

'use strict';

const { getDb, now } = require('./shared');
const { getParameterDefinitionByKey } = require('./parameter-definition-records');

/**
 * Write a single parameter value (upsert by (set_id, parameter_definition_id)).
 * If force is false and the row already has a value, the value is preserved
 * unless the caller provides new data.
 */
function writeParameterValue({
  parameterSetId, parameterKey, valueSi, valueMinSi, valueMaxSi, textValue,
  rawValue, rawUnit, isDerived, derivationNote, importWarning, notes, force = false,
}) {
  if (!parameterSetId || !parameterKey) throw new Error('parameterSetId and parameterKey are required');
  const def = getParameterDefinitionByKey(parameterKey);
  if (!def) throw new Error(`unknown parameter_key: ${parameterKey}`);

  const database = getDb();
  const existing = database.prepare(`
    SELECT * FROM parameter_values WHERE parameter_set_id = ? AND parameter_definition_id = ?
  `).get(parameterSetId, def.id);

  const hasNewData = (
    valueSi != null || valueMinSi != null || valueMaxSi != null ||
    (textValue != null && String(textValue).trim() !== '') ||
    (rawValue != null && String(rawValue).trim() !== '')
  );

  if (existing && !force && !hasNewData) return existing;
  if (existing && !force) {
    const ts = now();
    database.prepare(`
      UPDATE parameter_values
      SET value_si = COALESCE(?, value_si),
          value_min_si = COALESCE(?, value_min_si),
          value_max_si = COALESCE(?, value_max_si),
          text_value = COALESCE(NULLIF(?, ''), text_value),
          raw_value = COALESCE(NULLIF(?, ''), raw_value),
          raw_unit = COALESCE(NULLIF(?, ''), raw_unit),
          is_derived = COALESCE(?, is_derived),
          derivation_note = COALESCE(NULLIF(?, ''), derivation_note),
          import_warning = COALESCE(NULLIF(?, ''), import_warning),
          notes = COALESCE(NULLIF(?, ''), notes),
          updated_at = ?
      WHERE id = ?
    `).run(
      valueSi, valueMinSi, valueMaxSi,
      textValue == null ? '' : textValue,
      rawValue == null ? '' : rawValue,
      rawUnit == null ? '' : rawUnit,
      isDerived == null ? null : (isDerived ? 1 : 0),
      derivationNote || '',
      importWarning || '',
      notes || '',
      ts,
      existing.id,
    );
    return database.prepare(`SELECT * FROM parameter_values WHERE id = ?`).get(existing.id);
  }

  const ts = now();
  const info = database.prepare(`
    INSERT INTO parameter_values
      (parameter_set_id, parameter_definition_id, value_si, value_min_si, value_max_si, text_value, raw_value, raw_unit, is_derived, derivation_note, import_warning, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    parameterSetId, def.id,
    valueSi, valueMinSi, valueMaxSi,
    textValue, rawValue, rawUnit,
    isDerived ? 1 : 0,
    derivationNote || null,
    importWarning || null,
    notes || null,
    ts, ts,
  );
  return database.prepare(`SELECT * FROM parameter_values WHERE id = ?`).get(info.lastInsertRowid);
}

function getValuesForSet(parameterSetId) {
  return getDb().prepare(`
    SELECT pv.*, pd.parameter_key, pd.display_name, pd.category, pd.si_unit, pd.display_unit, pd.value_type
    FROM parameter_values pv
    JOIN parameter_definitions pd ON pd.id = pv.parameter_definition_id
    WHERE pv.parameter_set_id = ?
    ORDER BY pd.category, pd.parameter_key
  `).all(parameterSetId);
}

module.exports = {
  writeParameterValue,
  getValuesForSet,
};
