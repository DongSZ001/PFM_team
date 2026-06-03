#!/usr/bin/env node
/**
 * Import magnetic material parameters from an Excel file.
 *
 * Usage:
 *   node scripts/import-magnetic-parameters.js /path/to/磁性参数-汇总.xlsx
 *   node scripts/import-magnetic-parameters.js ./磁性参数-汇总.xlsx
 *
 * Behaviour:
 *   - Reads the workbook with the `xlsx` library.
 *   - Auto-detects the data sheet (prefers "Sheet1"; falls back to first non-empty sheet).
 *   - Matches columns by header text (not by column index).
 *   - Upserts materials, sources, parameter_sets, parameter_values.
 *   - Records every ambiguity / parse failure into import_warnings.
 *   - Writes a JSON report to data/import-reports/magnetic-parameters-import-report.json
 *     (or whatever filename is given via --report).
 */

'use strict';

const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

const db = require('../database');
const mp = require('../material-parameters');
const unit = require('../unit-converter');

// ---- CLI ------------------------------------------------------------------

function parseArgs(argv) {
  const args = { file: null, sheet: null, report: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--sheet') { args.sheet = argv[++i]; continue; }
    if (a === '--report') { args.report = argv[++i]; continue; }
    if (a === '--help' || a === '-h') {
      console.log('Usage: node scripts/import-magnetic-parameters.js <xlsx-file> [--sheet NAME] [--report PATH]');
      process.exit(0);
    }
    if (!args.file) args.file = a;
  }
  return args;
}

// ---- Header detection ------------------------------------------------------

/**
 * Normalize a header for matching:
 *   "Young's modulus (GPa)" -> "young's modulus (gpa)"
 *   "B1_from λ100"          -> "b1_from λ100"
 */
function normHeader(h) {
  return String(h == null ? '' : h)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[\u2018\u2019\u2032]/g, "'") // curly/smart quotes → straight
    .trim();
}

/**
 * Build a column->canonical-key map.  Each canonical key maps to one
 * parameter_key in unit-converter.js (or one of the bibliographic fields).
 */
function buildHeaderMap(headers) {
  const map = {};
  const direct = {
    '材料': 'displayName',
    '作者': 'authors',
    '期刊': 'journal',
    '年份': 'year',
    'doi': 'doi',
    '标题': 'title',
    '交换常数 a (j/m)': 'Aex',
    '各向异性类型': 'anisotropy_type',
    'k1 (j/m³)': 'Ku1',
    'k2 (j/m³)': 'Ku2',
    'ms (a/m)': 'Ms',
    'dmi 类型': 'DMI_type',
    'dmi (mj/m²)': 'D',
    '阻尼系数': 'alpha',
    'γ₀ (rad/t·s)': 'gamma0',
    '磁场': 'B_ext',
    'c11 (pa)': 'c11',
    'c12 (pa)': 'c12',
    'c44 (pa)': 'c44',
    'λ100': 'lambda100',
    'λ111': 'lambda111',
    // Curly apostrophe is normalised in normHeader() so a single entry suffices.
    "young's modulus (gpa)": 'young_modulus',
    "poisson's ratio": 'poisson_ratio',
    'b1 (pa)': 'b1',
    'b2 (pa)': 'b2',
    'b1_from λ100': 'B1_from_lambda100',
    'b2_from λ100': 'B2_from_lambda100',
  };
  for (let i = 0; i < headers.length; i++) {
    const k = direct[normHeader(headers[i])];
    if (k) map[i] = k;
  }
  return map;
}

// ---- Per-row classifier ----------------------------------------------------

/**
 * Heuristics for figuring out set_type / simulation_context from row text.
 *  - "有效" / "effective"  -> set_type=effective
 *  - "应变" / "strain"     -> simulation_context=strain-driven
 *  - "skyrmion"            -> simulation_context=skyrmion
 *  - "saw"                 -> simulation_context=SAW
 *  - "magnetoelastic"      -> simulation_context=magnetoelastic
 *  - "mumax3"              -> simulation_context=mumax3
 */
