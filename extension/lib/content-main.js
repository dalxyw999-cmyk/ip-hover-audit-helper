import { loadConfig, isHostAllowed } from './config.js';
import { isEligibleTextNode, wrapTextNodeIps } from './ip-utils.js';

const TOOLTIP_ID = 'ip-hover-audit-tooltip';
let tooltipEl;
let hoverTimer = null;
let hideTimer = null;
let activeIp = null;
let settingsCache = null;

bootstrapContentScript();

export async function bootstrapContentScript() {
  settingsCache = await loadConfig();
  if (!settingsCache.enabled) return;
  if (!isHostAllowed(window.location.hostname, settingsCache)) return;

  scanDocument(document.body);
  observeMutations();
  bindGlobalEvents();
}

function observeMutations() {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          if (isEligibleTextNode(node)) wrapTextNodeIps(node);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          scanDocument(node);
        }
      });
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function scanDocument(root) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (isEligibleTextNode(node)) {
      nodes.push(node);
    }
  }
  nodes.forEach((node) => wrapTextNodeIps(node));
}

function bindGlobalEvents() {
  document.addEventListener('mouseover', onPointerEnter, true);
  document.addEventListener('focusin', onPointerEnter, true);
  document.addEventListener('mouseout', onPointerLeave, true);
  document.addEventListener('focusout', onPointerLeave, true);
}

function onPointerEnter(event) {
  const target = event.target?.closest?.('.ip-hover-audit-wrapper');
  if (!target) return;
  clearTimeout(hideTimer);
  clearTimeout(hoverTimer);

  if (settingsCache.triggerMode === 'alt-hover' && !event.altKey) {
    showTooltip(target, buildHintPayload(target.dataset.ip));
    return;
  }

  hoverTimer = setTimeout(() => {
    lookupAndRender(target);
  }, Number(settingsCache.hoverDelayMs || 400));
}

function onPointerLeave(event) {
  const target = event.target?.closest?.('.ip-hover-audit-wrapper');
  if (!target) return;
  clearTimeout(hoverTimer);
  hideTimer = setTimeout(() => hideTooltip(), 120);
}

function ensureTooltip() {
  if (tooltipEl) return tooltipEl;
  tooltipEl = document.createElement('div');
  tooltipEl.id = TOOLTIP_ID;
  tooltipEl.className = 'ip-hover-audit-tooltip hidden';
  tooltipEl.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  tooltipEl.addEventListener('mouseleave', () => hideTooltip());
  document.documentElement.appendChild(tooltipEl);
  return tooltipEl;
}

function positionTooltip(target) {
  const tooltip = ensureTooltip();
  const rect = target.getBoundingClientRect();
  const top = window.scrollY + rect.bottom + 10;
  const left = window.scrollX + rect.left;
  tooltip.style.top = `${top}px`;
  tooltip.style.left = `${Math.max(12, left)}px`;
}

function showTooltip(target, payload) {
  const tooltip = ensureTooltip();
  tooltip.innerHTML = renderTooltipHtml(payload);
  tooltip.classList.remove('hidden');
  positionTooltip(target);
}

function hideTooltip() {
  if (!tooltipEl) return;
  tooltipEl.classList.add('hidden');
}

async function lookupAndRender(target) {
  const ip = target.dataset.ip;
  if (!ip) return;
  activeIp = ip;
  showTooltip(target, buildLoadingPayload(ip));

  try {
    const response = await chrome.runtime.sendMessage({ type: 'LOOKUP_IP', ip });
    if (activeIp !== ip) return;
    if (!response?.ok) throw new Error(response?.error || '查询失败');
    showTooltip(target, buildResultPayload(response.payload));
  } catch (error) {
    if (activeIp !== ip) return;
    showTooltip(target, buildErrorPayload(ip, error.message || '查询失败'));
  }
}

function renderTooltipHtml(payload) {
  const rows = payload.rows.map((row) => `
    <div class="ip-hover-audit-row">
      <span class="label">${escapeHtml(row.label)}</span>
      <span class="value ${row.level ? `level-${row.level}` : ''}">${escapeHtml(row.value)}</span>
    </div>
  `).join('');

  const actions = payload.actions?.length
    ? `<div class="ip-hover-audit-actions">${payload.actions.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>`
    : '';

  return `
    <div class="ip-hover-audit-title">${escapeHtml(payload.title)}</div>
    ${rows}
    ${payload.note ? `<div class="ip-hover-audit-note">${escapeHtml(payload.note)}</div>` : ''}
    ${actions}
  `;
}

function buildHintPayload(ip) {
  return {
    title: 'IP 信息速查',
    rows: [
      { label: 'IP 地址', value: ip },
      { label: '触发方式', value: '当前为 Alt + 悬停模式' }
    ],
    note: '按住 Alt 键并将鼠标停留在 IP 上，即可发起查询。'
  };
}

function buildLoadingPayload(ip) {
  return {
    title: 'IP 信息速查',
    rows: [
      { label: 'IP 地址', value: ip },
      { label: '状态', value: '正在查询 IP 信息...' }
    ]
  };
}

function buildErrorPayload(ip, errorMessage) {
  return {
    title: 'IP 信息速查',
    rows: [
      { label: 'IP 地址', value: ip },
      { label: '状态', value: '查询失败' },
      { label: '原因', value: errorMessage }
    ],
    note: '你可以在扩展设置页切换主数据源或调整域名白名单。'
  };
}

function buildResultPayload(payload) {
  const { classification, normalized, source, cacheHit } = payload;
  const rows = [
    { label: 'IP 地址', value: payload.ip },
    { label: '网络属性', value: classification.networkType, level: levelFromRisk(classification.riskLevel) },
    { label: '风险等级', value: classification.riskLevel, level: levelFromRisk(classification.riskLevel) },
    { label: '匿名属性', value: classification.anonymitySummary },
    { label: '国家/地区', value: classification.locationSummary },
    { label: 'ASN', value: classification.asnSummary },
    { label: '运营商', value: classification.ispSummary },
    { label: '组织名称', value: classification.companySummary }
  ];

  if (settingsCache.showSource) {
    rows.push({ label: '数据来源', value: source });
  }

  rows.push({ label: '缓存状态', value: cacheHit ? '命中本地缓存' : '实时查询' });

  return {
    title: 'IP 信息速查',
    rows,
    note: settingsCache.showReasons ? `判断依据：${classification.reasons.join('；') || '无'}` : '',
    actions: ['可在扩展设置页调整数据源、缓存和触发方式']
  };
}

function levelFromRisk(riskLevel) {
  switch (riskLevel) {
    case '高': return 'high';
    case '低': return 'low';
    default: return 'medium';
  }
}

function escapeHtml(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
