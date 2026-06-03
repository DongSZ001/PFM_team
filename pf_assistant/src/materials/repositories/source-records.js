const { getDb, now } = require('./shared');

function splitAuthors(raw) {
  if (!raw) return { firstAuthor: null, authors: null };
  const s = String(raw).trim();
  if (!s) return { firstAuthor: null, authors: null };
  const parts = s.split(/[;；]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { firstAuthor: null, authors: s };
  return { firstAuthor: parts[0], authors: parts.join('; ') };
}

function upsertSource({ authors, journal, year, title, doi, sourceNote }) {
  const { firstAuthor, authors: authorsNorm } = splitAuthors(authors);
  const database = getDb();
  const doiNorm = (doi == null || String(doi).trim() === '') ? null : String(doi).trim();
  const yearNorm = (year == null || String(year).trim() === '') ? null : Number(year) || null;

  let existing = null;
  if (doiNorm) {
    existing = database.prepare(`SELECT * FROM sources WHERE doi = ?`).get(doiNorm);
  }
  if (!existing && firstAuthor && journal && yearNorm) {
    existing = database.prepare(`
      SELECT * FROM sources
      WHERE first_author = ? AND journal = ? AND year = ?
      LIMIT 1
    `).get(firstAuthor, journal, yearNorm);
  }
  if (existing) return existing;

  const ts = now();
  const info = database.prepare(`
    INSERT INTO sources (first_author, authors, journal, year, title, doi, source_note, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    firstAuthor,
    authorsNorm,
    journal || null,
    yearNorm,
    title || null,
    doiNorm,
    sourceNote || null,
    ts,
    ts,
  );
  return database.prepare(`SELECT * FROM sources WHERE id = ?`).get(info.lastInsertRowid);
}

function getSourceById(id) {
  return getDb().prepare(`SELECT * FROM sources WHERE id = ?`).get(id) || null;
}

module.exports = {
  splitAuthors,
  upsertSource,
  getSourceById,
};
