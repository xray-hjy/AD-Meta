/** @param {unknown} value */
export function escapeTooltipText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** @param {unknown} value */
export function sanitizeTooltipHtml(value) {
  const template = document.createElement('template');
  template.innerHTML = String(value ?? '');
  template.content.querySelectorAll('*').forEach(element => {
    if (element.tagName === 'B' || element.tagName === 'BR') {
      [...element.attributes].forEach(attribute => element.removeAttribute(attribute.name));
      return;
    }
    element.replaceWith(document.createTextNode(element.outerHTML));
  });
  return template.innerHTML;
}
