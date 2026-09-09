import { describe, expect, it } from 'vitest';
import { escapeTooltipText, sanitizeTooltipHtml } from './tooltipHtml';

describe('tooltip HTML boundary', () => {
  it('escapes every HTML-significant character in external text', () => {
    expect(escapeTooltipText(`<img src=x onerror="bad()">'&`))
      .toBe('&lt;img src=x onerror=&quot;bad()&quot;&gt;&#39;&amp;');
  });

  it('keeps intended bold and line breaks while neutralizing other elements and attributes', () => {
    const safe = sanitizeTooltipHtml('<b onclick="bad()">Title</b><br/><img src=x onerror="bad()">');
    expect(safe).toContain('<b>Title</b><br>');
    expect(safe).not.toContain('onclick');
    expect(document.createRange().createContextualFragment(safe).querySelector('img')).toBeNull();
  });
});