function classifyRow(row) {
  const text = Object.values(row).filter((v) => v != null).map(String).join(' ').toLowerCase();
  let setType = 'literature';
  let simulationContext = 'general';

  if (/(有效|effective)/.test(text)) setType = 'effective';
  if (/(拟合|fitted|fit)/.test(text)) setType = 'fitted';
  if (/(派生|derived)/.test(text)) setType = 'derived';
  if (/(估算|estimated)/.test(text)) setType = 'estimated';
  if (/(自定义|custom)/.test(text)) setType = 'custom';

  if (/(skyrmion|斯格米子)/.test(text)) simulationContext = 'skyrmion';
  else if (/(saw|声表面波)/.test(text)) simulationContext = 'SAW';
  else if (/(非均匀应变|应变|strain)/.test(text)) simulationContext = 'strain-driven';
  else if (/(磁弹|magnetoelastic)/.test(text)) simulationContext = 'magnetoelastic';
  else if (/(dmi\s*梯度|dmi gradient)/.test(text)) simulationContext = 'DMI-gradient';
  else if (/(mumax3|相场|phase.field)/.test(text)) simulationContext = 'mumax3';
  else if (!text.trim()) simulationContext = 'unknown';
  else simulationContext = 'unknown';

  // Authors field is a common anchor: if empty, set_type=unknown.
  if (!row.authors || !String(row.authors).trim()) {
    setType = 'unknown';
  }

  return { setType, simulationContext };
}

function isRowEmpty(row) {
  for (const v of Object.values(row)) {
    if (v != null && String(v).trim() !== '') return false;
  }
  return true;
}

// ---- Main import flow ------------------------------------------------------

function importExcel(filePath, opts = {}) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const wb = XLSX.readFile(filePath, { cellDates: false });
  const sheetName = opts.sheet || pickSheet(wb);
  if (!sheetName) throw new Error('No usable sheet found in workbook');
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet "${sheetName}" not found`);

  // Convert to array-of-arrays, then to array-of-objects.
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  if (aoa.length < 2) {
    return finalize({ sheetName, totalRows: 0, importedRows: 0, skippedRows: 0, materialsCreated: 0, parameterSetsCreated: 0, parameterValuesCreated: 0, warnings: [] });
  }
  const headers = aoa[0];
  const headerMap = buildHeaderMap(headers);

  // Initialise the database if not done.
  db.initDb();

  const importBatch = mp.createImportBatch({
    sourceFileName: path.basename(filePath),
    sheetName,
    notes: opts.notes || 'Initial import from Excel',
  });

  let importedRows = 0;
  let skippedRows = 0;
  let parameterValuesCreated = 0;
  let warningCount = 0;

  // Track the "last material" so empty-material rows can be associated
  // with the previous material *if* they look like a continuation
  // (e.g. they have an author marker such as "有效-XXX").
  let lastMaterial = null;

  for (let r = 1; r < aoa.length; r++) {
    const arr = aoa[r];
    const row = {};
    for (const [colIdx, key] of Object.entries(headerMap)) {
      const idx = Number(colIdx);
      row[key] = arr[idx];
    }

    if (isRowEmpty(row)) {
      skippedRows++;
      continue;
    }

    const displayName = (row.displayName || '').toString().trim();
    let material = null;
    if (displayName) {
      material = mp.upsertMaterial({ displayName });
    } else if (lastMaterial) {
      // Empty material name — try to associate with previous.
      mp.recordImportWarning({
        importBatchId: importBatch.id,
        rowIndex: r + 1, // 1-indexed
        columnName: '材料',
        rawValue: '',
        warningType: 'material_inferred_from_previous_row',
        message: `Material name empty; assumed to be the previous row's material "${lastMaterial.display_name}". Please verify.`,
      });
      warningCount++;
      material = lastMaterial;
    } else {
      mp.recordImportWarning({
        importBatchId: importBatch.id,
        rowIndex: r + 1,
        columnName: '材料',
        rawValue: '',
        warningType: 'empty_material',
        message: 'Row has no material name and no previous material to fall back on; skipped.',
      });
      warningCount++;
      skippedRows++;
      continue;
    }

    if (material) lastMaterial = material;

    // Source
    const source = mp.upsertSource({
      authors: row.authors,
      journal: row.journal,
      year: row.year,
      title: row.title,
      doi: row.doi,
    });

    // Set type / context
    const { setType, simulationContext } = classifyRow(row);

    // Build a set name; include the source's first author + year + context
    // so re-imports don't collide.
    const setName = buildSetName(material, source, setType, simulationContext, r);
    const isDefault = 0; // never auto-default; first-version conservative

    const ps = mp.upsertParameterSet({
      materialId: material.id,
      sourceId: source.id,
      setName,
      setType,
      simulationContext,
      isDefault,
      confidenceLevel: setType === 'literature' ? 'medium' : 'low',
      notes: null,
    });

    // Write each parameter
    for (const [colIdx, key] of Object.entries(headerMap)) {
      if (['displayName', 'authors', 'journal', 'year', 'doi', 'title'].includes(key)) continue;
      const raw = arr[Number(colIdx)];
      if (raw == null || raw === '') continue;
      const conv = unit.convert(key, raw);
      // Coerce to number when possible; the converter already did this, but
      // for string inputs like "单轴各向异性" we keep text_value.
      const isDerived = (key === 'B1_from_lambda100' || key === 'B2_from_lambda100');
      const written = mp.writeParameterValue({
        parameterSetId: ps.id,
        parameterKey: key,
        valueSi: conv.valueSi,
        valueMinSi: conv.valueMinSi,
        valueMaxSi: conv.valueMaxSi,
        textValue: conv.textValue,
        rawValue: raw,
        rawUnit: conv.rawUnit,
        isDerived,
        derivationNote: isDerived ? 'derived from λ100/λ111' : null,
        importWarning: conv.warning || null,
      });
      if (conv.warning) {
        mp.recordImportWarning({
          importBatchId: importBatch.id,
          rowIndex: r + 1,
          columnName: key,
          rawValue: String(raw),
          warningType: 'unit_or_value_warning',
          message: conv.warning,
        });
        warningCount++;
      }
      if (written) parameterValuesCreated++;
    }

    importedRows++;
  }

  mp.finalizeImportBatch(importBatch.id, { importedRows, skippedRows, warningCount });

  // Pull the warnings back so the report is self-contained.
  const warnings = mp.listImportWarnings(importBatch.id);

  return finalize({
    sourceFile: filePath,
    sourceFileName: path.basename(filePath),
    sheetName,
    totalRows: aoa.length - 1,
    importedRows,
    skippedRows,
    materialsCreated: countMaterials(),
    parameterSetsCreated: countParameterSets(),
    parameterValuesCreated,
    warnings,
    importBatchId: importBatch.id,
  });
}

