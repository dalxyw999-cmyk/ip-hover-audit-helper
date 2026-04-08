import { loadConfig, isHostAllowed } from './config.js';
import { isEligibleTextNode, wrapTextNodeCustom, wrapTextNodeIps } from './ip-utils.js';
import { extractPhones, PHONE_REVIEW_OPTIONS, formatReviewTime, getPhoneReviewStorageKey } from './phone-utils.js';

const TOOLTIP_ID = 'ip-hover-audit-tooltip';
let tooltipEl;
let hoverTimer = null;
let hideTimer = null;
let activeLookupKey = null;
let settingsCache = null;
let activeTarget = null;

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
          if (isEligibleTextNode(node)) scanTextNode(node);
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
  nodes.forEach((node) => scanTextNode(node));
}

function scanTextNode(node) {
  if (wrapTextNodeIps(node)) return true;
  const phones = extractPhones(node.textContent || '');
  if (!phones.length) return false;
  return wrapTextNodeCustom(node, phones, {
    kind: 'phone',
    ariaLabel: (value) => `核验手机号 ${value}`
  });
}

function bindGlobalEvents() {
  document.addEventListener('mouseover', onPointerEnter, true);
  document.addEventListener('focusin', onPointerEnter, true);
  document.addEventListener('mouseout', onPointerLeave, true);
  document.addEventListener('focusout', onPointerLeave, true);
  document.addEventListener('click', onDocumentClick, true);
}

function onPointerEnter(event) {
  const target = event.target?.closest?.('.ip-hover-audit-wrapper');
  if (!target) return;
  activeTarget = target;
  clearTimeout(hideTimer);
  clearTimeout(hoverTimer);

  if (settingsCache.triggerMode === 'alt-hover' && !event.altKey) {
    if (target.dataset.kind === 'ip') {
      showTooltip(target, buildHintPayload(target.dataset.value));
      return;
    }
  }

  hoverTimer = setTimeout(() => {
    if (target.dataset.kind === 'phone') {
      lookupPhoneAndRender(target);
      return;
    }
    lookupAndRenderIp(target);
  }, Number(settingsCache.hoverDelayMs || 400));
}

function onPointerLeave(event) {
  const target = event.target?.closest?.('.ip-hover-audit-wrapper');
  if (!target) return;
  clearTimeout(hoverTimer);
  hideTimer = setTimeout(() => hideTooltip(), 120);
}

