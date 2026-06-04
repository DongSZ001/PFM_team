/**
 * PFM2 chat response renderer.
 *
 * Browser global: window.PFMChatRenderer
 * Test/VM global: globalThis.PFMChatRenderer
 *
 * This module intentionally has no dependencies. It escapes raw text before
 * applying lightweight Markdown/data-panel rendering.
 */
(function initPFMChatRenderer(global) {
  'use strict';

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  
  function renderInlineMarkdown(value) {
    let html = escapeHtml(value);
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    return html;
  }
  
  function isMarkdownTableStart(lines, index) {
    if (index + 1 >= lines.length) return false;
    return /^\s*\|.+\|\s*$/.test(lines[index]) && /^\s*\|?\s*:?-{3,}:?/.test(lines[index + 1]);
  }
  
  function splitTableRow(line) {
    return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
  }
  
  function isNumericLike(value) {
    return /^[-+—–0-9.eE×x^\s/]+$/.test(value.trim());
  }
  
  function hasLongTableContent(header, rows) {
    if (header.length > 5) return true;
    return rows.some((row) => row.some((cell) => String(cell || '').length > 32));
  }
  
  function isCompactParameterTable(header, rows, isParameterTable, isApiTable) {
    const headerText = header.join(' ');
    const hasParameterAndUnit = /参数/i.test(headerText) && /单位/i.test(headerText);
    return isParameterTable && !isApiTable && hasParameterAndUnit && header.length <= 5 && rows.length <= 12 && !hasLongTableContent(header, rows);
  }
  
  function renderMarkdownTable(lines, startIndex) {
    const header = splitTableRow(lines[startIndex]);
    const rows = [];
    let i = startIndex + 2;
    while (i < lines.length && /^\s*\|.+\|\s*$/.test(lines[i])) {
      rows.push(splitTableRow(lines[i]));
      i += 1;
    }
    const headerText = header.join(' ');
    const isApiTable = /调用|期望|状态|API/i.test(headerText);
    const isParameterTable = !isApiTable && header.some((h) => /参数|值|SI 值|显示值|单位|备注/i.test(h));
    const compact = isCompactParameterTable(header, rows, isParameterTable, isApiTable);
    const tableClass = isParameterTable ? 'parameter-table' : isApiTable ? 'api-test-table' : 'markdown-table';
    const wrapperClass = compact ? 'table-scroll compact-table-wrapper' : 'table-scroll wide-table-wrapper';
    const fullTableClass = 'data-table ' + tableClass + (compact ? ' compact-table' : '');
    const th = header.map((cell) => '<th>' + renderInlineMarkdown(cell) + '</th>').join('');
    const trs = rows.map((row) => {
      const tds = header.map((_, idx) => {
        const raw = row[idx] || '—';
        const headerName = header[idx] || '';
        const numeric = isNumericLike(raw) || /值|SI 值|显示值/i.test(headerName);
        const codey = isParameterTable && /参数/i.test(headerName);
        const content = codey ? '<code class="parameter-code">' + escapeHtml(raw || '—') + '</code>' : renderInlineMarkdown(raw || '—');
        return '<td class="' + (numeric ? 'cell-numeric' : '') + '">' + content + '</td>';
      }).join('');
      return '<tr>' + tds + '</tr>';
    }).join('');
    return { html: '<div class="' + wrapperClass + '"><table class="' + fullTableClass + '"><thead><tr>' + th + '</tr></thead><tbody>' + trs + '</tbody></table></div>', nextIndex: i };
  }
  
  function looksLikeWarning(line) {
    return /missingParameters|缺失参数|warning|警告|错误|\berror\b/i.test(line);
  }
  
  function looksLikeUnitConversion(line) {
    return /^\s*[A-Za-z_][A-Za-z0-9_]*\s*=.+\s=\s*.+(J\/m|mJ\/m|pJ\/m|kA\/m|A\/m|Pa|MPa|GPa|m²|m2)/i.test(line);
  }
  
  function looksLikeMaterialNote(line) {
    return /^\s*(力学参数|弹性参数|磁致伸缩参数|mechanical parameters?)\s*[:：]/i.test(line) || /\bc11\s*=.+\bc12\s*=.+\bc44\s*=/i.test(line);
  }
  
  function renderMaterialNote(line) {
    const labelMatch = line.match(/^\s*([^:：]+[:：])\s*(.*)$/);
    const label = labelMatch ? labelMatch[1] : '参数说明：';
    const body = labelMatch ? labelMatch[2] : line;
    const html = renderInlineMarkdown(body).replace(/([A-Za-zλ][A-Za-z0-9_λ]*)=/g, '<code>$1</code>=');
    return '<div class="material-note-box"><span class="note-label">' + renderInlineMarkdown(label) + '</span><span class="note-content">' + html + '</span></div>';
  }
  
  function renderCodeBlock(language, code) {
    const lang = (language || 'text').trim() || 'text';
    const encoded = encodeURIComponent(code);
    return '<figure class="code-block"><figcaption><span>' + escapeHtml(lang) + '</span><button type="button" class="code-copy-btn" data-copy-code="' + encoded + '">复制</button></figcaption><pre><code class="language-' + escapeHtml(lang) + '">' + escapeHtml(code).replace(/\n$/, '') + '</code></pre></figure>';
  }
  
  function renderMarkdownText(text) {
    const fence = '`'.repeat(3);
    const sourceLines = String(text || '').replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let paragraph = [];
    let list = [];
    let quote = [];
    function flushParagraph() { if (paragraph.length) { out.push('<p>' + renderInlineMarkdown(paragraph.join(' ')) + '</p>'); paragraph = []; } }
    function flushList() { if (list.length) { out.push('<ul>' + list.map((item) => '<li>' + renderInlineMarkdown(item) + '</li>').join('') + '</ul>'); list = []; } }
    function flushQuote() { if (quote.length) { out.push('<blockquote>' + quote.map((item) => '<p>' + renderInlineMarkdown(item) + '</p>').join('') + '</blockquote>'); quote = []; } }
    function flushAll() { flushParagraph(); flushList(); flushQuote(); }
    for (let i = 0; i < sourceLines.length; i += 1) {
      const line = sourceLines[i];
      const trimmed = line.trim();
      if (!trimmed) { flushAll(); continue; }
      if (trimmed.startsWith(fence)) {
        flushAll();
        const lang = trimmed.slice(3).trim();
        const codeLines = [];
        i += 1;
        while (i < sourceLines.length && !sourceLines[i].trim().startsWith(fence)) { codeLines.push(sourceLines[i]); i += 1; }
        out.push(renderCodeBlock(lang, codeLines.join('\n')));
        continue;
      }
      if (isMarkdownTableStart(sourceLines, i)) {
        flushAll();
        const rendered = renderMarkdownTable(sourceLines, i);
        out.push(rendered.html);
        i = rendered.nextIndex - 1;
        continue;
      }
      const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
      if (heading) { flushAll(); const level = Math.min(heading[1].length + 1, 4); out.push('<h' + level + '>' + renderInlineMarkdown(heading[2]) + '</h' + level + '>'); continue; }
      if (/^>\s?/.test(trimmed)) { flushParagraph(); flushList(); quote.push(trimmed.replace(/^>\s?/, '')); continue; }
      if (/^[-*]\s+/.test(trimmed)) { flushParagraph(); flushQuote(); list.push(trimmed.replace(/^[-*]\s+/, '')); continue; }
      if (looksLikeWarning(trimmed)) { flushAll(); out.push('<aside class="warning-box"><strong>提示</strong><p>' + renderInlineMarkdown(trimmed) + '</p></aside>'); continue; }
      if (looksLikeUnitConversion(trimmed)) { flushAll(); out.push('<div class="unit-conversion-box"><strong>单位换算</strong><code>' + renderInlineMarkdown(trimmed) + '</code></div>'); continue; }
      if (looksLikeMaterialNote(trimmed)) { flushAll(); out.push(renderMaterialNote(trimmed)); continue; }
      paragraph.push(trimmed);
    }
    flushAll();
    return out.join('');
  }
  
  function sanitizeRelativeImageUrl(value) {
    const url = String(value || '');
    if (!url.startsWith('/api/efffield/assets/') && !url.startsWith('/api/ferro/assets/')) return '';
    return escapeHtml(url);
  }

  function renderEfffieldResultCard(result) {
    const payload = result || {};
    const summary = payload.summary || '有效场计算完成';
    const tensor = payload.effectiveTensor || null;
    const assets = Array.isArray(payload.assets) ? payload.assets : [];
    const imageHtml = assets.map((asset) => {
      const safeUrl = sanitizeRelativeImageUrl(asset && asset.url);
      if (!safeUrl) return '<figure class="efffield-image unavailable"><figcaption>' + renderInlineMarkdown((asset && asset.title) || '图片') + '</figcaption><div class="efffield-image-missing">图片链接不可用</div></figure>';
      const title = renderInlineMarkdown((asset && asset.title) || (asset && asset.name) || '结果图片');
      return '<a class="efffield-image" href="' + safeUrl + '" target="_blank" rel="noopener"><img src="' + safeUrl + '" alt="' + escapeHtml((asset && asset.title) || '有效场结果图片') + '"><span>' + title + '</span></a>';
    }).join('');
    const tensorHtml = tensor && tensor.text
      ? '<figure class="efffield-tensor"><figcaption>' + escapeHtml(tensor.name || 'effective tensor') + '</figcaption><pre><code>' + escapeHtml(tensor.text) + '</code></pre></figure>'
      : '';
    return '<section class="efffield-result-card"><div class="efffield-result-header"><strong>有效场计算结果</strong><span>' + renderInlineMarkdown(summary) + '</span></div>' + tensorHtml + '<div class="efffield-image-grid">' + imageHtml + '</div></section>';
  }


  function renderEfffieldModeChoiceCard(payload) {
    const choice = payload && payload.choice ? payload.choice : payload || {};
    const system = choice.system || 'dielectric';
    const title = choice.title || '有效场计算';
    return '<section class="chat-inline-card efffield-mode-choice">'
      + '<header class="efffield-choice-header"><div><strong>选择参数输入方式</strong><span>' + renderInlineMarkdown(title) + '</span></div></header>'
      + '<div class="efffield-choice-grid">'
      + '<button type="button" class="efffield-choice-option" data-efffield-action="choose_dialogue_mode" data-efffield-system="' + escapeHtml(system) + '"><b>对话问答</b><span>由 AI 逐步追问维度、尺寸、结构、相参数和外场。</span></button>'
      + '<button type="button" class="efffield-choice-option" data-efffield-action="choose_parameter_panel" data-efffield-system="' + escapeHtml(system) + '"><b>面板输入</b><span>打开 parameter.in 编辑器，直接自定义完整输入文件。</span></button>'
      + '</div></section>';
  }

  function renderEfffieldParameterPanelCard(panel) {
    const payload = panel && panel.panel ? panel.panel : panel || {};
    const grid = payload.grid || {};
    const structure = payload.structure || {};
    const solver = payload.solver || {};
    const system = payload.system || 'dielectric';
    const parameterText = payload.parameterText || '';
    const parsed = summarizeEfffieldParameterText(parameterText, payload);
    const statusClass = parsed.errors.length ? 'ferro-status-error' : 'ferro-status-ready';
    const statusText = parsed.errors.length ? '需检查' : '可运行';
    const gridText = parsed.SYSDIM || [grid.nx, grid.ny, grid.nz].filter((item) => item !== undefined && item !== null).join('×') || '未设置';
    const structureText = (structure.type || '默认') + (structure.radius !== undefined ? ' / r=' + structure.radius : '');
    const systemText = parsed.CHOICESYS ? parsed.CHOICESYS + ' / ' + system : system;
    const runText = 'tol=' + (solver.tol || '1e-3') + ' · maxiter=' + (solver.maxiter || 300);
    const outdistText = parsed.OUTDIST || '默认';
    const fieldText = parsed.ELECFIELD || parsed.MAGFIELD || parsed.TEMGRAD || parsed.CONCGRAD || '未设置';
    const phaseText = parsed.phaseSummary || '见 parameter.in';
    const summaryCards = [
      ['物理系统', systemText, parsed.systemLabel || 'parameter.in 模板'],
      ['计算网格', gridText + ' · ' + structureText, '结构由当前草稿生成'],
      ['外场 / 输出', fieldText + ' · OUTDIST=' + outdistText, '来自 parameter.in'],
    ].map((item) => '<div><b>' + renderInlineMarkdown(item[0]) + '</b><span>' + renderInlineMarkdown(String(item[1])) + '</span><small>' + renderInlineMarkdown(String(item[2])) + '</small></div>').join('');
    const fieldKey = parsed.fieldKey || efffieldFieldKeyForSystem(system);
    const matrixEditor = renderEfffieldMatrixEditor(parsed.materialBlocks || []);
    const rows = [
      ['REALDIM', renderEfffieldPanelInput('REALDIM', parsed.REALDIM || ''), '面板输入', Boolean(parsed.REALDIM)],
      ['SYSDIM', renderEfffieldPanelInput('SYSDIM', parsed.SYSDIM || gridText), '面板输入', Boolean(parsed.SYSDIM || gridText)],
      ['CHOICESYS', renderEfffieldPanelInput('CHOICESYS', parsed.CHOICESYS || '', 'inputmode="numeric"'), '面板输入', Boolean(parsed.CHOICESYS)],
      ['OUTDIST', renderEfffieldPanelInput('OUTDIST', outdistText === '默认' ? 'true' : outdistText), '面板输入', true],
      [fieldKey || '外场', renderEfffieldPanelInput(fieldKey || 'ELECFIELD', fieldText === '未设置' ? '' : fieldText), '面板输入', fieldText !== '未设置'],
      ['相1材料参数', renderEfffieldPanelInput('PHASE1', parsed.phase1Value || '', 'data-efffield-line-key="' + escapeHtml(parsed.phase1Key || efffieldMaterialKeyForSystem(system)) + '"'), '面板输入', Boolean(parsed.phase1)],
      ['相2材料参数', renderEfffieldPanelInput('PHASE2', parsed.phase2Value || '', 'data-efffield-line-key="' + escapeHtml(parsed.phase2Key || efffieldMaterialKeyForSystem(system)) + '"'), '面板输入', Boolean(parsed.phase2)],
      ['求解器', '<div class="efffield-solver-inputs"><label>tol ' + renderEfffieldPanelInput('SOLVER_TOL', solver.tol || '1e-3', 'data-efffield-solver-key="tol"') + '</label><label>maxiter ' + renderEfffieldPanelInput('SOLVER_MAXITER', solver.maxiter || 300, 'data-efffield-solver-key="maxiter" inputmode="numeric"') + '</label></div>', '面板设置', true],
    ];
    const table = rows.map((row) => '<tr><th>' + renderInlineMarkdown(row[0]) + '</th><td>' + row[1] + '</td><td>' + renderInlineMarkdown(row[2]) + '</td><td>' + statusLabel(row[3]) + '</td></tr>').join('');
    return '<section class="chat-inline-card efffield-parameter-panel" data-efffield-parameter-panel data-efffield-panel-system="' + escapeHtml(system) + '" data-efffield-panel-grid="' + escapeHtml(JSON.stringify(grid)) + '" data-efffield-panel-structure="' + escapeHtml(JSON.stringify(structure)) + '" data-efffield-panel-solver="' + escapeHtml(JSON.stringify(solver)) + '">'
      + '<div class="efffield-editor-shell efffield-draft-card">'
      + '<header class="efffield-editor-header"><div><strong>有效场 parameter.in 草稿</strong><span>' + renderInlineMarkdown(parsed.systemLabel || system) + '</span></div><span class="ferro-status-chip ' + statusClass + '">' + statusText + '</span></header>'
      + '<div class="efffield-draft-summary-grid">' + summaryCards + '</div>'
      + '<div class="efffield-run-preview"><b>运行</b><span>' + renderInlineMarkdown(runText + ' · ' + phaseText) + '</span></div>'
      + '<div class="table-scroll"><table class="efffield-kv-table"><thead><tr><th>模块</th><th>当前设置</th><th>来源</th><th>状态</th></tr></thead><tbody>' + table + '</tbody></table></div>'
      + matrixEditor
      + '<div class="efffield-editor-toolbar"><span>parameter.in 高级编辑</span><div><button type="button" class="ferro-btn ferro-btn-secondary" data-efffield-action="validate_parameter_panel">校验参数</button><button type="button" class="ferro-btn ferro-btn-secondary" data-efffield-action="refresh_parameter_template">重新生成模板</button><button type="button" class="ferro-btn ferro-btn-primary" data-efffield-action="run_parameter_panel">开始计算</button></div></div>'
      + '<textarea class="efffield-parameter-textarea" data-efffield-parameter-text spellcheck="false">' + escapeHtml(parameterText) + '</textarea>'
      + '</div></section>';
  }

  function renderEfffieldMatrixEditor(blocks) {
    const editableBlocks = (Array.isArray(blocks) ? blocks : []).filter((block) => block && block.phaseId && block.key);
    if (!editableBlocks.length) return '';
    const editors = editableBlocks.map((block) => {
      const phaseLabel = block.phaseId === '?' ? '相?' : '相' + block.phaseId;
      const title = phaseLabel + ' ' + block.key;
      return '<label class="efffield-matrix-block">'
        + '<span>' + escapeHtml(title) + '</span>'
        + '<textarea class="efffield-matrix-textarea" data-efffield-param-key="PHASE_BLOCK" data-efffield-phase-id="' + escapeHtml(block.phaseId) + '" data-efffield-line-key="' + escapeHtml(block.key) + '" spellcheck="false">' + escapeHtml(block.value || '') + '</textarea>'
        + '</label>';
    }).join('');
    return '<details class="efffield-matrix-editor" open>'
      + '<summary><span>材料矩阵块</span><small>直接编辑后会同步到下方 parameter.in</small></summary>'
      + '<div class="efffield-matrix-grid">' + editors + '</div>'
      + '</details>';
  }

  function renderEfffieldPanelInput(key, value, attrs) {
    const attrText = attrs ? ' ' + attrs : '';
    return '<input class="efffield-panel-input" type="text" data-efffield-param-key="' + escapeHtml(key) + '" value="' + escapeHtml(value === undefined || value === null ? '' : String(value)) + '"' + attrText + '>';
  }

  function efffieldFieldKeyForSystem(system) {
    const keys = { dielectric: 'ELECFIELD', electrical_conduction: 'ELECFIELD', magnetic: 'MAGFIELD', thermal: 'TEMGRAD', diffusion: 'CONCGRAD' };
    return keys[system] || 'ELECFIELD';
  }

  function efffieldMaterialKeyForSystem(system) {
    const keys = { dielectric: 'PERMITTIVITY', electrical_conduction: 'ELECCOND', magnetic: 'PERMEABILITY', thermal: 'THERMCOND', diffusion: 'DIFFUSIVITY', elastic: 'STIFFNESS', piezoelectric: 'STIFFNESS', piezomagnetic: 'STIFFNESS', magnetoelectric: 'STIFFNESS' };
    return keys[system] || 'PERMITTIVITY';
  }

  function summarizeEfffieldParameterText(text, payload) {
    const result = { errors: [], systemLabel: systemLabelForEfffield(payload && payload.system) };
    const materialBlocks = collectEfffieldMaterialBlocks(text);
    result.materialBlocks = materialBlocks;
    let phaseId = null;
    for (const raw of String(text || '').split('\n')) {
      const cleaned = stripEfffieldComment(raw).trim();
      if (!cleaned) continue;
      const tokens = cleaned.split(/\s+/);
      const key = tokens[0].toUpperCase();
      const value = tokens.slice(1).join(' ');
      if (['REALDIM', 'SYSDIM', 'CHOICESYS', 'OUTDIST'].includes(key)) result[key] = value;
      if (['ELECFIELD', 'MAGFIELD', 'TEMGRAD', 'CONCGRAD'].includes(key)) {
        result.fieldKey = key;
        result[key] = value;
      }
      if (key === 'PHASEID') phaseId = tokens[1] || null;
      if (['PERMITTIVITY', 'PERMEABILITY', 'DIFFUSIVITY', 'THERMCOND', 'ELECCOND', 'STIFFNESS', 'PIEZOELEC', 'PIEZOMAG', 'MAGELEC'].includes(key)) {
        const block = materialBlocks.find((item) => item.phaseId === phaseId && item.key === key);
        const blockValue = block && block.value ? block.value : value;
        const label = key + (blockValue ? ' ' + blockValue : '');
        if (phaseId === '1' && !result.phase1) {
          result.phase1 = label;
          result.phase1Key = key;
          result.phase1Value = blockValue;
        }
        if (phaseId === '2' && !result.phase2) {
          result.phase2 = label;
          result.phase2Key = key;
          result.phase2Value = blockValue;
        }
      }
    }
    if (result.CHOICESYS) result.systemLabel = choiceSysLabel(result.CHOICESYS) || result.systemLabel;
    result.phaseSummary = result.phase1 && result.phase2 ? '两相参数已设置' : '';
    if (!result.SYSDIM) result.errors.push('缺少 SYSDIM');
    if (!result.CHOICESYS) result.errors.push('缺少 CHOICESYS');
    return result;
  }

  function collectEfffieldMaterialBlocks(text) {
    const materialKeys = ['PERMITTIVITY', 'PERMEABILITY', 'DIFFUSIVITY', 'THERMCOND', 'ELECCOND', 'STIFFNESS', 'PIEZOELEC', 'PIEZOMAG', 'MAGELEC'];
    const blocks = [];
    let phaseId = null;
    let current = null;
    const closeCurrent = () => {
      if (!current) return;
      current.value = current.lines.join('\n').trim();
      delete current.lines;
      blocks.push(current);
      current = null;
    };
    for (const raw of String(text || '').split('\n')) {
      const cleaned = stripEfffieldComment(raw).trim();
      if (!cleaned) continue;
      const tokens = cleaned.split(/\s+/);
      const key = tokens[0].toUpperCase();
      const value = tokens.slice(1).join(' ');
      if (key === 'PHASEID') {
        closeCurrent();
        phaseId = tokens[1] || null;
        continue;
      }
      if (materialKeys.includes(key)) {
        closeCurrent();
        current = { phaseId: phaseId || '?', key, lines: value ? [value] : [] };
        continue;
      }
      if (current && /^[-+.\d]/.test(cleaned)) {
        current.lines.push(cleaned);
        continue;
      }
      closeCurrent();
    }
    closeCurrent();
    return blocks;
  }

  function stripEfffieldComment(line) {
    const hash = String(line || '').indexOf('#');
    const bang = String(line || '').indexOf('!');
    const indexes = [hash, bang].filter((index) => index >= 0);
    return indexes.length ? String(line).slice(0, Math.min.apply(null, indexes)) : String(line || '');
  }

  function choiceSysLabel(value) {
    const labels = {
      1: '弹性有效场', 2: '介电有效场', 3: '压电有效场', 4: '磁导有效场', 5: '压磁有效场', 6: '磁电耦合有效场', 7: '扩散有效场', 8: '热传导有效场', 9: '电导有效场',
    };
    return labels[String(value || '').trim()] || null;
  }

  function systemLabelForEfffield(system) {
    const labels = {
      dielectric: '介电有效场', magnetic: '磁导有效场', thermal: '热传导有效场', diffusion: '扩散有效场', electrical_conduction: '电导有效场', elastic: '弹性有效场', piezoelectric: '压电有效场', piezomagnetic: '压磁有效场', magnetoelectric: '磁电耦合有效场',
    };
    return labels[system] || '有效场计算';
  }

  function normalizeMaterialPresets(material) {
    const presets = Array.isArray(material && material.presets) ? material.presets : [];
    if (presets.length) return presets;
    const component = ((material && material.family) || '').toLowerCase() === 'bfo' ? 'px' : 'pz';
    return [
      { id: 'quick_2d', label: '快速预览', description: '64×1×64，10000步，每2000步输出', grid: { nx: 64, ny: 1, nz: 64 }, run: { steps: 10000, outputInterval: 2000 }, visualization: { component } },
      { id: 'standard_2d', label: '标准计算', description: '128×1×128，20000步，每5000步输出', grid: { nx: 128, ny: 1, nz: 128 }, run: { steps: 20000, outputInterval: 5000 }, visualization: { component } },
      { id: 'custom', label: '自定义', description: '手动设置网格、步数、外场和高级参数', custom: true },
    ];
  }

  function renderMaterialPresetGrid(materials) {
    const list = Array.isArray(materials) ? materials : [];
    const visible = list.slice(0, 8);
    const cards = visible.map((material) => {
      const id = material.id || material.modelKey || '';
      const family = material.family || material.displayName || material.materialKey || '材料';
      const title = material.title || material.displayName || family;
      const subtitle = material.subtitle || material.modelName || material.modelKey || '默认模型';
      const displayParams = Array.isArray(material.displayParams) && material.displayParams.length
        ? material.displayParams
        : fallbackDisplayParams(material);
      const paramHtml = displayParams.map((item) => '<span class="ferro-material-param">' + renderInlineMarkdown(item.label || '') + ' = ' + renderInlineMarkdown(String(item.value ?? '默认')) + '</span>').join('');
      const badges = Array.isArray(material.tags) && material.tags.length ? material.tags : Array.isArray(material.badges) && material.badges.length ? material.badges : [family, '2D'];
      const command = buildFerroMaterialCommand(material);
      const presetButtons = normalizeMaterialPresets(material).map((preset) => '<button type="button" class="ferro-btn ferro-btn-secondary" data-ferro-action="apply_material_preset" data-material-id="' + escapeHtml(id) + '" data-preset-id="' + escapeHtml(preset.id) + '" data-ferro-material-command="' + escapeHtml(command) + '">' + renderInlineMarkdown(preset.label || preset.id) + '</button>').join('');
      const badgeHtml = badges.map((badge) => '<span class="ferro-badge">' + renderInlineMarkdown(badge) + '</span>').join('');
      return '<article class="chat-inline-card ferro-material-card"><div class="ferro-material-card__title">' + renderInlineMarkdown(title) + '</div><div class="ferro-material-card__subtitle">' + renderInlineMarkdown(subtitle) + '</div><div class="ferro-material-card__params">' + paramHtml + '</div><div class="ferro-badge-row">' + badgeHtml + '</div><p>' + renderInlineMarkdown(material.description || subtitle) + '</p><div class="ferro-actions">' + presetButtons + '</div></article>';
    }).join('');
    const more = list.length > visible.length ? '<details class="ferro-more-materials"><summary>查看更多材料（' + escapeHtml(list.length - visible.length) + '）</summary>' + renderMaterialPresetGrid(list.slice(8)) + '</details>' : '';
    return '<section class="ferro-material-card-group" aria-label="铁电材料预设">' + cards + '</section>' + more;
  }

  function renderMaterialFamilyCards(cards) {
    const list = Array.isArray(cards) ? cards : [];
    if (!list.length) return '';
    return '<section class="ferro-material-card-group" aria-label="铁电材料分组预设">' + list.map(renderMaterialFamilyCard).join('') + '</section>';
  }

  function renderMaterialFamilyCard(card) {
    const variants = Array.isArray(card.variants) ? card.variants : [];
    const selectedId = card.selectedVariantId || card.defaultVariantId || (variants[0] && variants[0].variantId) || '';
    const selected = variants.find((item) => item.variantId === selectedId) || variants[0] || {};
    const badges = (card.tags || []).map((badge) => '<span class="ferro-badge">' + renderInlineMarkdown(badge) + '</span>').join('');
    const params = [
      card.temperature !== undefined ? '<span class="ferro-material-param">T = ' + escapeHtml(card.temperature) + ' K</span>' : '',
      card.composition && card.composition.enabled ? '<span class="ferro-material-param">' + renderInlineMarkdown(card.composition.label || '组分') + '</span>' : '',
    ].filter(Boolean).join('');
    const variantButtons = variants.map((variant) => {
      const active = variant.variantId === selected.variantId;
      return '<button type="button" class="ferro-btn ferro-btn-secondary ferro-variant-btn' + (active ? ' is-active' : '') + '" data-ferro-action="select_material_variant" data-material-id="' + escapeHtml(variant.materialModelId || '') + '" data-variant-id="' + escapeHtml(variant.variantId || '') + '" data-variant-title="' + escapeHtml(variant.title || variant.buttonLabel || '') + '" data-variant-detail="' + escapeHtml(variant.shortDescription || '') + '">' + renderInlineMarkdown(variant.buttonLabel || variant.title || variant.variantId) + '</button>';
    }).join('');
    const actions = (card.actions || []).map((action) => '<button type="button" class="ferro-btn ferro-btn-secondary" data-ferro-action="apply_material_preset" data-material-group-id="' + escapeHtml(card.familyId || '') + '" data-preset-id="' + escapeHtml(action.presetId || '') + '">' + renderInlineMarkdown(action.label || action.presetId) + '</button>').join('');
    const selectedDetail = '<div class="ferro-selected-variant" data-selected-variant-output><strong>' + renderInlineMarkdown(selected.title || selected.buttonLabel || '') + '</strong><span>' + renderInlineMarkdown(selected.shortDescription || selected.orderLabel || selected.compositionDisplay || '') + '</span></div>';
    return '<article class="chat-inline-card ferro-material-card ferro-material-family-card" data-ferro-material-family-card data-material-group-id="' + escapeHtml(card.familyId || '') + '"><div class="ferro-material-card__title">' + renderInlineMarkdown(card.title || '材料') + '</div><div class="ferro-material-card__subtitle">' + renderInlineMarkdown(card.subtitle || '') + '</div><div class="ferro-material-card__params">' + params + '</div><div class="ferro-badge-row">' + badges + '</div><p>' + renderInlineMarkdown(card.description || '') + '</p><div class="ferro-variant-row">' + variantButtons + '</div>' + selectedDetail + '<div class="ferro-actions">' + actions + '</div></article>';
  }

  function fallbackDisplayParams(material) {
    const params = material.defaultParams || { xf: material.defaultXf, temperature: material.defaultTem };
    const composition = material.composition || {};
    const out = [];
    if (composition.enabled || material.showCompositionInCard) out.push({ label: composition.label || composition.key || 'xf', value: composition.value ?? params.xf });
    out.push({ label: 'T', value: (params.temperature ?? '默认') + (params.temperature !== undefined ? ' K' : '') });
    return out;
  }


  function runValue(draft, key) {
    const run = draft && draft.run || {};
    if (key === 'steps') return run.steps !== undefined ? run.steps : run.kstep;
    return run.outputInterval !== undefined ? run.outputInterval : run.kprnt;
  }

  function formatGridValue(grid) {
    if (!grid) return '未设置';
    return [grid.nx, grid.ny, grid.nz].map((value) => value === undefined || value === null ? '?' : value).join('×');
  }

  function formatComponent(value) {
    const text = String(value || 'pz').toLowerCase();
    if (text === 'px' || text === 'py' || text === 'pz') return text.charAt(0).toUpperCase() + text.slice(1);
    return text || '默认';
  }

  function sourceLabel(value) {
    const map = {
      user_selection: '用户选择', user_message: '用户输入', user_patch: '用户修改', material_default: '模型默认',
      quick_preset: '快速预设', standard_preset: '标准预设', global_default: '默认', client_preferences: '历史偏好',
    };
    return map[value] || value || '默认';
  }

  function statusLabel(ok) {
    return ok ? '✅' : '⚠️';
  }

  function expectedOutputs(steps, interval) {
    const s = Number(steps);
    const i = Number(interval);
    if (!Number.isFinite(s) || !Number.isFinite(i) || i <= 0) return '待定';
    const values = [];
    for (let kt = i; kt <= s && values.length < 6; kt += i) values.push(kt);
    if (values.length && values[values.length - 1] < s && s / i > 6) values.push('...');
    return values.join(', ') || '待定';
  }

  function renderFerroDraftCard(draft, ui, validation) {
    const payload = draft || {};
    const state = validation || { ready: payload.status === 'ready', missingFields: [], warnings: [], errors: [] };
    const material = payload.material || {};
    const grid = payload.grid || null;
    const steps = runValue(payload, 'steps');
    const interval = runValue(payload, 'outputInterval');
    const visualization = payload.visualization || {};
    const modeText = formatVisualization(visualization);
    const hasErrors = Array.isArray(state.errors) && state.errors.length > 0;
    const ready = Boolean(state.ready) && !hasErrors;
    const statusClass = hasErrors ? 'ferro-status-error' : ready ? 'ferro-status-ready' : 'ferro-status-warning';
    const statusText = hasErrors ? '❌ 参数错误' : ready ? '✅ 可运行' : '⚠️ 需要补充';
    const sources = payload.sources || {};
    const primary = ui && ui.primaryAction ? ui.primaryAction : { label: '开始计算', enabled: ready, action: 'start_job' };
    const showComposition = Boolean(material.showCompositionInDraft || (material.composition && material.composition.enabled));
    const rows = [
      ['材料', material.label || material.model || '未设置', sourceLabel(sources.material), statusLabel(Boolean(material.id || material.modelKey))],
      ['温度', material.temperature !== undefined ? 'T = ' + material.temperature + ' K' : material.tem !== undefined ? 'T = ' + material.tem + ' K' : '未设置', sourceLabel(sources.temperature), statusLabel(material.temperature !== undefined || material.tem !== undefined)],
      ['网格', formatGridValue(grid), sourceLabel(sources.grid), statusLabel(Boolean(grid))],
      ['总步数', steps ?? '未设置', sourceLabel(sources.run), statusLabel(steps !== undefined)],
      ['输出间隔', interval ?? '未设置', sourceLabel(sources.run), statusLabel(interval !== undefined)],
      ['可视化', modeText, sourceLabel(sources.visualization), statusLabel(Boolean(visualization.mode || visualization.component))],
      ['外场', payload.field && payload.field.enabled ? '开启' : '关闭', sourceLabel(sources.field), statusLabel(true)],
      ['初始条件', payload.initial && payload.initial.type || 'random_small_perturbation', sourceLabel(sources.initial), statusLabel(true)],
    ];
    if (showComposition) rows.splice(1, 0, ['组分', (material.composition && material.composition.label || 'xf') + ' = ' + ((material.composition && material.composition.value) ?? material.xf), sourceLabel(sources.xf), statusLabel(true)]);
    const table = rows.map((row) => '<tr><th>' + renderInlineMarkdown(row[0]) + '</th><td>' + renderInlineMarkdown(String(row[1])) + '</td><td>' + renderInlineMarkdown(row[2]) + '</td><td>' + row[3] + '</td></tr>').join('');
    const alerts = [].concat(state.errors || [], state.warnings || [], (state.missingFields || []).map((field) => '缺少：' + field)).map((item) => '<p>' + renderInlineMarkdown(item) + '</p>').join('');
    const materialId = material.id || material.modelKey || material.model || '';
    const componentsText = Array.isArray(visualization.inplaneComponents) ? visualization.inplaneComponents.map(formatComponent).join('–') : '自动';
    const compositionSummary = showComposition ? '<small>' + renderInlineMarkdown((material.composition && material.composition.label || 'xf') + '=' + ((material.composition && material.composition.value) ?? material.xf)) + ' · T=' + escapeHtml(material.temperature ?? material.tem ?? '未设置') + 'K</small>' : '<small>T=' + escapeHtml(material.temperature ?? material.tem ?? '未设置') + 'K</small>';
    const actions = '<button type="button" class="ferro-btn ferro-btn-primary" data-ferro-action="start_job"' + (primary.enabled === false ? ' disabled aria-disabled="true"' : '') + '>' + renderInlineMarkdown(primary.label || '开始计算') + '</button>'
      + '<button type="button" class="ferro-btn ferro-btn-secondary" data-ferro-action="edit_grid">修改网格</button>'
      + '<button type="button" class="ferro-btn ferro-btn-secondary" data-ferro-action="edit_run">修改步数</button>'
      + ['px', 'py', 'pz'].map((part) => '<button type="button" class="ferro-btn ferro-btn-secondary" data-ferro-action="patch_draft" data-patch-path="visualization.component" data-patch-value="' + part + '">' + formatComponent(part) + '</button>').join('')
      + '<button type="button" class="ferro-btn ferro-btn-secondary" data-ferro-action="patch_draft" data-patch-path="visualization.mode" data-patch-value="inplane_angle">面内角度</button>'
      + '<button type="button" class="ferro-btn ferro-btn-secondary" data-ferro-action="patch_draft" data-patch-path="visualization.mode" data-patch-value="variant_111">R相变体</button>'
      + '<button type="button" class="ferro-btn ferro-btn-secondary" data-ferro-action="apply_material_preset" data-material-id="' + escapeHtml(materialId) + '" data-preset-id="quick_2d">快速预览</button>'
      + '<button type="button" class="ferro-btn ferro-btn-secondary" data-ferro-action="apply_material_preset" data-material-id="' + escapeHtml(materialId) + '" data-preset-id="standard_2d">标准计算</button>'
      + '<button type="button" class="ferro-btn ferro-btn-secondary" data-ferro-action="reset_draft">重置</button>';
    return '<section class="chat-inline-card ferro-draft-card ferro-draft-card--compact"><header class="ferro-draft-header"><div><strong>铁电相场计算草稿</strong><span>' + renderInlineMarkdown(material.label || material.model || '请选择材料模型') + '</span></div><span class="ferro-status-chip ' + statusClass + '">' + statusText + '</span></header>'
      + '<div class="ferro-draft-summary-grid"><div><b>材料</b><span>' + renderInlineMarkdown(material.family || material.materialKey || '未设置') + '</span>' + compositionSummary + '</div><div><b>计算网格</b><span>' + renderInlineMarkdown((grid && grid.ny === 1 ? '2D slice / ' : grid ? '3D volume / ' : '') + formatGridValue(grid)) + '</span><small>预设：' + renderInlineMarkdown(payload.presetId || '自定义') + '</small></div><div><b>可视化</b><span>' + renderInlineMarkdown(modeText) + '</span><small>面内角度：' + renderInlineMarkdown(componentsText) + '</small></div></div>'
      + '<div class="ferro-output-preview"><b>运行</b><span>' + renderInlineMarkdown(String(steps ?? '未设置')) + ' 步 · 每 ' + escapeHtml(interval ?? '未设置') + ' 步输出 · ' + renderInlineMarkdown(expectedOutputs(steps, interval)) + '</span></div>'
      + (alerts ? '<aside class="ferro-validation-alerts">' + alerts + '</aside>' : '')
      + '<div class="table-scroll"><table class="ferro-kv-table"><thead><tr><th>模块</th><th>当前设置</th><th>来源</th><th>状态</th></tr></thead><tbody>' + table + '</tbody></table></div>'
      + '<details class="ferro-advanced-panel"><summary>高级参数</summary><dl><dt>内部兼容字段</dt><dd>' + (material.xf !== undefined ? 'xf=' + escapeHtml(material.xf) + '（内部参数，不作为材料组分显示）' : '无') + '</dd><dt>Landau coefficients</dt><dd>当前材料模型默认</dd><dt>Gradient energy</dt><dd>模型默认</dd><dt>Elastic constants</dt><dd>模型默认</dd><dt>External field</dt><dd>' + renderInlineMarkdown(payload.field && payload.field.enabled ? '开启' : '关闭') + '</dd><dt>Initial condition</dt><dd>' + renderInlineMarkdown(payload.initial && payload.initial.type || 'random_small_perturbation') + '</dd></dl></details>'
      + '<div class="ferro-actions">' + actions + '</div></section>';
  }

  function formatVisualization(visualization) {
    const normalized = normalizeFerroVisualizationView(visualization || {});
    const mode = normalized.mode;
    if (mode === 'inplane_angle') return '面内角度';
    if (mode === 'variant_111') return 'R相变体';
    return formatComponent(visualization && visualization.component);
  }

  function normalizeFerroMode(mode) {
    const value = String(mode || 'component').toLowerCase();
    if (value === 'angle_arrow' || value === 'inplane_angle_arrow') return 'inplane_angle';
    if (value === 'variant_111_arrow') return 'variant_111';
    if (['component', 'inplane_angle', 'variant_111'].includes(value)) return value;
    return 'component';
  }

  function normalizeFerroVisualizationRecord(viz) {
    const next = { ...(viz || {}) };
    if (next.mode === 'inplane_angle_arrow' || next.mode === 'angle_arrow') {
      next.mode = 'inplane_angle';
      next.overlay = { ...(next.overlay || {}), arrows: true };
    }
    if (next.mode === 'variant_111_arrow') {
      next.mode = 'variant_111';
      next.overlay = { ...(next.overlay || {}), arrows: true };
    }
    if (!next.overlay) next.overlay = { arrows: true };
    if (next.overlay.arrows === undefined) next.overlay.arrows = true;
    return next;
  }

  function normalizeFerroVisualizationView(visualization) {
    const normalized = normalizeFerroVisualizationRecord(visualization || {});
    if (normalized.mode === 'component') {
      return { mode: 'component', component: String(normalized.component || 'pz').toLowerCase(), overlay: normalized.overlay || { arrows: true } };
    }
    return { mode: normalized.mode || 'component', component: null, overlay: normalized.overlay || { arrows: true } };
  }


  function renderFerroDiffCard(diff, validation) {
    const rows = (Array.isArray(diff) ? diff : []).map((item) => '<tr><th>' + renderInlineMarkdown(item.label || item.path || '参数') + '</th><td>' + renderInlineMarkdown(formatDiffValue(item.from)) + '</td><td>' + renderInlineMarkdown(formatDiffValue(item.to)) + '</td></tr>').join('');
    const state = validation || {};
    const status = state.errors && state.errors.length ? '❌ 参数错误' : state.ready ? '✅ 当前配置可运行。' : '⚠️ 需要补充参数。';
    return '<section class="ferro-diff-card"><strong>已更新计算草稿：</strong><div class="table-scroll"><table class="ferro-kv-table"><thead><tr><th>参数</th><th>原值</th><th>新值</th></tr></thead><tbody>' + (rows || '<tr><td colspan="3">暂无可显示的变化</td></tr>') + '</tbody></table></div><p>' + renderInlineMarkdown(status) + '</p></section>';
  }

  function formatDiffValue(value) {
    if (value && typeof value === 'object' && value.nx !== undefined) return formatGridValue(value);
    if (typeof value === 'string' && /^(px|py|pz)$/i.test(value)) return formatComponent(value);
    return value === undefined || value === null ? '未设置' : String(value);
  }

  function buildFerroMaterialCommand(model) {
    const payload = model || {};
    const displayName = payload.displayName || payload.materialKey || '材料';
    const modelName = payload.modelName || payload.modelKey || '';
    const parts = ['材料换成 ' + displayName + (modelName ? ' ' + modelName : '')];
    if (payload.defaultXf !== undefined && payload.defaultXf !== null) parts.push('xf=' + payload.defaultXf);
    if (payload.defaultTem !== undefined && payload.defaultTem !== null) parts.push('温度 ' + payload.defaultTem + 'K');
    return parts.join('，');
  }

  function renderMaterialRecommendationMessage(result) {
    const cards = Array.isArray(result && result.cards) ? result.cards : [];
    const sourceModels = Array.isArray(result && result.models) ? result.models : Array.isArray(result && result.materials) ? result.materials : [];
    const filter = result && result.filter && result.filter.query ? String(result.filter.query) : '';
    const models = filter ? sourceModels.filter((model) => materialMatchesFilter(model, filter)) : sourceModels;
    const prompt = result && (result.message || result.reply) || '我理解你想模拟铁电畴，请先选择材料，我会帮你生成可运行草稿。';
    const filterText = filter ? '<span>已按 ' + renderInlineMarkdown(filter) + ' 筛选材料。</span>' : '<span>请选择一个材料模型；选择后会自动生成可运行的计算草稿。</span>';
    const body = cards.length ? renderMaterialFamilyCards(cards) : renderMaterialPresetGrid(models);
    return '<section class="ferro-material-recommendations"><div class="ferro-material-recommendations-header"><strong>' + renderInlineMarkdown(prompt) + '</strong>' + filterText + '</div>' + body + '</section>';
  }

  function renderFerroMaterialRecommendations(result) {
    return renderMaterialRecommendationMessage(result);
  }

  function materialMatchesFilter(model, filter) {
    const tokens = String(filter || '').toLowerCase().match(/[a-z0-9]+|[\u4e00-\u9fff]+/g) || [];
    if (!tokens.length) return true;
    const normalized = tokens.flatMap((token) => {
      if (token === '铁酸铋') return ['bfo', 'bifeo3'];
      if (token === '钛酸钡') return ['bto', 'batio3'];
      if (token === '锆钛酸铅') return ['pzt'];
      return [token];
    }).filter((token) => !/^(模拟|计算|铁电|畴|材料|模型)$/.test(token));
    if (!normalized.length) return true;
    const haystack = [
      model.id, model.model, model.modelKey, model.materialKey, model.displayName, model.modelName,
      model.family, model.title, model.subtitle, model.formula, ...(model.tags || []), ...(model.badges || []),
    ].filter(Boolean).join(' ').toLowerCase();
    return normalized.length === 1 ? haystack.includes(normalized[0]) : normalized.every((token) => haystack.includes(token));
  }
  function renderFerroResultCard(result) {
    const payload = result || {};
    const summary = payload.message || payload.summary || '计算完成。下面是当前结果。你可以继续让我切换显示方式、调整网格或步数，然后基于当前草稿重新计算。';
    const structured = payload.result || null;
    const assets = Array.isArray(payload.assets) ? payload.assets : [];
    const draft = payload.draftSnapshot || payload.request || {};
    const meta = [];
    if (payload.jobId || payload.id) meta.push('job id: ' + (payload.jobId || payload.id));
    if (payload.parentJobId) meta.push('parent: ' + payload.parentJobId);
    if (draft.material) meta.push('material: ' + (draft.material.label || draft.material.modelKey || draft.material.model || draft.material.id || draft.material.materialKey));
    if (draft.grid) meta.push('grid: ' + formatGridValue(draft.grid));
    if (draft.run) meta.push('steps: ' + runValue(draft, 'steps') + ' / interval: ' + runValue(draft, 'outputInterval'));
    if (draft.visualization) meta.push('visualization: ' + formatVisualization(draft.visualization));
    const activeViewMode = normalizeActiveFerroViewMode(draft.visualization, structured);
    const modeTabs = renderFerroModeTabs(activeViewMode, payload.jobId || payload.id);
    const timestepTabs = structured && Array.isArray(structured.timesteps) ? structured.timesteps.map((step) => '<span class="ferro-badge">kt=' + escapeHtml(step) + '</span>').join('') : '';
    let imageHtml = '';
    if (structured && Array.isArray(structured.visualizations)) {
      imageHtml = renderFerroGallery(selectVisibleFerroImages(structured, activeViewMode));
    } else {
      imageHtml = legacyFerroAssetGroups(assets);
    }
    const warnings = renderFerroResultWarnings(structured);
    const legend = renderFerroLegend(structured, activeViewMode);
    const chips = Array.isArray(payload.followupChips) ? payload.followupChips : [];
    const chipHtml = chips.map((chip) => '<button type="button" class="ferro-btn ferro-btn-secondary" data-ferro-action="followup_chip" data-chip-action="' + escapeHtml(chip.action || '') + '" data-chip-mode="' + escapeHtml(chip.mode || '') + '" data-chip-component="' + escapeHtml(chip.component || '') + '" data-chip-steps="' + escapeHtml(chip.steps || '') + '">' + renderInlineMarkdown(chip.label || '继续优化') + '</button>').join('');
    return '<section class="chat-inline-card efffield-result-card ferro-result-card"><div class="efffield-result-header"><strong>铁电相场计算结果</strong><span>' + renderInlineMarkdown(summary) + '</span></div>' + (meta.length ? '<div class="ferro-result-meta">' + meta.map((item) => '<span>' + renderInlineMarkdown(item) + '</span>').join('') + '</div>' : '') + '<div class="ferro-mode-tabs">' + modeTabs + '</div>' + (timestepTabs ? '<div class="ferro-timestep-tabs">' + timestepTabs + '</div>' : '') + warnings + legend + '<div class="ferro-result-visualizations">' + imageHtml + '</div>' + (chipHtml ? '<div class="ferro-followup-chips">' + chipHtml + '</div>' : '') + '</section>';
  }

  function normalizeActiveFerroViewMode(visualization, structured) {
    const normalized = normalizeFerroVisualizationView(visualization || {});
    const mode = normalized.mode;
    if (mode === 'component') return { mode: 'component', component: String((visualization && visualization.component) || 'pz').toLowerCase(), overlay: normalized.overlay || { arrows: true } };
    if (mode !== 'component') return { mode, component: null, overlay: normalized.overlay || { arrows: true } };
    const first = structured && Array.isArray(structured.visualizations) ? structured.visualizations[0] : null;
    if (first && first.mode === 'component') return { mode: 'component', component: first.component || 'pz', overlay: { arrows: true } };
    return { mode: first && first.mode || 'component', component: first && first.component || 'pz', overlay: { arrows: true } };
  }

  function selectVisibleFerroImages(result, activeViewMode) {
    const visualizations = result && Array.isArray(result.visualizations) ? result.visualizations : [];
    const view = activeViewMode || { mode: 'component', component: 'pz' };
    const matches = visualizations.filter((img) => {
      const parsed = normalizeVisualizationImage(img);
      if (view.mode === 'component') {
        return parsed.mode === 'component' && parsed.component === view.component;
      }
      return parsed.mode === view.mode;
    });
    const prefersArrows = !view.overlay || view.overlay.arrows !== false;
    if (!prefersArrows) return matches;
    const arrowMatches = matches.filter((img) => {
      const normalized = normalizeFerroVisualizationRecord(img);
      return normalized.overlay && normalized.overlay.arrows === true;
    });
    return arrowMatches.length ? arrowMatches : matches;
  }

  function normalizeVisualizationImage(img) {
    const normalized = normalizeFerroVisualizationRecord({ ...(img || {}), mode: img && img.mode || inferModeFromImage(img) });
    const component = normalized.component ? String(normalized.component).toLowerCase() : inferComponentFromImage(img);
    return { mode: normalizeFerroMode(normalized.mode), component };
  }

  function inferModeFromImage(img) {
    const text = [img && img.label, img && img.url, img && img.name].filter(Boolean).join(' ').toLowerCase();
    if (/variant_111_arrow|八变体\+箭头/.test(text)) return 'variant_111_arrow';
    if (/variant_111|八变体/.test(text)) return 'variant_111';
    if (/inplane_angle_arrow|angle_arrow|面内角度\+箭头|角度\+箭头/.test(text)) return 'inplane_angle_arrow';
    if (/inplane_angle|面内角度/.test(text)) return 'inplane_angle';
    return 'component';
  }

  function inferComponentFromImage(img) {
    const text = [img && img.label, img && img.url, img && img.name].filter(Boolean).join(' ').toLowerCase();
    const match = text.match(/\b(p[xyz])\b|_(p[xyz])\.png/);
    return (match && (match[1] || match[2])) || null;
  }

  function renderFerroModeTabs(activeViewMode, jobId) {
    const active = activeViewMode || {};
    const button = (label, mode, component) => {
      const selected = active.mode === mode && (mode !== 'component' || active.component === component);
      return '<button type="button" class="ferro-btn ferro-btn-secondary' + (selected ? ' is-active' : '') + '" data-ferro-action="set_result_view" data-job-id="' + escapeHtml(jobId || '') + '" data-ferro-view-mode="' + escapeHtml(mode) + '" data-ferro-view-component="' + escapeHtml(component || '') + '">' + renderInlineMarkdown(label) + '</button>';
    };
    return '<div class="ferro-mode-group"><span>显示</span>' + ['px', 'py', 'pz'].map((component) => button(formatComponent(component), 'component', component)).join('') + button('面内', 'inplane_angle', null) + button('R相变体', 'variant_111', null) + '<span class="ferro-overlay-status">箭头：默认显示</span></div>';
  }

  function renderFerroLegend(structured, activeViewMode) {
    const legend = structured && structured.legend;
    if (!legend || !legend.url) return '';
    const mode = normalizeFerroMode(activeViewMode && activeViewMode.mode);
    const legendMode = normalizeFerroMode(legend.mode);
    const showVariantLegend = mode === 'variant_111';
    const showAngleLegend = mode === 'inplane_angle';
    if (legendMode === 'variant_111' && !showVariantLegend) return '';
    if (legendMode === 'inplane_angle' && !showAngleLegend) return '';
    const safeUrl = sanitizeRelativeImageUrl(legend.url);
    if (!safeUrl) return '';
    const label = legend.label || (legendMode === 'variant_111' ? 'R相 <111> 变体' : '面内角度色轮图例');
    return '<a class="ferro-angle-legend" href="' + safeUrl + '" target="_blank" rel="noopener"><img src="' + safeUrl + '" alt="' + escapeHtml(label) + '"><span>' + renderInlineMarkdown(label) + '</span></a>';
  }

  function renderFerroResultWarnings(structured) {
    const warnings = structured && Array.isArray(structured.warnings) ? structured.warnings : [];
    if (!warnings.length) return '';
    return '<aside class="ferro-visualization-warning">' + warnings.map((item) => '<p>' + renderInlineMarkdown(item) + '</p>').join('') + '</aside>';
  }

  function renderFerroGallery(items) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return '<aside class="ferro-visualization-warning">当前显示模式还没有图片。可以切换其他模式，或基于已有 Polar 数据生成该可视化。</aside>';
    const visible = list.slice(0, 8);
    const thumbs = visible.map((item) => renderFerroVisualizationItem(item)).join('');
    const more = list.length > visible.length ? '<details class="ferro-gallery-more"><summary>查看更多（' + escapeHtml(list.length - visible.length) + '）</summary><div class="ferro-result-gallery" data-count="' + escapeHtml(list.length - visible.length) + '">' + list.slice(8).map((item) => renderFerroVisualizationItem(item)).join('') + '</div></details>' : '';
    return '<div class="ferro-result-gallery" data-count="' + escapeHtml(Math.min(list.length, 8)) + '">' + thumbs + '</div>' + more;
  }

  function renderFerroVisualizationItem(item) {
    const safeUrl = sanitizeRelativeImageUrl(item && item.url);
    if (!safeUrl) return '<figure class="efffield-image unavailable"><figcaption>' + renderInlineMarkdown((item && item.label) || '图片') + '</figcaption><div class="efffield-image-missing">图片链接不可用</div></figure>';
    const label = (item && item.label) || '铁电结果图片';
    const projection = Array.isArray(item.projectionComponents) && item.projectionComponents.length ? '<small>箭头：' + item.projectionComponents.map(formatComponent).join('–') + ' 投影</small>' : '';
    const components = Array.isArray(item.components) ? '<small>分量：' + item.components.map(formatComponent).join('–') + '</small>' : '';
    const timestep = item && item.timestep !== undefined ? '<b>kt=' + escapeHtml(item.timestep) + '</b>' : '';
    return '<figure class="ferro-result-thumb"><a href="' + safeUrl + '" target="_blank" rel="noopener"><img loading="lazy" src="' + safeUrl + '" alt="' + escapeHtml(label) + '"></a><figcaption>' + timestep + '<span>' + renderInlineMarkdown(label) + '</span>' + projection + components + '<a class="ferro-download-link" href="' + safeUrl + '" download>下载</a></figcaption></figure>';
  }

  function legacyFerroAssetGroups(assets) {
    const groups = {};
    assets.forEach((asset) => {
      const label = (asset && (asset.title || asset.name || asset.url)) || '';
      const match = String(label).match(/(?:kt|step|Polar\.)[._= -]?(\d+)/i);
      const key = match ? match[1] : 'result';
      groups[key] = groups[key] || [];
      groups[key].push(asset);
    });
    return Object.keys(groups).sort((a, b) => Number(a) - Number(b)).map((key) => {
      const images = groups[key].map((asset) => renderFerroVisualizationItem({ url: asset && asset.url, label: asset && (asset.title || asset.name) })).join('');
      return '<section class="ferro-result-step"><h4><span class="ferro-badge">kt=' + escapeHtml(key) + '</span></h4><div class="efffield-image-grid">' + images + '</div></section>';
    }).join('');
  }


  function formatContent(text, role = 'assistant') {
    if (!text) return '';
    if (typeof text === 'object' && text.type === 'efffield_result') {
      return renderEfffieldResultCard(text);
    }
    if (typeof text === 'object' && text.type === 'efffield_mode_choice') {
      return renderEfffieldModeChoiceCard(text);
    }
    if (typeof text === 'object' && text.type === 'efffield_parameter_panel') {
      return renderEfffieldParameterPanelCard(text.panel || text);
    }
    if (typeof text === 'object' && text.type === 'ferro_result') {
      return renderFerroResultCard(text);
    }
    if (typeof text === 'object' && (text.type === 'ferro_material_recommendations' || text.type === 'ferro_materials')) {
      return renderFerroMaterialRecommendations(text);
    }
    if (typeof text === 'object' && (text.type === 'ferro_draft' || (text.draft && !text.diff))) {
      return renderFerroDraftCard(text.draft || text, text.ui, text.validation);
    }
    if (typeof text === 'object' && (text.type === 'ferro_diff' || (Array.isArray(text.diff) && text.diff.length))) {
      return renderFerroDiffCard(text.diff || [], text.validation) + (text.draft ? renderFerroDraftCard(text.draft, text.ui, text.validation) : '');
    }
    const html = renderMarkdownText(text);
    if (role === 'user') return '<div class="chat-markdown user-markdown">' + html + '</div>';
    return '<div class="chat-markdown assistant-markdown">' + html + '</div>';
  }
  
  async function handleMessageContentClick(event) {
    const btn = event.target.closest && event.target.closest('.code-copy-btn');
    if (!btn) return;
    const code = decodeURIComponent(btn.dataset.copyCode || '');
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(code);
        btn.textContent = '已复制';
        setTimeout(() => { btn.textContent = '复制'; }, 1200);
      }
    } catch (err) {
      console.warn('[copy] failed:', err && err.message);
    }
  }

  const api = {
    escapeHtml,
    renderInlineMarkdown,
    isMarkdownTableStart,
    splitTableRow,
    isNumericLike,
    hasLongTableContent,
    isCompactParameterTable,
    renderMarkdownTable,
    looksLikeWarning,
    looksLikeUnitConversion,
    looksLikeMaterialNote,
    renderMaterialNote,
    renderCodeBlock,
    renderMarkdownText,
    sanitizeRelativeImageUrl,
    renderEfffieldResultCard,
    renderEfffieldModeChoiceCard,
    renderEfffieldParameterPanelCard,
    renderMaterialPresetGrid,
    renderMaterialFamilyCards,
    renderMaterialRecommendationMessage,
    renderFerroDraftCard,
    renderFerroDiffCard,
    buildFerroMaterialCommand,
    renderFerroMaterialRecommendations,
    normalizeActiveFerroViewMode,
    normalizeFerroVisualizationRecord,
    selectVisibleFerroImages,
    renderFerroResultCard,
    formatContent,
    handleMessageContentClick,
  };

  global.PFMChatRenderer = api;
  if (typeof globalThis !== 'undefined') globalThis.PFMChatRenderer = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
