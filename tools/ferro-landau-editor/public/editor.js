'use strict';

let sourceSets = [];
let active = { sourceSet: null, coefficients: [] };

const fields = ['set_key', 'material_id', 'material_name', 'composition', 'source_ref', 'polynomial_order', 'temperature_unit', 'variables', 'notes'];
const els = {
  list: document.getElementById('setList'),
  search: document.getElementById('searchInput'),
  form: document.getElementById('sourceSetForm'),
  rows: document.getElementById('coeffRows'),
  status: document.getElementById('status'),
  validation: document.getElementById('validation'),
  validate: document.getElementById('validateBtn'),
  save: document.getElementById('saveBtn'),
  exportBtn: document.getElementById('exportBtn'),
  newSet: document.getElementById('newSetBtn'),
  addCoeff: document.getElementById('addCoeffBtn'),
};

init();

async function init() {
  bind();
  const data = await api('/api/source-sets');
  sourceSets = data.sourceSets || [];
  renderList();
  if (sourceSets[0]) await loadSet(sourceSets[0].set_key);
  else newSet();
}

function bind() {
  els.search.addEventListener('input', renderList);
  els.validate.addEventListener('click', validateCurrent);
  els.save.addEventListener('click', saveCurrent);
  els.exportBtn.addEventListener('click', () => { window.location.href = '/api/export-markdown'; });
  els.newSet.addEventListener('click', newSet);
  els.addCoeff.addEventListener('click', () => {
    active.coefficients.push({ coefficient_id: '', unit_reported: '', value_expression: '', notes: '' });
    renderRows();
  });
}

async function loadSet(setKey) {
  const data = await api('/api/source-sets/' + encodeURIComponent(setKey));
  active = { sourceSet: data.sourceSet, coefficients: data.coefficients || [] };
  renderList();
  renderForm();
  renderRows();
  renderValidation(null);
}

function newSet() {
  active = {
    sourceSet: { set_key: 'NEW_SET', material_id: '', material_name: '', composition: '', source_ref: '', polynomial_order: 'sixth_order', temperature_unit: 'K', variables: 'T', notes: '' },
    coefficients: [],
  };
  renderForm();
  renderRows();
  renderValidation(null);
}

function renderList() {
  const q = (els.search.value || '').toLowerCase();
  els.list.innerHTML = sourceSets.filter((set) => !q || JSON.stringify(set).toLowerCase().includes(q)).map((set) => {
    const activeClass = active.sourceSet && active.sourceSet.set_key === set.set_key ? ' is-active' : '';
    return `<div class="set-item${activeClass}" data-set-key="${escapeHtml(set.set_key)}"><div class="set-title">${escapeHtml(set.set_key)}</div><div>${escapeHtml(set.material_name || set.material_id || '')}</div><div>${escapeHtml(set.polynomial_order || '')}</div></div>`;
  }).join('');
  els.list.querySelectorAll('[data-set-key]').forEach((item) => item.addEventListener('click', () => loadSet(item.dataset.setKey)));
}

function renderForm() {
  els.form.innerHTML = fields.map((key) => `<div class="field"><label>${escapeHtml(key)}</label><input data-source-field="${escapeHtml(key)}" value="${escapeHtml(active.sourceSet && active.sourceSet[key] || '')}"></div>`).join('');
  els.form.querySelectorAll('[data-source-field]').forEach((input) => input.addEventListener('input', () => {
    active.sourceSet[input.dataset.sourceField] = input.value;
  }));
}

function renderRows() {
  els.rows.innerHTML = active.coefficients.map((row, index) => `<tr>
    <td><input data-coeff="${index}" data-key="coefficient_id" value="${escapeHtml(row.coefficient_id || '')}"></td>
    <td><input data-coeff="${index}" data-key="unit_reported" value="${escapeHtml(row.unit_reported || '')}"></td>
    <td class="expr"><input data-coeff="${index}" data-key="value_expression" value="${escapeHtml(row.value_expression || '')}"></td>
    <td><input data-coeff="${index}" data-key="notes" value="${escapeHtml(row.notes || '')}"></td>
    <td><button type="button" data-remove="${index}">删除</button></td>
  </tr>`).join('');
  els.rows.querySelectorAll('[data-coeff]').forEach((input) => input.addEventListener('input', () => {
    active.coefficients[Number(input.dataset.coeff)][input.dataset.key] = input.value;
  }));
  els.rows.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => {
    active.coefficients.splice(Number(button.dataset.remove), 1);
    renderRows();
  }));
}

async function validateCurrent() {
  const result = await api('/api/validate', active);
  renderValidation(result);
  setStatus(result.valid ? '校验通过' : '校验失败', result.valid ? 'ok' : 'err');
  return result;
}

async function saveCurrent() {
  const result = await api('/api/save', active);
  setStatus(`已保存，备份：${result.backupPath}`, 'ok');
  renderValidation(result.validation);
  const data = await api('/api/source-sets');
  sourceSets = data.sourceSets || [];
  renderList();
}

function renderValidation(result) {
  if (!result) {
    els.validation.innerHTML = '<div>尚未校验</div>';
    return;
  }
  els.validation.innerHTML = [
    result.errors && result.errors.length ? '<strong>错误</strong><ul>' + result.errors.map((x) => `<li>${escapeHtml(x)}</li>`).join('') + '</ul>' : '<div>无错误</div>',
    result.warnings && result.warnings.length ? '<strong>警告</strong><ul>' + result.warnings.map((x) => `<li>${escapeHtml(x)}</li>`).join('') + '</ul>' : '<div>无警告</div>',
  ].join('');
}

async function api(url, body) {
  const options = body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {};
  const res = await fetch(url, options);
  if (url.endsWith('export-markdown')) return res.text();
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function setStatus(text, kind) {
  els.status.textContent = text;
  els.status.className = 'status ' + kind;
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
