const CLOUD_KEYWORDS = [
  'google', 'cloudflare', 'amazon', 'aws', 'azure', 'microsoft', 'digitalocean', 'linode', 'vultr', 'oracle', 'ovh',
  'aliyun', 'alibaba cloud', 'tencent cloud', 'huawei cloud', 'ucloud', 'baidu', 'volcengine', 'akamai'
];

function includesKeyword(text, keywords) {
  const value = String(text || '').toLowerCase();
  return keywords.some((keyword) => value.includes(keyword));
}

function normalizeAsnType(type, orgName) {
  const value = String(type || '').toLowerCase();
  if (value) return value;
  if (includesKeyword(orgName, CLOUD_KEYWORDS)) return 'hosting';
  return 'unknown';
}

export function normalizeIpapiIsResponse(data) {
  if (!data?.ip) {
    throw new Error('ipapi.is 返回缺少 ip 字段');
  }

  return {
    source: 'ipapi.is',
    raw: data,
    ip: data.ip,
    flags: {
      isDatacenter: Boolean(data.is_datacenter || data.datacenter),
      isProxy: Boolean(data.is_proxy),
      isVpn: Boolean(data.is_vpn || data.vpn),
      isTor: Boolean(data.is_tor),
      isMobile: Boolean(data.is_mobile),
      isCrawler: Boolean(data.is_crawler),
      isBogon: Boolean(data.is_bogon),
      isAbuser: Boolean(data.is_abuser)
    },
    location: {
      country: data.location?.country || '',
      region: data.location?.state || '',
      city: data.location?.city || ''
    },
    asn: {
      number: data.asn?.asn || null,
      org: data.asn?.org || data.company?.name || '',
      type: normalizeAsnType(data.asn?.type, data.asn?.org || data.company?.name),
      route: data.asn?.route || ''
    },
    company: {
      name: data.company?.name || data.asn?.org || '',
      type: normalizeAsnType(data.company?.type || data.asn?.type, data.company?.name || data.asn?.org),
      domain: data.company?.domain || data.asn?.domain || ''
    },
    provider: data.company?.name || data.asn?.org || '',
    isp: data.company?.name || data.asn?.org || '',
    privacy: {
      proxy: Boolean(data.is_proxy),
      vpn: Boolean(data.is_vpn || data.vpn),
      tor: Boolean(data.is_tor)
    },
    risk: {
      score: null
    }
  };
}

export function normalizeIpqueryResponse(data) {
  if (!data?.ip) {
    throw new Error('ipquery 返回缺少 ip 字段');
  }

  const org = data.isp?.org || '';
  const isp = data.isp?.isp || org;
  const asnRaw = data.isp?.asn || '';
  const asnNumber = Number(String(asnRaw).replace(/^AS/i, '')) || null;
  return {
    source: 'ipquery',
    raw: data,
    ip: data.ip,
    flags: {
      isDatacenter: Boolean(data.risk?.is_datacenter) || includesKeyword(`${org} ${isp}`, CLOUD_KEYWORDS),
      isProxy: Boolean(data.risk?.is_proxy),
      isVpn: Boolean(data.risk?.is_vpn),
      isTor: Boolean(data.risk?.is_tor),
      isMobile: Boolean(data.risk?.is_mobile),
      isCrawler: false,
      isBogon: false,
      isAbuser: false
    },
    location: {
      country: data.location?.country || '',
      region: data.location?.state || '',
      city: data.location?.city || ''
    },
    asn: {
      number: asnNumber,
      org,
      type: normalizeAsnType('', `${org} ${isp}`),
      route: ''
    },
    company: {
      name: isp,
      type: normalizeAsnType('', `${org} ${isp}`),
      domain: ''
    },
    provider: isp,
    isp,
    privacy: {
      proxy: Boolean(data.risk?.is_proxy),
      vpn: Boolean(data.risk?.is_vpn),
      tor: Boolean(data.risk?.is_tor)
    },
    risk: {
      score: Number.isFinite(Number(data.risk?.risk_score)) ? Number(data.risk.risk_score) : null
    }
  };
}

export const DATA_SOURCE_ADAPTERS = {
  'ipapi.is': {
    label: 'ipapi.is',
    async fetch(ip) {
      const response = await fetch(`https://api.ipapi.is?q=${encodeURIComponent(ip)}`, {
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) {
        throw new Error(`ipapi.is 请求失败：${response.status}`);
      }
      return normalizeIpapiIsResponse(await response.json());
    }
  },
  ipquery: {
    label: 'ipquery',
    async fetch(ip) {
      const response = await fetch(`https://api.ipquery.io/${encodeURIComponent(ip)}`, {
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) {
        throw new Error(`ipquery 请求失败：${response.status}`);
      }
      return normalizeIpqueryResponse(await response.json());
    }
  }
};

export function buildSourceOrder(settings) {
  const order = [settings.preferredSource];
  if (settings.enableFallback && settings.fallbackSource && settings.fallbackSource !== settings.preferredSource) {
    order.push(settings.fallbackSource);
  }
  return order.filter((item) => DATA_SOURCE_ADAPTERS[item]);
}
