export const DEFAULT_CONFIG = {
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

export async function loadConfig() {
  const stored = await chrome.storage.local.get('settings');
  return { ...DEFAULT_CONFIG, ...(stored.settings || {}) };
}

export async function saveConfig(settings) {
  const merged = { ...DEFAULT_CONFIG, ...settings };
  await chrome.storage.local.set({ settings: merged });
  return merged;
}

export function parseAllowedHosts(text) {
  return (text || '')
    .split(/\n|,|;/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function isHostAllowed(hostname, settings) {
  const rules = parseAllowedHosts(settings.allowedHostsText);
  if (!rules.length) return true;
  const host = (hostname || '').toLowerCase();
  return rules.some((rule) => host === rule || host.endsWith(`.${rule}`));
}

export function cacheTtlMs(settings) {
  return Math.max(1, Number(settings.cacheTtlHours || DEFAULT_CONFIG.cacheTtlHours)) * 3600 * 1000;
}
