'use strict';

const db = require('../../database');

function parseFerroLandauMarkdown(markdown) {
  const text = String(markdown || '').replace(/\r\n/g, '\n');
  return {
    sourceSets: parseSourceSets(text),
    coefficientRecords: parseCoefficientRecords(text),
    references: parseReferences(text),
    auxiliaryDefinitions: parseAuxiliaryDefinitions(text),
    dataQualityNotes: parseDataQualityNotes(text),
  };
}

function importFerroLandauDatabaseFromMarkdown(markdown, { sourceFileName = '' } = {}) {
  const parsed = parseFerroLandauMarkdown(markdown);
  const database = db.getDb();
  if (typeof db.initFerroLandauTables === 'function') db.initFerroLandauTables(database);
  const ts = Date.now();

  const runImport = database.transaction(() => {
    database.prepare('DELETE FROM ferro_landau_coefficient_records').run();
    database.prepare('DELETE FROM ferro_landau_auxiliary_definitions').run();
    database.prepare('DELETE FROM ferro_landau_references').run();
    database.prepare('DELETE FROM ferro_landau_data_quality_notes').run();
    database.prepare('DELETE FROM ferro_landau_source_sets').run();

    const insertSet = database.prepare(`
      INSERT INTO ferro_landau_source_sets
        (set_key, material_id, material_name, composition, source_ref, polynomial_order, temperature_unit, variables, notes, source_file_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of parsed.sourceSets) {
      insertSet.run(
        row.setId,
        row.materialId,
        row.materialName,
        row.composition,
        row.sourceRef,
        row.order,
        row.temperatureUnit,
        row.variables,
        row.notes,
        sourceFileName,
        ts,
        ts,
      );
    }

    const insertCoeff = database.prepare(`
      INSERT INTO ferro_landau_coefficient_records
        (source_set_key, material, composition, polynomial_order, coefficient_id, normalized_coefficient_id, unit_reported, value_expression, notes, source_file_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of parsed.coefficientRecords) {
      insertCoeff.run(
        row.setId,
        row.material,
        row.composition,
        row.order,
        row.coefficientId,
        normalizeCoefficientId(row.coefficientId),
        row.unitReported,
        row.valueExpression,
        row.notes,
        sourceFileName,
        ts,
        ts,
      );
    }

    const insertReference = database.prepare(`
      INSERT INTO ferro_landau_references
        (ref_key, citation_text, source_file_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const row of parsed.references) {
      insertReference.run(row.refKey, row.citationText, sourceFileName, ts, ts);
    }

    const insertAux = database.prepare(`
      INSERT INTO ferro_landau_auxiliary_definitions
        (source_set_key, section_title, definition_text, source_file_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const row of parsed.auxiliaryDefinitions) {
      insertAux.run(row.setId, row.sectionTitle, row.definitionText, sourceFileName, ts, ts);
    }

    const insertNote = database.prepare(`
      INSERT INTO ferro_landau_data_quality_notes
        (note_text, source_file_name, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `);
    for (const note of parsed.dataQualityNotes) {
      insertNote.run(note, sourceFileName, ts, ts);
    }
  });

  runImport();
  return {
    sourceSets: parsed.sourceSets.length,
    coefficientRecords: parsed.coefficientRecords.length,
    references: parsed.references.length,
    auxiliaryDefinitions: parsed.auxiliaryDefinitions.length,
  };
}

function getFerroLandauCounts() {
  const database = db.getDb();
  if (typeof db.initFerroLandauTables === 'function') db.initFerroLandauTables(database);
  return {
    sourceSets: database.prepare('SELECT COUNT(*) AS count FROM ferro_landau_source_sets').get().count,
    coefficientRecords: database.prepare('SELECT COUNT(*) AS count FROM ferro_landau_coefficient_records').get().count,
    references: database.prepare('SELECT COUNT(*) AS count FROM ferro_landau_references').get().count,
    auxiliaryDefinitions: database.prepare('SELECT COUNT(*) AS count FROM ferro_landau_auxiliary_definitions').get().count,
    dataQualityNotes: database.prepare('SELECT COUNT(*) AS count FROM ferro_landau_data_quality_notes').get().count,
  };
}

function getFerroLandauSourceSet(setKey) {
  const database = db.getDb();
  if (typeof db.initFerroLandauTables === 'function') db.initFerroLandauTables(database);
  return database.prepare('SELECT * FROM ferro_landau_source_sets WHERE set_key = ?').get(setKey) || null;
}

function listFerroLandauSourceSets() {
  const database = db.getDb();
  if (typeof db.initFerroLandauTables === 'function') db.initFerroLandauTables(database);
  return database.prepare('SELECT * FROM ferro_landau_source_sets ORDER BY id ASC').all();
}

function listFerroLandauCoefficientRecords(setKey) {
  const database = db.getDb();
  if (typeof db.initFerroLandauTables === 'function') db.initFerroLandauTables(database);
  return database.prepare(`
    SELECT * FROM ferro_landau_coefficient_records
    WHERE source_set_key = ?
    ORDER BY id ASC
  `).all(setKey);
}

function upsertFerroLandauSourceSet(row, { sourceFileName = 'ferro-landau-editor' } = {}) {
  const database = db.getDb();
  if (typeof db.initFerroLandauTables === 'function') db.initFerroLandauTables(database);
  const ts = Date.now();
  const setKey = row.set_key || row.setKey || row.setId;
  if (!setKey) throw validationError('set_key is required');
  database.prepare(`
    INSERT INTO ferro_landau_source_sets
      (set_key, material_id, material_name, composition, source_ref, polynomial_order, temperature_unit, variables, notes, source_file_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(set_key) DO UPDATE SET
      material_id = excluded.material_id,
      material_name = excluded.material_name,
      composition = excluded.composition,
      source_ref = excluded.source_ref,
      polynomial_order = excluded.polynomial_order,
      temperature_unit = excluded.temperature_unit,
      variables = excluded.variables,
      notes = excluded.notes,
      source_file_name = excluded.source_file_name,
      updated_at = excluded.updated_at
  `).run(
    setKey,
    row.material_id || row.materialId || '',
    row.material_name || row.materialName || row.material_id || row.materialId || '',
    row.composition || '',
    row.source_ref || row.sourceRef || '',
    row.polynomial_order || row.order || '',
    row.temperature_unit || row.temperatureUnit || '',
    row.variables || '',
    row.notes || '',
    sourceFileName,
    ts,
    ts,
  );
  return getFerroLandauSourceSet(setKey);
}

function replaceFerroLandauCoefficientRecords(setKey, records, { sourceFileName = 'ferro-landau-editor' } = {}) {
  const database = db.getDb();
  if (typeof db.initFerroLandauTables === 'function') db.initFerroLandauTables(database);
  if (!getFerroLandauSourceSet(setKey)) throw validationError('Landau source set 不存在');
  const ts = Date.now();
  const run = database.transaction(() => {
    database.prepare('DELETE FROM ferro_landau_coefficient_records WHERE source_set_key = ?').run(setKey);
    const insert = database.prepare(`
      INSERT INTO ferro_landau_coefficient_records
        (source_set_key, material, composition, polynomial_order, coefficient_id, normalized_coefficient_id, unit_reported, value_expression, notes, source_file_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of records || []) {
      const coefficientId = row.coefficient_id || row.coefficientId;
      if (!coefficientId) throw validationError('coefficient_id is required');
      insert.run(
        setKey,
        row.material || '',
        row.composition || '',
        row.polynomial_order || row.order || '',
        coefficientId,
        normalizeCoefficientId(coefficientId),
        row.unit_reported || row.unitReported || '',
        row.value_expression || row.valueExpression || '',
        row.notes || '',
        sourceFileName,
        ts,
        ts,
      );
    }
  });
  run();
  return listFerroLandauCoefficientRecords(setKey);
}

function exportFerroLandauDatabaseToMarkdown() {
  const sourceSets = listFerroLandauSourceSets();
  const rows = sourceSets.flatMap((set) => listFerroLandauCoefficientRecords(set.set_key));
  return [
    '# Ferroelectric Landau Coefficients Database',
    '',
    '## 3. Source sets',
    '',
    '| set_id | material_id | material_name | composition | source_ref | order | T_unit | variables | notes |',
    '|---|---|---|---|---|---|---|---|---|',
    ...sourceSets.map((row) => '| ' + [
      row.set_key, row.material_id, row.material_name, row.composition, row.source_ref, row.polynomial_order, row.temperature_unit, row.variables, row.notes,
    ].map(markdownCell).join(' | ') + ' |'),
    '',
    '## 5. Coefficient records',
    '',
    '| set_id | material | composition | order | coefficient_id | unit_reported | value_expression | notes |',
    '|---|---|---|---|---|---|---|---|',
    ...rows.map((row) => '| ' + [
      row.source_set_key, row.material, row.composition, row.polynomial_order, row.coefficient_id, row.unit_reported, '`' + row.value_expression + '`', row.notes,
    ].map(markdownCell).join(' | ') + ' |'),
    '',
  ].join('\n');
}

function parseSourceSets(text) {
  return parseMarkdownTable(text, '## 3. Source sets').map((row) => ({
    setId: row.set_id,
    materialId: row.material_id,
    materialName: row.material_name,
    composition: row.composition,
    sourceRef: row.source_ref,
    order: row.order,
    temperatureUnit: row.T_unit,
    variables: row.variables,
    notes: row.notes,
  })).filter((row) => row.setId);
}

function parseCoefficientRecords(text) {
  return parseMarkdownTable(text, '## 5. Coefficient records').map((row) => ({
    setId: row.set_id,
    material: row.material,
    composition: row.composition,
    order: row.order,
    coefficientId: row.coefficient_id,
    unitReported: row.unit_reported,
    valueExpression: stripInlineCode(row.value_expression),
    notes: row.notes,
  })).filter((row) => row.setId && row.coefficientId);
}

function parseReferences(text) {
  const section = sectionBetween(text, '## 6. Reference list', '## 7. Data-quality notes');
  return section.split('\n').map((line) => {
    const match = line.match(/^\s*-\s*\[(\d+)\]\s*(.+)$/);
    if (!match) return null;
    return { refKey: '[' + match[1] + ']', citationText: match[2].trim() };
  }).filter(Boolean);
}

function parseAuxiliaryDefinitions(text) {
  const section = sectionBetween(text, '## 4. Auxiliary definitions', '## 5. Coefficient records');
  const results = [];
  const re = /^###\s+\d+\.\d+\s+`([^`]+)`\s*\n+```text\n([\s\S]*?)\n```/gm;
  let match;
  while ((match = re.exec(section)) !== null) {
    results.push({
      setId: match[1].trim(),
      sectionTitle: match[1].trim(),
      definitionText: match[2].trim(),
    });
  }
  return results;
}

function parseDataQualityNotes(text) {
  const section = sectionBetween(text, '## 7. Data-quality notes', null);
  return section.split('\n').map((line) => {
    const match = line.match(/^\s*-\s+(.+)$/);
    return match ? match[1].trim() : null;
  }).filter(Boolean);
}

function parseMarkdownTable(text, heading) {
  const section = sectionBetween(text, heading, nextHeadingPattern(heading));
  const lines = section.split('\n').filter((line) => /^\s*\|.*\|\s*$/.test(line));
  if (lines.length < 2) return [];
  const headers = splitMarkdownTableRow(lines[0]).map(normalizeHeader);
  return lines.slice(2).map((line) => {
    const cells = splitMarkdownTableRow(line);
    const row = {};
    headers.forEach((header, index) => { row[header] = (cells[index] || '').trim(); });
    return row;
  });
}

function sectionBetween(text, startHeading, endHeadingOrPattern) {
  const start = text.indexOf(startHeading);
  if (start < 0) return '';
  const from = start + startHeading.length;
  let end = text.length;
  if (typeof endHeadingOrPattern === 'string') {
    const idx = text.indexOf(endHeadingOrPattern, from);
    if (idx >= 0) end = idx;
  } else if (endHeadingOrPattern instanceof RegExp) {
    const rest = text.slice(from);
    const match = rest.match(endHeadingOrPattern);
    if (match && match.index !== undefined) end = from + match.index;
  }
  return text.slice(from, end);
}

function nextHeadingPattern(heading) {
  const match = heading.match(/^##\s+(\d+)\./);
  if (!match) return /^##\s+/m;
  return new RegExp('^##\\s+' + (Number(match[1]) + 1) + '\\.', 'm');
}

function splitMarkdownTableRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

function normalizeHeader(header) {
  return header.trim().replace(/`/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function stripInlineCode(value) {
  return String(value || '').trim().replace(/^`/, '').replace(/`$/, '').trim();
}

function normalizeCoefficientId(value) {
  const text = String(value || '').trim();
  if (/^alpha/i.test(text)) return text.toLowerCase();
  if (/^a\d/i.test(text)) return text.toLowerCase().replace(/^a/, 'alpha');
  return text.toUpperCase();
}

function markdownCell(value) {
  return String(value || '').replace(/\|/g, '\\|');
}

function validationError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

module.exports = {
  parseFerroLandauMarkdown,
  importFerroLandauDatabaseFromMarkdown,
  getFerroLandauCounts,
  getFerroLandauSourceSet,
  listFerroLandauSourceSets,
  listFerroLandauCoefficientRecords,
  upsertFerroLandauSourceSet,
  replaceFerroLandauCoefficientRecords,
  exportFerroLandauDatabaseToMarkdown,
  normalizeCoefficientId,
};
