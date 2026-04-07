export const IPV4_REGEX = /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/g;

export function extractIps(text) {
  if (!text) return [];
  return [...text.matchAll(IPV4_REGEX)].map((match) => ({
    value: match[0],
    index: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length
  }));
}

export function isEligibleTextNode(node) {
  if (!node || node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) return false;
  const parent = node.parentElement;
  if (!parent) return false;
  const tag = parent.tagName;
  if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT'].includes(tag)) return false;
  if (parent.closest('.ip-hover-audit-ignore, .ip-hover-audit-wrapper')) return false;
  return true;
}

export function wrapTextNodeIps(node) {
  const text = node.textContent || '';
  const matches = extractIps(text);
  if (!matches.length) return false;

  const fragment = document.createDocumentFragment();
  let lastIndex = 0;

  matches.forEach((match) => {
    if (match.index > lastIndex) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }

    const span = document.createElement('span');
    span.className = 'ip-hover-audit-wrapper';
    span.dataset.ip = match.value;
    span.textContent = match.value;
    span.setAttribute('tabindex', '0');
    span.setAttribute('role', 'button');
    span.setAttribute('aria-label', `查询 IP ${match.value}`);
    fragment.appendChild(span);
    lastIndex = match.end;
  });

  if (lastIndex < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
  }

  node.parentNode.replaceChild(fragment, node);
  return true;
}
