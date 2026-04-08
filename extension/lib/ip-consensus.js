export function summarizeIpConsensus(results) {
  const valid = (results || []).filter(Boolean);
  if (!valid.length) {
    return {
      level: 'unknown',
      text: '无可用结果'
    };
  }

  if (valid.length === 1) {
    return {
      level: 'single',
      text: `仅 ${valid[0].source} 返回结果，建议人工复核`
    };
  }

  const [first, ...rest] = valid;
  const sameNetworkType = rest.every((item) => item.classification?.networkType === first.classification?.networkType);
  const sameRiskLevel = rest.every((item) => item.classification?.riskLevel === first.classification?.riskLevel);

  if (sameNetworkType && sameRiskLevel) {
    return {
      level: 'match',
      text: `双源一致：${first.classification?.networkType} / ${first.classification?.riskLevel}风险`
    };
  }

  return {
    level: 'mismatch',
    text: '双源分歧：建议人工复核'
  };
}
