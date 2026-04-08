import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeIpapiIsResponse, normalizeIpqueryResponse } from '../extension/lib/data-sources.js';
import { classifyIpRecord } from '../extension/lib/classifier.js';
import { extractPhones, formatReviewTime, getPhoneReviewStorageKey } from '../extension/lib/phone-utils.js';

test('ipapi.is 机房样本应被标准化并识别为机房', () => {
  const normalized = normalizeIpapiIsResponse({
    ip: '8.8.8.8',
    is_datacenter: true,
    is_proxy: false,
    is_vpn: false,
    is_tor: false,
    is_mobile: false,
    company: { name: 'Google LLC', type: 'hosting', domain: 'google.com' },
    asn: { asn: 15169, org: 'Google LLC', type: 'hosting', route: '8.8.8.0/24' },
    location: { country: 'United States', state: 'California', city: 'Mountain View' }
  });

  const result = classifyIpRecord(normalized);
  assert.equal(normalized.source, 'ipapi.is');
  assert.equal(result.networkType, '机房/数据中心');
  assert.equal(result.riskLevel, '高');
  assert.match(result.reasons.join(' '), /机房|Hosting|数据中心/);
});

test('ipapi.is ISP 样本应偏向家庭/住宅网络', () => {
  const normalized = normalizeIpapiIsResponse({
    ip: '32.5.140.2',
    is_datacenter: false,
    is_proxy: false,
    is_vpn: false,
    is_tor: false,
    is_mobile: false,
    company: { name: 'AT&T Global Network Services, LLC', type: 'isp', domain: 'att.com' },
    asn: { asn: 7018, org: 'AT&T Enterprises, LLC', type: 'isp', route: '32.0.0.0/9' },
    location: { country: 'United States', state: 'Virginia', city: 'Ashburn' }
  });

  const result = classifyIpRecord(normalized);
  assert.equal(result.networkType, '家庭/住宅网络');
  assert.equal(result.riskLevel, '低');
});

test('ipapi.is 代理 VPN 样本应识别为代理/VPN', () => {
  const normalized = normalizeIpapiIsResponse({
    ip: '203.0.113.5',
    is_datacenter: false,
    is_proxy: true,
    is_vpn: true,
    is_tor: false,
    is_mobile: false,
    company: { name: 'Example Privacy', type: 'business', domain: 'example.com' },
    asn: { asn: 64512, org: 'Example Privacy', type: 'business', route: '203.0.113.0/24' },
    location: { country: 'Japan', state: 'Tokyo', city: 'Tokyo' }
  });

  const result = classifyIpRecord(normalized);
  assert.equal(result.networkType, '代理/VPN');
  assert.equal(result.riskLevel, '高');
  assert.match(result.anonymitySummary, /VPN|代理/);
});

test('ipquery 结果应被标准化为统一结构', () => {
  const normalized = normalizeIpqueryResponse({
    ip: '1.1.1.1',
    isp: {
      asn: 'AS13335',
      org: 'Cloudflare, Inc.',
      isp: 'Cloudflare, Inc.'
    },
    location: {
      country: 'Australia',
      state: 'Queensland',
      city: 'South Brisbane'
    },
    risk: {
      is_mobile: false,
      is_vpn: false,
      is_tor: false,
      is_proxy: false,
      is_datacenter: true,
      risk_score: 0
    }
  });

  assert.equal(normalized.source, 'ipquery');
  assert.equal(normalized.location.country, 'Australia');
  assert.equal(normalized.asn.number, 13335);
  assert.equal(normalized.company.name, 'Cloudflare, Inc.');
  assert.equal(normalized.flags.isDatacenter, true);
});

test('手机号提取应只匹配大陆手机号', () => {
  const matches = extractPhones('测试手机号 13800138000，备用 19912345678，座机 075512345678 不应命中');
  assert.deepEqual(matches.map((item) => item.value), ['13800138000', '19912345678']);
});

test('手机号核验记录 key 和时间格式应稳定', () => {
  assert.equal(getPhoneReviewStorageKey('13800138000'), 'phone-review:13800138000');
  assert.match(formatReviewTime(Date.UTC(2026, 3, 8, 1, 5)), /^2026-04-08 \d{2}:05$/);
  assert.equal(formatReviewTime(null), '暂无记录');
});
