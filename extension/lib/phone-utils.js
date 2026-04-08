export const MAINLAND_PHONE_REGEX = /\b1[3-9]\d{9}\b/g;

export const PHONE_REVIEW_OPTIONS = [
  '未见异常',
  '疑似异常',
  '无法添加',
  '待复核'
];

export function extractPhones(text) {
  if (!text) return [];
  return [...text.matchAll(MAINLAND_PHONE_REGEX)].map((match) => ({
    value: match[0],
    index: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length
  }));
}

export function getPhoneReviewStorageKey(phone) {
  return `phone-review:${phone}`;
}

export function formatReviewTime(timestamp) {
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
