/**
 * Material parameter repository compatibility aggregator.
 *
 * This module preserves the historical aggregate export contract used by
 * import scripts and HTTP handlers. Record-level SQL lives in the sibling modules
 * in this directory; API-facing read composition lives in
 * material-parameter-queries.js.
 */

'use strict';

const { makeMaterialKey } = require('./shared');
const materialRecords = require('./material-records');
const sourceRecords = require('./source-records');
const parameterDefinitionRecords = require('./parameter-definition-records');
const parameterSetRecords = require('./parameter-set-records');
const parameterValueRecords = require('./parameter-value-records');
const importBatchRecords = require('./import-batch-records');
const materialParameterQueries = require('./material-parameter-queries');

const {
  upsertMaterial,
  getMaterialById,
  getMaterialByKey,
  listMaterials,
} = materialRecords;

const {
  splitAuthors,
  upsertSource,
  getSourceById,
} = sourceRecords;

const {
  listParameterDefinitions,
  getParameterDefinitionByKey,
  getParameterDefinitionById,
} = parameterDefinitionRecords;

const {
  upsertParameterSet,
  getParameterSetById,
  listParameterSetsForMaterial,
  getParameterSetsForMaterialWithSource,
} = parameterSetRecords;

const {
  writeParameterValue,
  getValuesForSet,
} = parameterValueRecords;

const {
  createImportBatch,
  finalizeImportBatch,
  recordImportWarning,
  listImportWarnings,
} = importBatchRecords;

const {
  toApiParameter,
  getMaterialSummary,
  getParameterSetDetail,
} = materialParameterQueries;

module.exports = {
  // materials
  upsertMaterial, getMaterialById, getMaterialByKey, listMaterials, getMaterialSummary,
  // sources
  upsertSource, getSourceById, splitAuthors,
  // parameter definitions
  listParameterDefinitions, getParameterDefinitionByKey, getParameterDefinitionById,
  // parameter sets
  upsertParameterSet, getParameterSetById, listParameterSetsForMaterial, getParameterSetsForMaterialWithSource, getParameterSetDetail,
  // parameter values
  writeParameterValue, getValuesForSet, toApiParameter,
  // import batches
  createImportBatch, finalizeImportBatch, recordImportWarning, listImportWarnings,
  // helpers
  makeMaterialKey,
};
