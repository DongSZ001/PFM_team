#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const db = require('../database');
const { importFerroLandauDatabaseFromMarkdown, getFerroLandauCounts } = require('../src/ferro/landau-repository');

const inputPath = path.resolve(process.cwd(), process.argv[2] || 'ferroelectric_landau_coefficients_database.md');
if (!fs.existsSync(inputPath)) {
  console.error('[ferro-landau] file not found:', inputPath);
  process.exit(1);
}

db.initDb();
const markdown = fs.readFileSync(inputPath, 'utf8');
const summary = importFerroLandauDatabaseFromMarkdown(markdown, { sourceFileName: path.basename(inputPath) });
const counts = getFerroLandauCounts();
console.log(JSON.stringify({ imported: summary, counts }, null, 2));
