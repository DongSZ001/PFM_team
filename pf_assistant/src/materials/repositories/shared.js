const db = require('../../../database');

function getDb() {
  return db.getDb();
}

function now() {
  return Date.now();
}

/** Make a stable material_key from a display name. Keeps ASCII letters/digits; lowercases; collapses runs of underscores. */
function makeMaterialKey(displayName) {
  return String(displayName || '')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[\u3000-\u303f\uFF00-\uFFEF]/g, '')
    .replace(/[，、；。？！“”‘’"]/g, '')
    .replace(/[\u200b-\u200f]/g, '')
    .replace(/[\\/]+/g, '_')
    .replace(/__+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 200) || 'unnamed';
}

module.exports = {
  getDb,
  now,
  makeMaterialKey,
};
