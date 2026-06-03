/**
 * import_batches and import_warnings table access.
 *
 * These helpers track spreadsheet/API import runs and row-level warnings.
 */

'use strict';

const { getDb, now } = require('./shared');

function createImportBatch({ sourceFileName, sheetName, notes }) {
  const ts = now();
  const info = getDb().prepare(`
    INSERT INTO import_batches (source_file_name, sheet_name, imported_rows, skipped_rows, warning_count, notes, created_at)
    VALUES (?, ?, 0, 0, 0, ?, ?)
  `).run(sourceFileName, sheetName, notes || null, ts);
  return getDb().prepare(`SELECT * FROM import_batches WHERE id = ?`).get(info.lastInsertRowid);
}

function finalizeImportBatch(id, { importedRows, skippedRows, warningCount }) {
  getDb().prepare(`
    UPDATE import_batches SET imported_rows = ?, skipped_rows = ?, warning_count = ? WHERE id = ?
  `).run(importedRows, skippedRows, warningCount, id);
  return getDb().prepare(`SELECT * FROM import_batches WHERE id = ?`).get(id);
}

function recordImportWarning({ importBatchId, rowIndex, columnName, rawValue, warningType, message }) {
  getDb().prepare(`
    INSERT INTO import_warnings (import_batch_id, row_index, column_name, raw_value, warning_type, message, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    importBatchId,
    rowIndex == null ? null : Number(rowIndex),
    columnName || null,
    rawValue == null ? null : String(rawValue),
    warningType || null,
    message || null,
    now(),
  );
}

function listImportWarnings(importBatchId) {
  return getDb().prepare(`
    SELECT * FROM import_warnings WHERE import_batch_id = ? ORDER BY id
  `).all(importBatchId);
}

module.exports = {
  createImportBatch,
  finalizeImportBatch,
  recordImportWarning,
  listImportWarnings,
};
