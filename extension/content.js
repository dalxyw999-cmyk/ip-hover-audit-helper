const DEFAULT_CONFIG = {
  enabled: true,
  allowedHostsText: '',
  hoverDelayMs: 400,
  cacheTtlHours: 24,
  triggerMode: 'hover',
  preferredSource: 'ipapi.is',
  fallbackSource: 'ipquery',
  enableFallback: true,
  showReasons: true,
  showSource: true
};

const IPV4_REGEX = /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/g;
const MAINLAND_PHONE_REGEX = /\b1[3-9]\d{9}\b/g;
const PHONE_REVIEW_OPTIONS = ['未见异常', '疑似异常', '无法添加', '待复核'];
const TOOLTIP_ID = 'ip-hover-audit-tooltip';

let tooltipEl;
let hoverTimer = null;
let hideTimer = null;
let activeLookupKey = null;
let settingsCache = null;
let activeTarget = null;

bootstrapContentScript().catch((error) => {
  console.error('[IP / 手机号悬停审核助手] 内容脚本加载失败', error);
});

async function bootstrapContentScript() {
  settingsCache = await loadConfig();
  if (!settingsCache.enabled) return;
  if (!isHostAllowed(window.location.hostname, settingsCache)) return;

  scanDocument(document.body);
  observeMutations();
  bindGlobalEvents();
}

async function loadConfig() {
  const stored = await chrome.storage.local.get('settings');
  return { ...DEFAULT_CONFIG, ...(stored.settings || {}) };
}

function parseAllowedHosts(text) {
  return (text || '')
    .split(/\n|,|;/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function isHostAllowed(hostname, settings) {
  const rules = parseAllowedHosts(settings.allowedHostsText);
  if (!rules.length) return true;
  const host = (hostname || '').toLowerCase();
  return rules.some((rule) => host === rule || host.endsWith(`.${rule}`));
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

function extractIps(text) {
  if (!text) return [];
  return [...text.matchAll(IPV4_REGEX)].map((match) => ({
    value: match[0],
    index: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length
  }));
}

function extractPhones(text) {
  if (!text) return [];
  return [...text.matchAll(MAINLAND_PHONE_REGEX)].map((match) => ({
    value: match[0],
    index: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length
  }));
}

function isEligibleTextNode(node) {
  if (!node || node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) return false;
  const parent = node.parentElement;
  if (!parent) return false;
  const tag = parent.tagName;
  if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT'].includes(tag)) return false;
  if (parent.closest('.ip-hover-audit-ignore, .ip-hover-audit-wrapper')) return false;
  return true;
}

function wrapTextNodeIps(node) {
  return wrapTextNodeMatches(node, extractIps(node.textContent || ''), {
    kind: 'ip',
    ariaLabel: (value) => `查询 IP ${value}`
  });
}

function wrapTextNodeCustom(node, matches, options) {
  return wrapTextNodeMatches(node, matches, options);
}

function wrapTextNodeMatches(node, matches, options) {
  if (!matches.length) return false;

  const text = node.textContent || '';
  const fragment = document.createDocumentFragment();
  let lastIndex = 0;

  matches.forEach((match) => {
    if (match.index > lastIndex) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }

    const span = document.createElement('span');
    span.className = 'ip-hover-audit-wrapper';
    span.dataset.kind = options.kind;
    span.dataset.value = match.value;
    span.textContent = match.value;
    span.setAttribute('tabindex', '0');
    span.setAttribute('role', 'button');
    span.setAttribute('aria-label', options.ariaLabel(match.value));
    fragment.appendChild(span);
    lastIndex = match.end;
  });

  if (lastIndex < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
  }

  node.parentNode.replaceChild(fragment, node);
  return true;
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
  const badges = payload.badges?.length
    ? `<div class="ip-hover-audit-badges">${payload.badges.map(renderBadge).join('')}</div>`
    : '';

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
    <div class="ip-hover-audit-header">
      <div class="ip-hover-audit-title-row">
        <div>
          <div class="ip-hover-audit-title">${escapeHtml(payload.title)}</div>
          ${payload.subtitle ? `<div class="ip-hover-audit-subtitle">${escapeHtml(payload.subtitle)}</div>` : ''}
        </div>
      </div>
      ${badges}
    </div>
    <div class="ip-hover-audit-body">
      ${rows}
    </div>
    ${payload.note ? `<div class="ip-hover-audit-note">${escapeHtml(payload.note)}</div>` : ''}
    ${actionText}
    ${actionButtons}
  `;
}

function renderBadge(badge) {
  return `<span class="ip-hover-audit-badge ${badge.level ? `level-${badge.level}` : ''}">${escapeHtml(badge.text)}</span>`;
}

function renderActionButton(button) {
  const attrs = Object.entries(button.dataset || {}).map(([key, value]) => `data-${toKebabCase(key)}="${escapeHtml(value)}"`).join(' ');
  return `<button type="button" class="ip-hover-audit-button ${button.tone ? `tone-${button.tone}` : ''}" ${attrs}>${escapeHtml(button.label)}</button>`;
}

function buildHintPayload(ip) {
  return {
    title: 'IP 信息速查',
    subtitle: ip,
    badges: [
      { text: 'Alt + 悬停触发', level: 'medium' }
    ],
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
    subtitle: ip,
    badges: [
      { text: '查询中', level: 'medium' }
    ],
    rows: [
      { label: 'IP 地址', value: ip },
      { label: '状态', value: '正在查询 IP 信息...' }
    ]
  };
}

function buildPhoneLoadingPayload(phone) {
  return {
    title: '手机号核验助手',
    subtitle: phone,
    badges: [
      { text: '读取中', level: 'medium' }
    ],
    rows: [
      { label: '手机号', value: phone },
      { label: '状态', value: '正在读取历史核验结果...' }
    ]
  };
}

function buildErrorPayload(ip, errorMessage) {
  return {
    title: 'IP 信息速查',
    subtitle: ip,
    badges: [
      { text: '查询失败', level: 'high' }
    ],
    rows: [
      { label: 'IP 地址', value: ip },
      { label: '状态', value: '查询失败', level: 'high' },
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
    { label: 'IP 欺诈值', value: `${classification.fraudScore ?? '未知'} / 100`, level: levelFromFraudScore(classification.fraudScore) },
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
    subtitle: payload.ip,
    badges: [
      { text: classification.networkType, level: levelFromRisk(classification.riskLevel) },
      { text: `${classification.riskLevel}风险`, level: levelFromRisk(classification.riskLevel) },
      { text: `欺诈值 ${classification.fraudScore ?? '未知'}`, level: levelFromFraudScore(classification.fraudScore) }
    ],
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
    subtitle: phone,
    badges: [
      { text: latestVerdict, level: levelFromPhoneVerdict(latestVerdict) }
    ],
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
  const payload = { phone, verdict, updatedAt: Date.now() };
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

function getPhoneReviewStorageKey(phone) {
  return `phone-review:${phone}`;
}

function formatReviewTime(timestamp) {
  if (!timestamp) return '暂无记录';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '暂无记录';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}`;
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

function levelFromFraudScore(score) {
  if (typeof score !== 'number') return 'medium';
  if (score >= 80) return 'high';
  if (score <= 35) return 'low';
  return 'medium';
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
