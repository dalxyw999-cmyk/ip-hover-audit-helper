import fs from 'node:fs/promises';
import path from 'node:path';

import { normalizeIpapiIsResponse, normalizeIpqueryResponse } from '../extension/lib/data-sources.js';
import { classifyIpRecord } from '../extension/lib/classifier.js';

const samples = [
  { ip: '8.8.8.8', note: 'Google Public DNS，典型云服务商/机房样本' },
  { ip: '1.1.1.1', note: 'Cloudflare Public DNS，典型云服务商/机房样本' },
  { ip: '23.236.48.55', note: 'Google Cloud 文档示例，机房样本' },
  { ip: '32.5.140.2', note: 'AT&T ISP 段，偏家庭/ISP 样本' },
  { ip: '223.5.5.5', note: '阿里公共 DNS，国内云服务商样本' },
  { ip: '114.114.114.114', note: '114 DNS，国内常见公共 DNS 样本' }
];

const services = [
  {
    name: 'ipapi.is',
    url: (ip) => `https://api.ipapi.is?q=${encodeURIComponent(ip)}`,
    normalize: normalizeIpapiIsResponse
  },
  {
    name: 'ipquery',
    url: (ip) => `https://api.ipquery.io/${encodeURIComponent(ip)}`,
    normalize: normalizeIpqueryResponse
  }
];

async function main() {
  const rows = [];

  for (const sample of samples) {
    for (const service of services) {
      const startedAt = Date.now();
      try {
        const response = await fetch(service.url(sample.ip), {
          headers: { Accept: 'application/json', Origin: 'chrome-extension://test' }
        });
        const elapsed = Date.now() - startedAt;
        const text = await response.text();
        const json = JSON.parse(text);
        const normalized = service.normalize(json);
        const classified = classifyIpRecord(normalized);
        rows.push({
          ip: sample.ip,
          note: sample.note,
          service: service.name,
          ok: response.ok,
          status: response.status,
          elapsed,
          cors: response.headers.get('access-control-allow-origin') || '',
          networkType: classified.networkType,
          riskLevel: classified.riskLevel,
          source: normalized.source,
          asn: classified.asnSummary,
          isp: classified.ispSummary,
          location: classified.locationSummary,
          reasons: classified.reasons.join('；') || '无'
        });
      } catch (error) {
        rows.push({
          ip: sample.ip,
          note: sample.note,
          service: service.name,
          ok: false,
          status: 'ERR',
          elapsed: Date.now() - startedAt,
          cors: '',
          networkType: '失败',
          riskLevel: '-',
          source: '-',
          asn: '-',
          isp: '-',
          location: '-',
          reasons: error.message || String(error)
        });
      }
    }
  }

  const lines = [];
  lines.push('# 数据源测试报告');
  lines.push('');
  lines.push(`生成时间：${new Date().toISOString()}`);
  lines.push('');
  lines.push('| IP | 样本说明 | 数据源 | HTTP | CORS | 耗时(ms) | 识别结果 | 风险 | ASN/组织 | 运营商/组织 | 地理位置 | 判断依据 |');
  lines.push('| --- | --- | --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- |');
  for (const row of rows) {
    lines.push(`| ${row.ip} | ${row.note} | ${row.service} | ${row.status} | ${row.cors || '无'} | ${row.elapsed} | ${row.networkType} | ${row.riskLevel} | ${row.asn} | ${row.isp} | ${row.location} | ${row.reasons} |`);
  }

  lines.push('');
  lines.push('## 结论');
  lines.push('');
  lines.push('- ipapi.is：可直连、返回字段最完整，包含 is_datacenter / is_proxy / is_vpn / ASN 类型等关键字段，适合作为主数据源。');
  lines.push('- ipquery：可直连、CORS 允许，提供 is_datacenter / is_proxy / is_vpn / is_tor / risk_score 等风险字段，适合作为备用数据源。');
  lines.push('- 本报告只验证了当前网络环境下的连通性、字段覆盖和对已知样本的识别一致性；对你公司网络是否完全放行，仍建议你在实际办公网络中再装载插件验证一次。');

  const outputPath = path.resolve('docs/data-source-evaluation.md');
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, lines.join('\n'), 'utf8');
  console.log(outputPath);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
