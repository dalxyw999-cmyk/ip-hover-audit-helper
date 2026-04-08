import { DEFAULT_CONFIG, loadConfig, saveConfig } from './lib/config.js';

const form = document.getElementById('settings-form');
const statusEl = document.getElementById('status');
const clearCacheButton = document.getElementById('clear-cache');

init().catch((error) => {
  statusEl.textContent = `初始化失败：${error.message || String(error)}`;
});

async function init() {
  const settings = await loadConfig();
  fillForm(settings);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const settings = {
    enabled: Boolean(formData.get('enabled')),
    allowedHostsText: String(formData.get('allowedHostsText') || ''),
    hoverDelayMs: Number(formData.get('hoverDelayMs') || DEFAULT_CONFIG.hoverDelayMs),
    cacheTtlHours: Number(formData.get('cacheTtlHours') || DEFAULT_CONFIG.cacheTtlHours),
    triggerMode: String(formData.get('triggerMode') || DEFAULT_CONFIG.triggerMode),
    preferredSource: String(formData.get('preferredSource') || DEFAULT_CONFIG.preferredSource),
    fallbackSource: String(formData.get('fallbackSource') || DEFAULT_CONFIG.fallbackSource),
    enableFallback: Boolean(formData.get('enableFallback')),
    showReasons: Boolean(formData.get('showReasons')),
    showSource: Boolean(formData.get('showSource'))
  };

  await saveConfig(settings);
  setStatus('设置已保存。重新打开目标页面后生效。');
});

clearCacheButton.addEventListener('click', async () => {
  const all = await chrome.storage.local.get(null);
  const cacheKeys = Object.keys(all).filter((key) => key.startsWith('ip-cache:') || key.startsWith('phone-review:'));
  if (cacheKeys.length) {
    await chrome.storage.local.remove(cacheKeys);
  }
  setStatus(`本地记录已清空，共删除 ${cacheKeys.length} 条记录。`);
});

function fillForm(settings) {
  form.enabled.checked = settings.enabled;
  form.allowedHostsText.value = settings.allowedHostsText;
  form.hoverDelayMs.value = settings.hoverDelayMs;
  form.cacheTtlHours.value = settings.cacheTtlHours;
  form.triggerMode.value = settings.triggerMode;
  form.preferredSource.value = settings.preferredSource;
  form.fallbackSource.value = settings.fallbackSource;
  form.enableFallback.checked = settings.enableFallback;
  form.showReasons.checked = settings.showReasons;
  form.showSource.checked = settings.showSource;
}

function setStatus(text) {
  statusEl.textContent = text;
  setTimeout(() => {
    if (statusEl.textContent === text) {
      statusEl.textContent = '';
    }
  }, 3000);
}
