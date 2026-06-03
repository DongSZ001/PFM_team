/**
 * High-level material parameter read composition.
 *
 * These helpers shape repository rows into the API-facing structures used by
 * HTTP handlers while table-oriented SQL remains in the record modules.
 */

'use strict';

const unit = require('../converters/unit-converter');
const { getMaterialById } = require('./material-records');
const { getSourceById } = require('./source-records');
const { getParameterSetById, getParameterSetsForMaterialWithSource } = require('./parameter-set-records');
const { getValuesForSet } = require('./parameter-value-records');

function toApiParameter(pv) {
  const displayMeta = unit.getDisplayMeta(pv.parameter_key);
  const displayValue = pv.value_si != null ? unit.siToDisplay(pv.parameter_key, pv.value_si) : null;
  const status = pv.import_warning ? 'warning' : (pv.value_si != null || pv.value_min_si != null || pv.value_max_si != null || (pv.text_value && pv.text_value !== '')) ? 'ok' : 'empty';
  return {
    parameterKey: pv.parameter_key,
    displayName: pv.display_name,
    category: pv.category,
    valueSi: pv.value_si,
    valueMinSi: pv.value_min_si,
    valueMaxSi: pv.value_max_si,
    textValue: pv.text_value,
    rawValue: pv.raw_value,
    rawUnit: pv.raw_unit,
    siUnit: pv.si_unit || displayMeta.siUnit,
    displayValue,
    displayUnit: pv.display_unit || displayMeta.displayUnit,
    isDerived: !!pv.is_derived,
    derivationNote: pv.derivation_note,
    importWarning: pv.import_warning,
    notes: pv.notes,
    status,
  };
}

function getMaterialSummary(materialId) {
  const m = getMaterialById(materialId);
  if (!m) return null;
  const sets = getParameterSetsForMaterialWithSource(materialId);
  return {
    id: m.id,
    materialKey: m.material_key,
    displayName: m.display_name,
    stackStructure: m.stack_structure,
    materialFamily: m.material_family,
    magneticLayer: m.magnetic_layer,
    substrate: m.substrate,
    notes: m.notes,
    parameterSets: sets.map((ps) => ({
      id: ps.id,
      setName: ps.set_name,
      setType: ps.set_type,
      simulationContext: ps.simulation_context,
      isDefault: !!ps.is_default,
      confidenceLevel: ps.confidence_level,
      notes: ps.notes,
      source: ps.source_id ? {
        firstAuthor: ps.first_author,
        authors: ps.authors,
        journal: ps.journal,
        year: ps.year,
        title: ps.title,
        doi: ps.doi,
      } : null,
    })),
  };
}

function getParameterSetDetail(setId) {
  const ps = getParameterSetById(setId);
  if (!ps) return null;
  const m = getMaterialById(ps.material_id);
  const s = ps.source_id ? getSourceById(ps.source_id) : null;
  const values = getValuesForSet(setId);
  return {
    parameterSet: {
      id: ps.id,
      setName: ps.set_name,
      setType: ps.set_type,
      simulationContext: ps.simulation_context,
      isDefault: !!ps.is_default,
      confidenceLevel: ps.confidence_level,
      notes: ps.notes,
    },
    material: m ? {
      id: m.id,
      materialKey: m.material_key,
      displayName: m.display_name,
      stackStructure: m.stack_structure,
    } : null,
    source: s ? {
      firstAuthor: s.first_author,
      authors: s.authors,
      journal: s.journal,
      year: s.year,
      title: s.title,
      doi: s.doi,
    } : null,
    parameters: values.map(toApiParameter),
  };
}

module.exports = {
  toApiParameter,
  getMaterialSummary,
  getParameterSetDetail,
};
