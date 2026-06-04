'use strict';

let catalog = null;
let activeFamilyId = null;

const els = {
  list: document.getElementById('familyList'),
  search: document.getElementById('searchInput'),
  json: document.getElementById('jsonEditor'),
  status: document.getElementById('status'),
  validation: document.getElementById('validation'),
  preview: document.getElementById('preview'),
  validate: document.getElementById('validateBtn'),
  save: document.getElementById('saveBtn'),
  saveReload: document.getElementById('saveReloadBtn'),
  add: document.getElementById('addFamilyBtn'),
  export: document.getElementById('exportBtn'),
  import: document.getElementById('importInput'),
};

init();

async function init() {
  bindEvents();
  const data = await api('/api/catalog');
  catalog = data.catalog;
  activeFamilyId = catalog.families && catalog.families[0] && catalog.families[0].familyId;
  syncJson();
  render();
  renderValidation(data.validation);
}

function bindEvents() {
  els.search.addEventListener('input', renderList);
  els.json.addEventListener('input', () => {
    try {
      catalog = JSON.parse(els.json.value);
      if (!activeFamilyId && catalog.families && catalog.families[0]) activeFamilyId = catalog.families[0].familyId;
      setStatus('JSON 已解析', 'ok');
      render();
    } catch (err) {
      setStatus('JSON 解析失败: ' + err.message, 'err');
    }
  });
  els.validate.addEventListener('click', validateCurrent);
  els.save.addEventListener('click', () => saveCurrent(false));
  els.saveReload.addEventListener('click', () => saveCurrent(true));
  els.add.addEventListener('click', addFamily);
  els.export.addEventListener('click', exportJson);
  els.import.addEventListener('change', importJson);
}

async function validateCurrent() {
  const result = await api('/api/validate', { catalog });
  renderValidation(result);
  setStatus(result.valid ? '校验通过' : '校验失败', result.valid ? 'ok' : 'err');
  return result;
}

async function saveCurrent(reload) {
  const result = await api('/api/save', { catalog });
  setStatus('已保存并备份: ' + result.backupPath, 'ok');
  renderValidation(result.validation);
  if (reload) {
    try {
      await api('/api/reload', {});
      setStatus('已保存、备份并请求刷新材料缓存', 'ok');
    } catch (err) {
      setStatus('已保存；刷新接口未成功，可重启主服务。' + err.message, 'err');
    }
  }
}

function addFamily() {
  catalog.families = catalog.families || [];
  const id = uniqueFamilyId('new_material');
  catalog.families.push({
    familyId: id,
    title: 'New Material',
    subtitle: 'phase-field model',
    groupMode: 'single',
    displayOrder: 999,
    temperature: 300,
    visibleInRecommendation: true,
    hideOtherModelsInFamily: false,
    composition: { enabled: false },
    defaultVisualization: { mode: 'component', component: 'pz', overlay: { arrows: true } },
    variants: [{ variantId: id + '_default', materialModelId: id + '_default', buttonLabel: '默认', title: 'Default model', visible: true }],
  });
  activeFamilyId = id;
  syncJson();
  render();
}

function render() {
  renderList();
  renderPreview();
}

function renderList() {
  const q = (els.search.value || '').toLowerCase();
  const families = (catalog && catalog.families || []).filter((family) => !q || JSON.stringify(family).toLowerCase().includes(q));
  els.list.innerHTML = families.map((family) => {
    const active = family.familyId === activeFamilyId ? ' is-active' : '';
    const tags = [
      '<span class="tag catalog">catalog配置</span>',
      family.visibleInRecommendation === false ? '<span class="tag warn">隐藏</span>' : '',
      family.hideOtherModelsInFamily ? '<span class="tag warn">隐藏同族其他模型</span>' : '',
    ].filter(Boolean).join('');
    return `<div class="family-item${active}" data-family-id="${escapeHtml(family.familyId)}"><div class="family-title">${escapeHtml(family.title || family.familyId)}</div><div>${escapeHtml(family.subtitle || '')}</div><div class="family-tags">${tags}</div></div>`;
  }).join('');
  els.list.querySelectorAll('[data-family-id]').forEach((item) => {
    item.addEventListener('click', () => {
      activeFamilyId = item.dataset.familyId;
      render();
    });
  });
}

function renderPreview() {
  const family = (catalog.families || []).find((item) => item.familyId === activeFamilyId) || (catalog.families || [])[0];
  if (!family) {
    els.preview.innerHTML = '<div class="ferro-card">暂无材料卡</div>';
    return;
  }
  const variants = (family.variants || []).filter((variant) => variant.visible !== false);
  const selected = family.defaultVariantId || (variants[0] && variants[0].variantId);
  const params = [
    family.temperature ? `<span class="pill">T = ${escapeHtml(family.temperature)} K</span>` : '',
    family.composition && family.composition.enabled ? `<span class="pill">${escapeHtml(family.composition.label || family.composition.key || 'composition')}</span>` : '',
    family.defaultVisualization ? `<span class="pill">${escapeHtml(family.defaultVisualization.mode || '')}${family.defaultVisualization.component ? ':' + escapeHtml(family.defaultVisualization.component) : ''}</span>` : '',
  ].filter(Boolean).join('');
  const variantHtml = variants.map((variant) => `<span class="variant${variant.variantId === selected ? ' is-active' : ''}">${escapeHtml(variant.buttonLabel || variant.title || variant.variantId)}</span>`).join('');
  const actions = Object.entries(catalog.defaultPresets || {}).map(([, preset]) => `<button type="button">${escapeHtml(preset.label || 'preset')}</button>`).join('');
  els.preview.innerHTML = `<article class="ferro-card"><h3>${escapeHtml(family.title || family.familyId)}</h3><div class="subtitle">${escapeHtml(family.subtitle || '')}</div><div>${escapeHtml(family.description || '')}</div><div class="param-row">${params}</div><div class="variant-row">${variantHtml}</div><div class="action-row">${actions}</div></article>`;
}

function renderValidation(result) {
  result = result || { errors: [], warnings: [] };
  els.validation.innerHTML = [
    result.errors && result.errors.length ? '<strong>错误</strong><ul>' + result.errors.map((item) => `<li>${escapeHtml(item)}</li>`).join('') + '</ul>' : '<div>无错误</div>',
    result.warnings && result.warnings.length ? '<strong>警告</strong><ul>' + result.warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join('') + '</ul>' : '<div>无警告</div>',
  ].join('');
}

function syncJson() {
  els.json.value = JSON.stringify(catalog, null, 2);
}

function exportJson() {
  const blob = new Blob([JSON.stringify(catalog, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'material-card-catalog.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function importJson(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    catalog = JSON.parse(String(reader.result || '{}'));
    activeFamilyId = catalog.families && catalog.families[0] && catalog.families[0].familyId;
    syncJson();
    render();
  };
  reader.readAsText(file);
}

function uniqueFamilyId(base) {
  let id = base;
  let i = 1;
  const existing = new Set((catalog.families || []).map((family) => family.familyId));
  while (existing.has(id)) id = base + '_' + i++;
  return id;
}

async function api(url, body) {
  const options = body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {};
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function setStatus(message, kind) {
  els.status.textContent = message;
  els.status.className = 'status ' + (kind || '');
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
