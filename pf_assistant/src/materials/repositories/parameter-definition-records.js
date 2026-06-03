const { getDb } = require('./shared');

function listParameterDefinitions() {
  return getDb().prepare(`SELECT * FROM parameter_definitions ORDER BY category, parameter_key`).all();
}

function getParameterDefinitionByKey(key) {
  return getDb().prepare(`SELECT * FROM parameter_definitions WHERE parameter_key = ?`).get(key) || null;
}

function getParameterDefinitionById(id) {
  return getDb().prepare(`SELECT * FROM parameter_definitions WHERE id = ?`).get(id) || null;
}

module.exports = {
  listParameterDefinitions,
  getParameterDefinitionByKey,
  getParameterDefinitionById,
};
