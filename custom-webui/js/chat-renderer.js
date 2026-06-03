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
  
  function formatContent(text, role = 'assistant') {
    if (!text) return '';
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
    formatContent,
    handleMessageContentClick,
  };

  global.PFMChatRenderer = api;
  if (typeof globalThis !== 'undefined') globalThis.PFMChatRenderer = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
