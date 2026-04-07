import { cacheTtlMs, loadConfig } from './lib/config.js';
import { buildSourceOrder, DATA_SOURCE_ADAPTERS } from './lib/data-sources.js';
import { classifyIpRecord } from './lib/classifier.js';

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await loadConfig();
  await chrome.storage.local.set({ settings });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'LOOKUP_IP') return false;

  lookupIp(message.ip)
    .then((payload) => sendResponse({ ok: true, payload }))
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));

  return true;
});

async function lookupIp(ip) {
  if (!ip) throw new Error('缺少 IP 地址');

  const settings = await loadConfig();
  const cacheKey = `ip-cache:${ip}`;
  const now = Date.now();
  const ttl = cacheTtlMs(settings);
  const cached = await chrome.storage.local.get(cacheKey);
  const cachedEntry = cached[cacheKey];

  if (cachedEntry && now - cachedEntry.timestamp < ttl) {
    return { ...cachedEntry.payload, cacheHit: true };
  }

  const errors = [];
  for (const sourceName of buildSourceOrder(settings)) {
    try {
      const normalized = await DATA_SOURCE_ADAPTERS[sourceName].fetch(ip);
      const classification = classifyIpRecord(normalized);
      const payload = {
        ip,
        source: normalized.source,
        normalized,
        classification,
        queriedAt: now,
        cacheHit: false
      };
      await chrome.storage.local.set({
        [cacheKey]: {
          timestamp: now,
          payload
        }
      });
      return payload;
    } catch (error) {
      errors.push(`${sourceName}: ${error.message || String(error)}`);
    }
  }

  throw new Error(errors.length ? `全部数据源均失败：${errors.join('；')}` : '未配置可用数据源');
}