function buildSetName(material, source, setType, simulationContext, rowIndex) {
  const a = (source && source.first_author) ? source.first_author.replace(/\s+/g, '') : 'NoAuthor';
  const y = (source && source.year) ? source.year : 'NoYear';
  const ctx = (simulationContext && simulationContext !== 'unknown') ? simulationContext : 'general';
  const t = (setType && setType !== 'unknown') ? setType : 'unknown';
  return `${a}_${y}_${t}_${ctx}_r${rowIndex}`;
}

function pickSheet(wb) {
  const names = wb.SheetNames || [];
  if (names.includes('Sheet1')) return 'Sheet1';
  for (const n of names) {
    const ws = wb.Sheets[n];
    if (ws && ws['!ref']) return n;
  }
  return null;
}

function countMaterials() {
  return db.getDb().prepare(`SELECT COUNT(*) AS n FROM materials`).get().n;
}

function countParameterSets() {
  return db.getDb().prepare(`SELECT COUNT(*) AS n FROM parameter_sets`).get().n;
}

function finalize(report) {
  report.sourceFile = report.sourceFileName || null;
  return report;
}

// ---- Entry point -----------------------------------------------------------

if (require.main === module) {
  const args = parseArgs(process.argv);
  if (!args.file) {
    console.error('Usage: node scripts/import-magnetic-parameters.js <xlsx-file> [--sheet NAME] [--report PATH]');
    process.exit(1);
  }
  const filePath = path.resolve(args.file);
  try {
    const report = importExcel(filePath, { sheet: args.sheet });
    const reportPath = args.report || path.join(__dirname, '..', 'data', 'import-reports', 'magnetic-parameters-import-report.json');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

    // Console summary
    console.log('');
    console.log('=== Import summary ===');
    console.log(`Source:        ${filePath}`);
    console.log(`Sheet:         ${report.sheetName}`);
    console.log(`Total rows:    ${report.totalRows}`);
    console.log(`Imported:      ${report.importedRows}`);
    console.log(`Skipped:       ${report.skippedRows}`);
    console.log(`Materials:     ${report.materialsCreated}`);
    console.log(`ParameterSets: ${report.parameterSetsCreated}`);
    console.log(`Values:        ${report.parameterValuesCreated}`);
    console.log(`Warnings:      ${(report.warnings || []).length}`);
    console.log(`Report file:   ${reportPath}`);
    if (report.warnings && report.warnings.length) {
      console.log('');
      console.log('=== Warnings (first 20) ===');
      report.warnings.slice(0, 20).forEach((w) => {
        console.log(`  R${w.row_index}  ${w.column_name || ''}  ${w.warning_type}: ${w.message}`);
      });
    }
  } catch (err) {
    console.error('[import] Failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

module.exports = { importExcel, buildHeaderMap, classifyRow, buildSetName };
