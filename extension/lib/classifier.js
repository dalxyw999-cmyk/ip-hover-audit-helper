const DATACENTER_KEYWORDS = [
  'cloud', 'google', 'amazon', 'aws', 'azure', 'microsoft', 'digitalocean', 'linode', 'vultr', 'oracle', 'ovh',
  'aliyun', 'alibaba', 'tencent', 'huawei', 'ucloud', 'baidu', 'volcengine', 'akamai', 'cloudflare', 'idc', 'hosting'
];

const RESIDENTIAL_KEYWORDS = [
  'telecom', 'unicom', 'mobile', 'broadband', 'comcast', 'charter', 'cox', 'att', 'verizon', 'rogers', 'bell',
  'shaw', 'residential', 'consumer', 'wanadoo', 'telefonica', 'orange', 'vodafone', 'deutsche telekom', 'bt',
  'china telecom', 'china unicom', 'china mobile', 'centurylink', 'frontier'
];

const BUSINESS_KEYWORDS = ['enterprise', 'business', 'corp', 'corporation', 'company'];

function contains(text, keywords) {
  const value = String(text || '').toLowerCase();
  return keywords.some((keyword) => value.includes(keyword));
}

function joinFacts(record) {
  return [
    record.asn?.org,
    record.company?.name,
    record.provider,
    record.isp,
    record.company?.domain,
    record.asn?.type,
    record.company?.type
  ]
    .filter(Boolean)
    .join(' | ');
}

export function classifyIpRecord(record) {
  const facts = joinFacts(record);
  const reasons = [];
  const flags = record.flags || {};
  const privacy = record.privacy || {};

  if (privacy.tor || flags.isTor) {
    reasons.push('命中 TOR 标签');
    return buildResult('代理/VPN', '高', 'TOR 网络', reasons, record, 98);
  }

  if (privacy.vpn || privacy.proxy || flags.isVpn || flags.isProxy) {
    if (privacy.vpn || flags.isVpn) reasons.push('命中 VPN 标签');
    if (privacy.proxy || flags.isProxy) reasons.push('命中代理标签');
    return buildResult('代理/VPN', '高', '代理或 VPN', reasons, record, 90);
  }

  if (flags.isDatacenter || contains(facts, DATACENTER_KEYWORDS) || record.asn?.type === 'hosting' || record.company?.type === 'hosting') {
    reasons.push('命中机房/云服务商特征');
    return buildResult('机房/数据中心', '高', '机房/数据中心', reasons, record, 76);
  }

  if (flags.isMobile) {
    reasons.push('命中移动网络标签');
    return buildResult('移动网络', '中', '移动网络', reasons, record, 48);
  }

  if (record.asn?.type === 'isp' || record.company?.type === 'isp' || contains(facts, RESIDENTIAL_KEYWORDS)) {
    reasons.push('命中 ISP/家庭宽带特征');
    return buildResult('家庭/住宅网络', '低', '未发现明显代理特征', reasons, record, 22);
  }

  if (contains(facts, BUSINESS_KEYWORDS) || record.company?.type === 'business') {
    reasons.push('更像企业网络而非家庭宽带');
    return buildResult('企业网络', '中', '企业网络', reasons, record, 42);
  }

  reasons.push('数据源信息不足，建议复核');
  return buildResult('未知', '中', '暂无法明确判断', reasons, record, 55);
}

function buildResult(networkType, riskLevel, anonymitySummary, reasons, record, baseFraudScore) {
  return {
    ip: record.ip,
    source: record.source,
    networkType,
    riskLevel,
    anonymitySummary,
    reasons,
    fraudScore: computeFraudScore(baseFraudScore, record),
    locationSummary: [record.location?.country, record.location?.region, record.location?.city].filter(Boolean).join(' / ') || '未知',
    asnSummary: record.asn?.number ? `AS${record.asn.number} ${record.asn.org || ''}`.trim() : (record.asn?.org || '未知'),
    ispSummary: record.isp || record.provider || record.company?.name || '未知',
    companySummary: record.company?.name || record.asn?.org || '未知'
  };
}

function computeFraudScore(baseFraudScore, record) {
  const rawSourceScore = record.risk?.score;
  const sourceScore = rawSourceScore === null || rawSourceScore === undefined ? null : Number(rawSourceScore);
  if (Number.isFinite(sourceScore)) {
    return clampScore(Math.round(baseFraudScore * 0.35 + sourceScore * 0.65));
  }
  return clampScore(baseFraudScore);
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}