function onDocumentClick(event) {
  const button = event.target?.closest?.('[data-action]');
  if (!button || !tooltipEl || tooltipEl.classList.contains('hidden')) return;

  const { action, phone, verdict } = button.dataset;
  if (action === 'copy-phone' && phone) {
    event.preventDefault();
    copyPhone(phone);
    return;
  }

  if (action === 'save-phone-verdict' && phone && verdict) {
    event.preventDefault();
    savePhoneVerdict(phone, verdict);
  }
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

async function lookupAndRenderIp(target) {
  const ip = target.dataset.value;
  if (!ip) return;
  activeLookupKey = `ip:${ip}`;
  showTooltip(target, buildLoadingPayload(ip));

  try {
    const response = await chrome.runtime.sendMessage({ type: 'LOOKUP_IP', ip });
    if (activeLookupKey !== `ip:${ip}`) return;
    if (!response?.ok) throw new Error(response?.error || '查询失败');
    showTooltip(target, buildResultPayload(response.payload));
  } catch (error) {
    if (activeLookupKey !== `ip:${ip}`) return;
    showTooltip(target, buildErrorPayload(ip, error.message || '查询失败'));
  }
}

async function lookupPhoneAndRender(target) {
  const phone = target.dataset.value;
  if (!phone) return;
  activeLookupKey = `phone:${phone}`;
  showTooltip(target, buildPhoneLoadingPayload(phone));
  const review = await getPhoneReview(phone);
  if (activeLookupKey !== `phone:${phone}`) return;
  showTooltip(target, buildPhonePayload(phone, review));
}

function renderTooltipHtml(payload) {
  const rows = payload.rows.map((row) => `
    <div class="ip-hover-audit-row">
      <span class="label">${escapeHtml(row.label)}</span>
      <span class="value ${row.level ? `level-${row.level}` : ''}">${escapeHtml(row.value)}</span>
    </div>
  `).join('');

  const actionText = payload.actions?.length
    ? `<div class="ip-hover-audit-actions">${payload.actions.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>`
    : '';

  const actionButtons = payload.actionButtons?.length
    ? `<div class="ip-hover-audit-button-row">${payload.actionButtons.map(renderActionButton).join('')}</div>`
    : '';

  return `
    <div class="ip-hover-audit-title">${escapeHtml(payload.title)}</div>
    ${rows}
    ${payload.note ? `<div class="ip-hover-audit-note">${escapeHtml(payload.note)}</div>` : ''}
    ${actionText}
    ${actionButtons}
  `;
}

function renderActionButton(button) {
  const attrs = Object.entries(button.dataset || {}).map(([key, value]) => `data-${toKebabCase(key)}="${escapeHtml(value)}"`).join(' ');
  return `<button type="button" class="ip-hover-audit-button ${button.tone ? `tone-${button.tone}` : ''}" ${attrs}>${escapeHtml(button.label)}</button>`;
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

function buildPhoneLoadingPayload(phone) {
  return {
    title: '手机号核验助手',
    rows: [
      { label: '手机号', value: phone },
      { label: '状态', value: '正在读取历史核验结果...' }
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
  const { classification, source, cacheHit, allResults = [], consensus } = payload;
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
    rows.push({ label: '主结果来源', value: source });
  }

  if (consensus?.text) {
    rows.push({ label: '交叉验证', value: consensus.text, level: levelFromConsensus(consensus.level) });
  }

  if (allResults[1]) {
    rows.push({ label: '备用源结果', value: `${allResults[1].source}：${allResults[1].classification.networkType} / ${allResults[1].classification.riskLevel}风险` });
  }

  rows.push({ label: '缓存状态', value: cacheHit ? '命中本地缓存' : '实时查询' });

  return {
    title: 'IP 信息速查',
    rows,
    note: settingsCache.showReasons ? `判断依据：${classification.reasons.join('；') || '无'}` : '',
    actions: ['双源一致时可信度更高；出现分歧时建议人工复核']
  };
}

function buildPhonePayload(phone, review) {
  const latestVerdict = review?.verdict || '未核验';
  const reviewedAt = review?.updatedAt ? formatReviewTime(review.updatedAt) : '暂无记录';

  return {
    title: '手机号核验助手',
    rows: [
      { label: '手机号', value: phone },
      { label: '微信核验', value: latestVerdict, level: levelFromPhoneVerdict(latestVerdict) },
      { label: '最近更新', value: reviewedAt },
      { label: '外部信息', value: '首版仅保存你的人工核验结果' }
    ],
    note: '先复制手机号去微信加好友核验，再回到这里点一个结果即可。',
    actionButtons: [
      {
        label: '复制手机号',
        tone: 'primary',
        dataset: { action: 'copy-phone', phone }
      },
      ...PHONE_REVIEW_OPTIONS.map((verdict) => ({
        label: verdict,
        tone: latestVerdict === verdict ? 'selected' : 'secondary',
        dataset: { action: 'save-phone-verdict', phone, verdict }
      }))
    ]
  };
}

async function copyPhone(phone) {
  try {
    await navigator.clipboard.writeText(phone);
    flashTooltipNote(`已复制手机号：${phone}`);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = phone;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
    flashTooltipNote(`已复制手机号：${phone}`);
  }
}

async function savePhoneVerdict(phone, verdict) {
  const key = getPhoneReviewStorageKey(phone);
  const payload = {
    phone,
    verdict,
    updatedAt: Date.now()
  };
  await chrome.storage.local.set({ [key]: payload });
  if (activeTarget?.dataset?.value === phone) {
    showTooltip(activeTarget, buildPhonePayload(phone, payload));
  }
}

async function getPhoneReview(phone) {
  const key = getPhoneReviewStorageKey(phone);
  const stored = await chrome.storage.local.get(key);
  return stored[key] || null;
}

function flashTooltipNote(message) {
  const note = tooltipEl?.querySelector('.ip-hover-audit-note');
  if (note) {
    note.textContent = message;
    return;
  }
  const tooltip = ensureTooltip();
  const noteEl = document.createElement('div');
  noteEl.className = 'ip-hover-audit-note';
  noteEl.textContent = message;
  tooltip.appendChild(noteEl);
}

function levelFromRisk(riskLevel) {
  switch (riskLevel) {
    case '高': return 'high';
    case '低': return 'low';
    default: return 'medium';
  }
}

function levelFromPhoneVerdict(verdict) {
  switch (verdict) {
    case '未见异常': return 'low';
    case '疑似异常':
    case '无法添加': return 'high';
    case '待复核': return 'medium';
    default: return 'medium';
  }
}

function levelFromConsensus(level) {
  switch (level) {
    case 'match': return 'low';
    case 'mismatch': return 'high';
    case 'single': return 'medium';
    default: return 'medium';
  }
}

function toKebabCase(text) {
  return text.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

function escapeHtml(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
